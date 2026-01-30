import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_BOOTSTRAP_FILENAME } from "../agents/workspace.js";
import * as config from "../config/config.js";
import * as onboardHelpers from "../commands/onboard-helpers.js";
import type { RuntimeEnv } from "../runtime.js";
import { runOnboardingWizard } from "./onboarding.js";
import type { WizardPrompter } from "./prompts.js";

let setupChannels: ReturnType<typeof vi.fn>;
let setupSkills: ReturnType<typeof vi.fn>;
let healthCommand: ReturnType<typeof vi.fn>;
let ensureWorkspaceAndSessions: ReturnType<typeof vi.fn>;
let writeConfigFile: ReturnType<typeof vi.fn>;
let readConfigFileSnapshot: ReturnType<typeof vi.fn>;
let ensureSystemdUserLingerInteractive: ReturnType<typeof vi.fn>;
let isSystemdUserServiceAvailable: ReturnType<typeof vi.fn>;
let runAgentCoreTui: ReturnType<typeof vi.fn>;

vi.mock("../commands/onboard-channels.js", () => ({
  setupChannels: (setupChannels = vi.fn(async (cfg) => cfg)),
}));

vi.mock("../commands/onboard-skills.js", () => ({
  setupSkills: (setupSkills = vi.fn(async (cfg) => cfg)),
}));

vi.mock("../commands/health.js", () => ({
  healthCommand: (healthCommand = vi.fn(async () => {})),
}));

vi.mock("../commands/systemd-linger.js", () => ({
  ensureSystemdUserLingerInteractive: (ensureSystemdUserLingerInteractive = vi.fn(async () => {})),
}));

vi.mock("../daemon/systemd.js", () => ({
  isSystemdUserServiceAvailable: (isSystemdUserServiceAvailable = vi.fn(async () => true)),
}));

vi.mock("../tui/agent-core-tui.js", () => ({
  runAgentCoreTui: (runAgentCoreTui = vi.fn(async () => {})),
}));

describe("runOnboardingWizard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    readConfigFileSnapshot = vi
      .spyOn(config, "readConfigFileSnapshot")
      .mockResolvedValue({ exists: false, valid: true, config: {} });
    writeConfigFile = vi.spyOn(config, "writeConfigFile").mockResolvedValue();
    ensureWorkspaceAndSessions = vi
      .spyOn(onboardHelpers, "ensureWorkspaceAndSessions")
      .mockResolvedValue();
    vi.spyOn(onboardHelpers, "detectBrowserOpenSupport").mockResolvedValue({ ok: false });
    vi.spyOn(onboardHelpers, "openUrl").mockResolvedValue(true);
    vi.spyOn(onboardHelpers, "printWizardHeader").mockImplementation(() => {});
    vi.spyOn(onboardHelpers, "probeGatewayReachable").mockResolvedValue({ ok: true });
    vi.spyOn(onboardHelpers, "resolveGatewayUrls").mockReturnValue({
      httpUrl: "http://127.0.0.1:18789",
      wsUrl: "ws://127.0.0.1:18789",
    });
    vi.spyOn(onboardHelpers, "waitForGatewayReachable").mockResolvedValue({ ok: true });
    vi.spyOn(onboardHelpers, "handleReset").mockResolvedValue();
  });

  it("exits when config is invalid", async () => {
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.zee/zee.json",
      exists: true,
      raw: "{}",
      parsed: {},
      valid: false,
      config: {},
      issues: [{ path: "routing.allowFrom", message: "Legacy key" }],
      legacyIssues: [{ path: "routing.allowFrom", message: "Legacy key" }],
    });

    const select: WizardPrompter["select"] = vi.fn(async () => "quickstart");
    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await expect(
      runOnboardingWizard(
        {
          acceptRisk: true,
          flow: "quickstart",
          authChoice: "skip",
          installDaemon: false,
          skipProviders: true,
          skipSkills: true,
          skipHealth: true,
          skipUi: true,
        },
        runtime,
        prompter,
      ),
    ).rejects.toThrow("exit:1");

    expect(select).not.toHaveBeenCalled();
    expect(prompter.outro).toHaveBeenCalled();
  });

  it("skips prompts and setup steps when flags are set", async () => {
    const select: WizardPrompter["select"] = vi.fn(async () => "quickstart");
    const multiselect: WizardPrompter["multiselect"] = vi.fn(async () => []);
    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect,
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };
    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await runOnboardingWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        authChoice: "skip",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(select).not.toHaveBeenCalled();
    expect(setupChannels).not.toHaveBeenCalled();
    expect(setupSkills).not.toHaveBeenCalled();
    expect(healthCommand).not.toHaveBeenCalled();
    expect(runAgentCoreTui).not.toHaveBeenCalled();
  });

  it("launches TUI without auto-delivery when hatching", async () => {
    runAgentCoreTui.mockClear();

    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "zee-onboard-"));
    await fs.writeFile(path.join(workspaceDir, DEFAULT_BOOTSTRAP_FILENAME), "{}");

    const select: WizardPrompter["select"] = vi.fn(async (opts) => {
      if (opts.message === "How do you want to hatch your bot?") return "tui";
      return "quickstart";
    });

    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await runOnboardingWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        mode: "local",
        workspace: workspaceDir,
        authChoice: "skip",
        skipProviders: true,
        skipSkills: true,
        skipHealth: true,
        installDaemon: false,
      },
      runtime,
      prompter,
    );

    expect(runAgentCoreTui).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Wake up, my friend!",
      }),
      runtime,
    );

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("offers TUI hatch even without BOOTSTRAP.md", async () => {
    runAgentCoreTui.mockClear();

    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "zee-onboard-"));

    const select: WizardPrompter["select"] = vi.fn(async (opts) => {
      if (opts.message === "How do you want to hatch your bot?") return "tui";
      return "quickstart";
    });

    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await runOnboardingWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        mode: "local",
        workspace: workspaceDir,
        authChoice: "skip",
        skipProviders: true,
        skipSkills: true,
        skipHealth: true,
        installDaemon: false,
      },
      runtime,
      prompter,
    );

    expect(runAgentCoreTui).toHaveBeenCalledWith(
      expect.objectContaining({
        message: undefined,
      }),
      runtime,
    );

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("shows the web search hint at the end of onboarding", async () => {
    const prevBraveKey = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;

    try {
      const note: WizardPrompter["note"] = vi.fn(async () => {});
      const prompter: WizardPrompter = {
        intro: vi.fn(async () => {}),
        outro: vi.fn(async () => {}),
        note,
        select: vi.fn(async () => "quickstart"),
        multiselect: vi.fn(async () => []),
        text: vi.fn(async () => ""),
        confirm: vi.fn(async () => false),
        progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
      };

      const runtime: RuntimeEnv = {
        log: vi.fn(),
        error: vi.fn(),
        exit: vi.fn(),
      };

      await runOnboardingWizard(
        {
          acceptRisk: true,
          flow: "quickstart",
          authChoice: "skip",
          installDaemon: false,
          skipProviders: true,
          skipSkills: true,
          skipHealth: true,
          skipUi: true,
        },
        runtime,
        prompter,
      );

      const calls = (note as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some((call) => call?.[1] === "Web search (optional)")).toBe(true);
    } finally {
      if (prevBraveKey === undefined) {
        delete process.env.BRAVE_API_KEY;
      } else {
        process.env.BRAVE_API_KEY = prevBraveKey;
      }
    }
  });
});
