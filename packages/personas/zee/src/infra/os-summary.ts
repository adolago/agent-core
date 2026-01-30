import os from "node:os";

export type OsSummary = {
  platform: NodeJS.Platform;
  arch: string;
  release: string;
  label: string;
};

export function resolveOsSummary(): OsSummary {
  const platform = os.platform();
  const release = os.release();
  const arch = os.arch();
  const label = (() => {
    if (platform === "win32") return `windows ${release} (${arch})`;
    if (platform === "darwin") return `darwin ${release} (${arch})`;
    return `${platform} ${release} (${arch})`;
  })();
  return { platform, arch, release, label };
}
