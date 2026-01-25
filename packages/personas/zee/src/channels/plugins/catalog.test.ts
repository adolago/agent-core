import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getChannelPluginCatalogEntry, listChannelPluginCatalogEntries } from "./catalog.js";

describe("channel plugin catalog", () => {
  it("lists plugin catalog entries from external catalog", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zee-catalog-"));
    const catalogPath = path.join(dir, "catalog.json");
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        entries: [
          {
            name: "@zee/test-channel",
            zee: {
              channel: {
                id: "test-channel",
                label: "Test Channel",
                selectionLabel: "Test Channel",
                docsPath: "/channels/test-channel",
                blurb: "Test entry",
                order: 999,
                aliases: ["test"],
              },
              install: {
                npmSpec: "@zee/test-channel",
              },
            },
          },
        ],
      }),
    );

    const entry = getChannelPluginCatalogEntry("test-channel", { catalogPaths: [catalogPath] });
    expect(entry?.install.npmSpec).toBe("@zee/test-channel");
    expect(entry?.meta.aliases).toContain("test");

    const ids = listChannelPluginCatalogEntries({ catalogPaths: [catalogPath] }).map(
      (entry) => entry.id,
    );
    expect(ids).toContain("test-channel");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("includes external catalog entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zee-catalog-"));
    const catalogPath = path.join(dir, "catalog.json");
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        entries: [
          {
            name: "@zee/demo-channel",
            zee: {
              channel: {
                id: "demo-channel",
                label: "Demo Channel",
                selectionLabel: "Demo Channel",
                docsPath: "/channels/demo-channel",
                blurb: "Demo entry",
                order: 999,
              },
              install: {
                npmSpec: "@zee/demo-channel",
              },
            },
          },
        ],
      }),
    );

    const ids = listChannelPluginCatalogEntries({ catalogPaths: [catalogPath] }).map(
      (entry) => entry.id,
    );
    expect(ids).toContain("demo-channel");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
