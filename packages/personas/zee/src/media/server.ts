import fs from "node:fs/promises";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { danger } from "../globals.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { SafeOpenError, isValidMediaId, openFileWithinRoot } from "../security/fs-safe.js";
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

    if (!isValidMediaId(id)) {
      res.status(400).send("invalid path");
      return;
    }

    try {
      const { handle, realPath, stat } = await openFileWithinRoot({
        rootDir: mediaDir,
        relativePath: id,
      });

      let closed = false;
      const closeHandle = async () => {
        if (closed) return;
        closed = true;
        await handle.close().catch(() => {});
      };

      try {
        if (stat.size > MAX_MEDIA_BYTES) {
          await closeHandle();
          res.status(413).send("too large");
          return;
        }

        if (Date.now() - stat.mtimeMs > ttlMs) {
          // Close before deletion for better cross-platform behavior.
          await closeHandle();
          await fs.rm(realPath).catch(() => {});
          res.status(410).send("expired");
          return;
        }

        const data = await handle.readFile();
        const mime = await detectMime({ buffer: data, filePath: realPath });
        if (mime) res.type(mime);
        res.send(data);

        // best-effort single-use cleanup after response ends
        res.on("finish", () => {
          setTimeout(() => {
            fs.rm(realPath).catch(() => {});
          }, 50);
        });
      } finally {
        await closeHandle();
      }
    } catch (err) {
      if (err instanceof SafeOpenError) {
        if (err.code === "invalid-path") {
          res.status(400).send("invalid path");
          return;
        }
        if (err.code === "not-found") {
          res.status(404).send("not found");
          return;
        }
      }
      res.status(404).send("not found");
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
