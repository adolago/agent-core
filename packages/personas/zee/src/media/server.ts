import fs from "node:fs/promises";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { danger } from "../globals.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { isValidMediaId, resolveMediaPath, safeReadFile } from "../security/fs-safe.js";
import { detectMime } from "./mime.js";
import { cleanOldMedia, getMediaDir, MEDIA_MAX_BYTES } from "./store.js";

const DEFAULT_TTL_MS = 2 * 60 * 1000;
const MAX_MEDIA_BYTES = MEDIA_MAX_BYTES;

export function attachMediaRoutes(
  app: Express,
  ttlMs = DEFAULT_TTL_MS,
  _runtime: RuntimeEnv = defaultRuntime,
) {
  const mediaDir = getMediaDir();

  app.get("/media/:id", async (req, res) => {
    const id = req.params.id;

    // Validate media ID format before any filesystem operations
    if (!isValidMediaId(id)) {
      res.status(400).send("invalid path");
      return;
    }

    try {
      // Safely resolve the media path (validates within mediaDir)
      const filePath = await resolveMediaPath(mediaDir, id);

      // Check expiration before reading (stat via lstat to avoid symlink follow)
      const lstat = await fs.lstat(filePath);
      if (Date.now() - lstat.mtimeMs > ttlMs) {
        await fs.rm(filePath).catch(() => {});
        res.status(410).send("expired");
        return;
      }

      // Safely read file with symlink protection and size limits
      const result = await safeReadFile(filePath, {
        maxSize: MAX_MEDIA_BYTES,
        rootDir: mediaDir,
      });

      const mime = await detectMime({ buffer: result.data, filePath });
      if (mime) res.type(mime);
      res.send(result.data);

      // best-effort single-use cleanup after response ends
      res.on("finish", () => {
        setTimeout(() => {
          fs.rm(filePath).catch(() => {});
        }, 50);
      });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("symlink") || msg.includes("traversal") || msg.includes("invalid media")) {
        res.status(400).send("invalid path");
      } else if (msg.includes("too large")) {
        res.status(413).send("too large");
      } else {
        res.status(404).send("not found");
      }
    }
  });

  // periodic cleanup
  setInterval(() => {
    void cleanOldMedia(ttlMs);
  }, ttlMs).unref();
}

export async function startMediaServer(
  port: number,
  ttlMs = DEFAULT_TTL_MS,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<Server> {
  const app = express();
  attachMediaRoutes(app, ttlMs, runtime);
  return await new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.once("listening", () => resolve(server));
    server.once("error", (err) => {
      runtime.error(danger(`Media server failed: ${String(err)}`));
      reject(err);
    });
  });
}
