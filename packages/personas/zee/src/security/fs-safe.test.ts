import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  isValidMediaId,
  safeReadFile,
  resolveMediaPath,
} from "./fs-safe.js";

describe("isValidMediaId", () => {
  it("accepts valid alphanumeric IDs", () => {
    expect(isValidMediaId("abc123")).toBe(true);
    expect(isValidMediaId("file_name")).toBe(true);
    expect(isValidMediaId("file-name")).toBe(true);
    expect(isValidMediaId("file.txt")).toBe(true);
  });

  it("rejects empty or invalid IDs", () => {
    expect(isValidMediaId("")).toBe(false);
    expect(isValidMediaId(null as unknown as string)).toBe(false);
    expect(isValidMediaId(undefined as unknown as string)).toBe(false);
  });

  it("rejects path traversal patterns", () => {
    expect(isValidMediaId("..")).toBe(false);
    expect(isValidMediaId("../secret")).toBe(false);
    expect(isValidMediaId("foo/bar")).toBe(false);
    expect(isValidMediaId("foo\\bar")).toBe(false);
    expect(isValidMediaId("foo/../bar")).toBe(false);
  });

  it("rejects special characters", () => {
    expect(isValidMediaId("file@name")).toBe(false);
    expect(isValidMediaId("file$name")).toBe(false);
    expect(isValidMediaId("file name")).toBe(false);
    expect(isValidMediaId("file\0name")).toBe(false);
  });

  it("rejects very long IDs", () => {
    const longId = "a".repeat(256);
    expect(isValidMediaId(longId)).toBe(false);
  });
});

describe("safeReadFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-safe-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("reads regular files successfully", async () => {
    const filePath = path.join(tempDir, "test.txt");
    const content = "Hello, World!";
    await fs.writeFile(filePath, content);

    const result = await safeReadFile(filePath);
    expect(result.data.toString()).toBe(content);
    expect(result.size).toBe(content.length);
  });

  it("rejects symlinks", async () => {
    const realFile = path.join(tempDir, "real.txt");
    const symlink = path.join(tempDir, "link.txt");

    await fs.writeFile(realFile, "secret content");
    await fs.symlink(realFile, symlink);

    await expect(safeReadFile(symlink)).rejects.toThrow("symlink not allowed");
  });

  it("rejects relative paths", async () => {
    await expect(safeReadFile("relative/path.txt")).rejects.toThrow(
      "absolute path",
    );
  });

  it("rejects files outside root directory", async () => {
    const outsideFile = path.join(os.tmpdir(), "outside.txt");
    await fs.writeFile(outsideFile, "outside content");

    try {
      await expect(
        safeReadFile(outsideFile, { rootDir: tempDir }),
      ).rejects.toThrow("path traversal");
    } finally {
      await fs.rm(outsideFile, { force: true });
    }
  });

  it("rejects files exceeding size limit", async () => {
    const largeFile = path.join(tempDir, "large.txt");
    const largeContent = Buffer.alloc(1024 * 1024); // 1MB
    await fs.writeFile(largeFile, largeContent);

    await expect(
      safeReadFile(largeFile, { maxSize: 1024 }), // 1KB limit
    ).rejects.toThrow("file too large");
  });

  it("handles non-existent files", async () => {
    await expect(
      safeReadFile(path.join(tempDir, "nonexistent.txt")),
    ).rejects.toThrow();
  });
});

describe("resolveMediaPath", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "media-path-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("resolves valid media IDs", async () => {
    const resolved = await resolveMediaPath(tempDir, "valid-file.txt");
    expect(resolved).toBe(path.join(tempDir, "valid-file.txt"));
  });

  it("rejects invalid media IDs", async () => {
    await expect(resolveMediaPath(tempDir, "../etc/passwd")).rejects.toThrow(
      "invalid media id",
    );
    await expect(resolveMediaPath(tempDir, "foo/bar")).rejects.toThrow(
      "invalid media id",
    );
  });

  it("rejects path traversal attempts", async () => {
    // Even if somehow the ID validation is bypassed, path check should catch it
    await expect(resolveMediaPath(tempDir, "..")).rejects.toThrow();
  });
});
