/**
 * Safe File System Operations
 *
 * Provides hardened file operations that prevent common attack vectors:
 * - Symlink following (TOCTOU race conditions)
 * - Path traversal attacks
 * - File size denial of service
 * - Media ID injection
 *
 * @module security/fs-safe
 */

import fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { constants as fsConstants, type Stats } from "node:fs";
import path from "node:path";

const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Pattern for valid media IDs - only alphanumeric, dash, underscore, dot
 * This prevents path traversal via encoded characters or special sequences
 */
const VALID_MEDIA_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export type SafeReadResult = {
  data: Buffer;
  size: number;
  inode: bigint;
};

export type SafeReadOptions = {
  /** Maximum file size in bytes (default: 50MB) */
  maxSize?: number;
  /** Root directory the file must be within */
  rootDir?: string;
};

export type SafeOpenErrorCode = "invalid-path" | "not-found";

export class SafeOpenError extends Error {
  code: SafeOpenErrorCode;

  constructor(code: SafeOpenErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "SafeOpenError";
  }
}

export type SafeOpenResult = {
  handle: FileHandle;
  realPath: string;
  stat: Stats;
};

const NOT_FOUND_CODES = new Set(["ENOENT", "ENOTDIR"]);

const ensureTrailingSep = (value: string) => (value.endsWith(path.sep) ? value : value + path.sep);

const isNodeError = (err: unknown): err is NodeJS.ErrnoException =>
  Boolean(err && typeof err === "object" && "code" in (err as Record<string, unknown>));

const isNotFoundError = (err: unknown) =>
  isNodeError(err) && typeof err.code === "string" && NOT_FOUND_CODES.has(err.code);

const isSymlinkOpenError = (err: unknown) =>
  isNodeError(err) && (err.code === "ELOOP" || err.code === "EINVAL" || err.code === "ENOTSUP");

export async function openFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
}): Promise<SafeOpenResult> {
  let rootReal: string;
  try {
    rootReal = await fs.realpath(params.rootDir);
  } catch (err) {
    if (isNotFoundError(err)) {
      throw new SafeOpenError("not-found", "root dir not found");
    }
    throw err;
  }

  const rootWithSep = ensureTrailingSep(rootReal);
  const resolved = path.resolve(rootWithSep, params.relativePath);
  if (!resolved.startsWith(rootWithSep)) {
    throw new SafeOpenError("invalid-path", "path escapes root");
  }

  const supportsNoFollow =
    process.platform !== "win32" && "O_NOFOLLOW" in (fsConstants as Record<string, unknown>);
  const flags =
    fsConstants.O_RDONLY |
    (supportsNoFollow ? (fsConstants as unknown as { O_NOFOLLOW: number }).O_NOFOLLOW : 0);

  let handle: FileHandle;
  try {
    handle = await fs.open(resolved, flags);
  } catch (err) {
    if (isNotFoundError(err)) {
      throw new SafeOpenError("not-found", "file not found");
    }
    if (isSymlinkOpenError(err)) {
      throw new SafeOpenError("invalid-path", "symlink open blocked");
    }
    throw err;
  }

  try {
    const lstat = await fs.lstat(resolved).catch(() => null);
    if (lstat?.isSymbolicLink()) {
      throw new SafeOpenError("invalid-path", "symlink not allowed");
    }

    const realPath = await fs.realpath(resolved);
    if (!realPath.startsWith(rootWithSep)) {
      throw new SafeOpenError("invalid-path", "path escapes root");
    }

    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new SafeOpenError("invalid-path", "not a file");
    }

    const realStat = await fs.stat(realPath);
    if (stat.ino !== realStat.ino || stat.dev !== realStat.dev) {
      throw new SafeOpenError("invalid-path", "path mismatch");
    }

    return { handle, realPath, stat };
  } catch (err) {
    await handle.close().catch(() => {});
    if (err instanceof SafeOpenError) throw err;
    if (isNotFoundError(err)) {
      throw new SafeOpenError("not-found", "file not found");
    }
    throw err;
  }
}

/**
 * Validates a media ID contains only safe characters.
 * Prevents path traversal via encoded or special characters.
 *
 * @param id - The media ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidMediaId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  if (id.length === 0 || id.length > 255) return false;

  // Reject path traversal patterns
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    return false;
  }

  return VALID_MEDIA_ID_PATTERN.test(id);
}

/**
 * Safely read a file with protection against:
 * - Symlink TOCTOU races (checks inode consistency)
 * - Path traversal (validates within root)
 * - Large file DoS (enforces size limit)
 *
 * Uses fs.open() with O_NOFOLLOW equivalent behavior via pre/post inode checks.
 * Node.js doesn't expose O_NOFOLLOW directly on all platforms, so we use
 * inode verification before and after to detect symlink swaps.
 *
 * @param filePath - Absolute path to read
 * @param options - Read options
 * @returns File data with metadata
 * @throws Error if file is symlink, outside root, too large, or inode changes
 */
export async function safeReadFile(
  filePath: string,
  options?: SafeReadOptions,
): Promise<SafeReadResult> {
  const maxSize = options?.maxSize ?? DEFAULT_MAX_FILE_SIZE;
  const rootDir = options?.rootDir;

  // 1. Validate path is absolute
  if (!path.isAbsolute(filePath)) {
    throw new Error("safeReadFile requires absolute path");
  }

  // 2. Verify file is within root directory (if specified)
  if (rootDir) {
    const resolvedRoot = await fs.realpath(rootDir);
    const resolvedPath = path.resolve(filePath);

    // Check before realpath (catch obvious traversal)
    if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
      throw new Error("path traversal detected: file outside root");
    }
  }

  // 3. Check if file is a symlink using lstat
  const lstat = await fs.lstat(filePath);
  if (lstat.isSymbolicLink()) {
    throw new Error("symlink not allowed");
  }

  // 4. Capture initial inode
  const initialInode = lstat.ino;
  const initialDev = lstat.dev;

  // 5. Check file size before reading
  if (lstat.size > maxSize) {
    throw new Error(`file too large: ${lstat.size} bytes exceeds ${maxSize} limit`);
  }

  // 6. Open file and verify it's not a symlink via file handle stat
  let handle: fs.FileHandle | undefined;
  try {
    // Open for reading - on Linux with O_NOFOLLOW this would fail on symlink
    // but Node doesn't always support O_NOFOLLOW, so we rely on inode check
    handle = await fs.open(filePath, fsConstants.O_RDONLY);

    // Get stat from the open file handle
    const handleStat = await handle.stat();

    // 7. Verify inode matches (detect race condition where symlink was created)
    if (handleStat.ino !== initialInode || handleStat.dev !== initialDev) {
      throw new Error("inode changed: possible symlink race detected");
    }

    // 8. Double-check size from handle (paranoid check)
    if (handleStat.size > maxSize) {
      throw new Error(`file too large: ${handleStat.size} bytes exceeds ${maxSize} limit`);
    }

    // 9. Read file content via handle
    const data = await handle.readFile();

    // 10. Final inode verification after read
    const finalStat = await handle.stat();
    if (finalStat.ino !== initialInode || finalStat.dev !== initialDev) {
      throw new Error("inode changed during read: possible symlink race");
    }

    return {
      data,
      size: data.length,
      inode: BigInt(finalStat.ino),
    };
  } finally {
    await handle?.close();
  }
}

/**
 * Resolves a media file path safely, validating the media ID and
 * ensuring the resulting path is within the allowed directory.
 *
 * @param mediaDir - Base media directory
 * @param mediaId - Media identifier to resolve
 * @returns Absolute path to the media file
 * @throws Error if mediaId is invalid or path escapes mediaDir
 */
export async function resolveMediaPath(mediaDir: string, mediaId: string): Promise<string> {
  // Validate media ID format
  if (!isValidMediaId(mediaId)) {
    throw new Error("invalid media id: contains illegal characters");
  }

  // Resolve the media directory to its real path
  const realMediaDir = await fs.realpath(mediaDir);

  // Construct the file path
  const filePath = path.join(realMediaDir, mediaId);

  // Verify the constructed path is still within the media directory
  const resolvedFilePath = path.resolve(filePath);
  if (
    !resolvedFilePath.startsWith(realMediaDir + path.sep) &&
    resolvedFilePath !== realMediaDir
  ) {
    throw new Error("path traversal detected: file outside media directory");
  }

  return resolvedFilePath;
}
