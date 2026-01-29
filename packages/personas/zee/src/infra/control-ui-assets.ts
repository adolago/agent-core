import fs from "node:fs";
import path from "node:path";

export type EnsureControlUiAssetsResult = {
  ok: boolean;
  built: boolean;
  message?: string;
};

export async function ensureControlUiAssetsBuilt(): Promise<EnsureControlUiAssetsResult> {
  return { ok: true, built: false };
}

function hasControlUiMarkers(dir: string): boolean {
  try {
    const pkg = path.join(dir, "package.json");
    const viteTs = path.join(dir, "ui", "vite.config.ts");
    const viteMjs = path.join(dir, "ui", "vite.config.mjs");
    return (fs.existsSync(pkg) && fs.existsSync(viteTs)) || (fs.existsSync(pkg) && fs.existsSync(viteMjs));
  } catch {
    return false;
  }
}

export function resolveControlUiRepoRoot(argv1?: string): string | null {
  if (!argv1) return null;
  let current = path.resolve(path.dirname(argv1));
  for (;;) {
    if (hasControlUiMarkers(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function resolveControlUiDistIndexPath(argv1?: string): string | null {
  if (!argv1) return null;
  const distDir = path.resolve(path.dirname(argv1));
  return path.join(distDir, "control-ui", "index.html");
}
