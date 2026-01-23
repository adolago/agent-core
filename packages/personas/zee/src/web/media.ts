import fs from "node:fs/promises";
import path from "node:path";
import { isIP } from "node:net";
import dns from "node:dns/promises";
import { fileURLToPath } from "node:url";

import { logVerbose, shouldLogVerbose } from "../globals.js";
import {
  type MediaKind,
  maxBytesForKind,
  mediaKindFromMime,
} from "../media/constants.js";
import { resizeToJpeg } from "../media/image-ops.js";
import { detectMime, extensionForMime } from "../media/mime.js";

type WebMediaResult = {
  buffer: Buffer;
  contentType?: string;
  kind: MediaKind;
  fileName?: string;
};

type WebMediaOptions = {
  maxBytes?: number;
  optimizeImages?: boolean;
};

const LOCAL_MEDIA_ROOT = process.env.ZEE_MEDIA_LOCAL_ROOT;
const ALLOW_PRIVATE_URLS = process.env.ZEE_MEDIA_ALLOW_PRIVATE_URLS === "true";
const ALLOW_LOCAL_PATHS = process.env.ZEE_MEDIA_ALLOW_LOCAL_PATHS === "true";

function isPrivateIp(ip: string): boolean {
  const ipVersion = isIP(ip);
  if (ipVersion === 4) {
    const [a, b] = ip.split(".").map((part) => Number(part));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    return false;
  }
  if (ipVersion === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fe80")) return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("::ffff:")) {
      return isPrivateIp(normalized.replace("::ffff:", ""));
    }
  }
  return false;
}

async function assertSafeRemoteUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) media URLs are allowed");
  }

  if (ALLOW_PRIVATE_URLS) return;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("Localhost media URLs are blocked");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error("Private network media URLs are blocked");
    }
    return;
  }

  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error("Private network media URLs are blocked");
  }
}

async function fetchWithSafeRedirects(
  url: URL,
  maxRedirects: number = 3,
): Promise<{ response: Response; finalUrl: URL }> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i += 1) {
    await assertSafeRemoteUrl(current);
    const response = await fetch(current.toString(), { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect response missing location header");
      }
      current = new URL(location, current);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error("Too many redirects while fetching media");
}

function resolveLocalMediaPath(rawPath: string): string {
  if (!ALLOW_LOCAL_PATHS) {
    throw new Error("Local media paths are disabled");
  }
  const baseDir = path.resolve(LOCAL_MEDIA_ROOT || process.cwd());
  const resolved = path.resolve(baseDir, rawPath);
  const relative = path.relative(baseDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Local media path is outside the allowed root");
  }
  return resolved;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function parseContentDispositionFileName(
  header?: string | null,
): string | undefined {
  if (!header) return undefined;
  const starMatch = /filename\*\s*=\s*([^;]+)/i.exec(header);
  if (starMatch?.[1]) {
    const cleaned = stripQuotes(starMatch[1].trim());
    const encoded = cleaned.split("''").slice(1).join("''") || cleaned;
    try {
      return path.basename(decodeURIComponent(encoded));
    } catch {
      return path.basename(encoded);
    }
  }
  const match = /filename\s*=\s*([^;]+)/i.exec(header);
  if (match?.[1]) return path.basename(stripQuotes(match[1].trim()));
  return undefined;
}

async function loadWebMediaInternal(
  mediaUrl: string,
  options: WebMediaOptions = {},
): Promise<WebMediaResult> {
  const { maxBytes, optimizeImages = true } = options;
  const trimmed = mediaUrl.trim();
  if (trimmed.startsWith("file://")) {
    mediaUrl = fileURLToPath(trimmed);
  } else {
    mediaUrl = trimmed;
  }

  const optimizeAndClampImage = async (buffer: Buffer, cap: number) => {
    const originalSize = buffer.length;
    const optimized = await optimizeImageToJpeg(buffer, cap);
    if (optimized.optimizedSize < originalSize && shouldLogVerbose()) {
      logVerbose(
        `Optimized media from ${(originalSize / (1024 * 1024)).toFixed(2)}MB to ${(optimized.optimizedSize / (1024 * 1024)).toFixed(2)}MB (side≤${optimized.resizeSide}px, q=${optimized.quality})`,
      );
    }
    if (optimized.buffer.length > cap) {
      throw new Error(
        `Media could not be reduced below ${(cap / (1024 * 1024)).toFixed(0)}MB (got ${(
          optimized.buffer.length / (1024 * 1024)
        ).toFixed(2)}MB)`,
      );
    }
    return {
      buffer: optimized.buffer,
      contentType: "image/jpeg",
      kind: "image" as const,
    };
  };

  if (/^https?:\/\//i.test(mediaUrl)) {
    let fileNameFromUrl: string | undefined;
    const url = new URL(mediaUrl);
    const { response: res, finalUrl } = await fetchWithSafeRedirects(url);
    const base = path.basename(finalUrl.pathname);
    fileNameFromUrl = base || undefined;
    if (!res.ok || !res.body) {
      throw new Error(`Failed to fetch media: HTTP ${res.status}`);
    }
    const array = Buffer.from(await res.arrayBuffer());
    const headerFileName = parseContentDispositionFileName(
      res.headers.get("content-disposition"),
    );
    let fileName = headerFileName || fileNameFromUrl || undefined;
    const filePathForMime =
      headerFileName && path.extname(headerFileName)
        ? headerFileName
        : finalUrl.toString();
    const contentType = await detectMime({
      buffer: array,
      headerMime: res.headers.get("content-type"),
      filePath: filePathForMime,
    });
    if (fileName && !path.extname(fileName) && contentType) {
      const ext = extensionForMime(contentType);
      if (ext) fileName = `${fileName}${ext}`;
    }
    const kind = mediaKindFromMime(contentType);
    const cap = Math.min(
      maxBytes ?? maxBytesForKind(kind),
      maxBytesForKind(kind),
    );
    if (kind === "image") {
      // Skip optimization for GIFs to preserve animation.
      if (contentType === "image/gif" || !optimizeImages) {
        if (array.length > cap) {
          throw new Error(
            `${
              contentType === "image/gif" ? "GIF" : "Media"
            } exceeds ${(cap / (1024 * 1024)).toFixed(0)}MB limit (got ${(
              array.length / (1024 * 1024)
            ).toFixed(2)}MB)`,
          );
        }
        return { buffer: array, contentType, kind, fileName };
      }
      return { ...(await optimizeAndClampImage(array, cap)), fileName };
    }
    if (array.length > cap) {
      throw new Error(
        `Media exceeds ${(cap / (1024 * 1024)).toFixed(0)}MB limit (got ${(
          array.length / (1024 * 1024)
        ).toFixed(2)}MB)`,
      );
    }
    return {
      buffer: array,
      contentType: contentType ?? undefined,
      kind,
      fileName,
    };
  }

  // Local path
  const localPath = resolveLocalMediaPath(mediaUrl);
  const data = await fs.readFile(localPath);
  const mime = await detectMime({ buffer: data, filePath: localPath });
  const kind = mediaKindFromMime(mime);
  let fileName = path.basename(localPath) || undefined;
  if (fileName && !path.extname(fileName) && mime) {
    const ext = extensionForMime(mime);
    if (ext) fileName = `${fileName}${ext}`;
  }
  const cap = Math.min(
    maxBytes ?? maxBytesForKind(kind),
    maxBytesForKind(kind),
  );
  if (kind === "image") {
    // Skip optimization for GIFs to preserve animation.
    if (mime === "image/gif" || !optimizeImages) {
      if (data.length > cap) {
        throw new Error(
          `${
            mime === "image/gif" ? "GIF" : "Media"
          } exceeds ${(cap / (1024 * 1024)).toFixed(0)}MB limit (got ${(
            data.length / (1024 * 1024)
          ).toFixed(2)}MB)`,
        );
      }
      return { buffer: data, contentType: mime, kind, fileName };
    }
    return { ...(await optimizeAndClampImage(data, cap)), fileName };
  }
  if (data.length > cap) {
    throw new Error(
      `Media exceeds ${(cap / (1024 * 1024)).toFixed(0)}MB limit (got ${(
        data.length / (1024 * 1024)
      ).toFixed(2)}MB)`,
    );
  }
  return { buffer: data, contentType: mime, kind, fileName };
}

export async function loadWebMedia(
  mediaUrl: string,
  maxBytes?: number,
): Promise<WebMediaResult> {
  return await loadWebMediaInternal(mediaUrl, {
    maxBytes,
    optimizeImages: true,
  });
}

export async function loadWebMediaRaw(
  mediaUrl: string,
  maxBytes?: number,
): Promise<WebMediaResult> {
  return await loadWebMediaInternal(mediaUrl, {
    maxBytes,
    optimizeImages: false,
  });
}

export async function optimizeImageToJpeg(
  buffer: Buffer,
  maxBytes: number,
): Promise<{
  buffer: Buffer;
  optimizedSize: number;
  resizeSide: number;
  quality: number;
}> {
  // Try a grid of sizes/qualities until under the limit.
  const sides = [2048, 1536, 1280, 1024, 800];
  const qualities = [80, 70, 60, 50, 40];
  let smallest: {
    buffer: Buffer;
    size: number;
    resizeSide: number;
    quality: number;
  } | null = null;

  for (const side of sides) {
    for (const quality of qualities) {
      const out = await resizeToJpeg({
        buffer,
        maxSide: side,
        quality,
        withoutEnlargement: true,
      });
      const size = out.length;
      if (!smallest || size < smallest.size) {
        smallest = { buffer: out, size, resizeSide: side, quality };
      }
      if (size <= maxBytes) {
        return {
          buffer: out,
          optimizedSize: size,
          resizeSide: side,
          quality,
        };
      }
    }
  }

  if (smallest) {
    return {
      buffer: smallest.buffer,
      optimizedSize: smallest.size,
      resizeSide: smallest.resizeSide,
      quality: smallest.quality,
    };
  }

  throw new Error("Failed to optimize image");
}
