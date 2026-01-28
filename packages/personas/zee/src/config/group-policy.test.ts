import { describe, it, expect } from "vitest";
import {
  resolveChannelGroupPolicy,
  resolveChannelGroupToolsPolicy,
  resolveSenderToolsPolicy,
} from "./group-policy.js";
import type { ZeeConfig } from "./config.js";

describe("resolveSenderToolsPolicy", () => {
  const baseConfig: ZeeConfig = {
    channels: {
      telegram: {
        groups: {
          "group123": {
            requireMention: true,
            tools: {
              allow: ["exec", "memory_search"],
              deny: ["dangerous_tool"],
            },
            senders: {
              "user456": {
                allow: ["extra_tool"],
                deny: ["exec"], // Override group allow
              },
              "admin789": {
                allow: ["*"],
              },
            },
          },
        },
      },
    },
  };

  it("returns group policy when no sender ID provided", () => {
    const result = resolveSenderToolsPolicy({
      cfg: baseConfig,
      channel: "telegram",
      groupId: "group123",
      senderId: null,
    });

    expect(result).toEqual({
      allow: ["exec", "memory_search"],
      deny: ["dangerous_tool"],
    });
  });

  it("returns group policy when sender not in config", () => {
    const result = resolveSenderToolsPolicy({
      cfg: baseConfig,
      channel: "telegram",
      groupId: "group123",
      senderId: "unknown_user",
    });

    expect(result).toEqual({
      allow: ["exec", "memory_search"],
      deny: ["dangerous_tool"],
    });
  });

  it("merges sender allow with group allow", () => {
    const result = resolveSenderToolsPolicy({
      cfg: baseConfig,
      channel: "telegram",
      groupId: "group123",
      senderId: "user456",
    });

    // Sender's extra_tool should be added
    expect(result?.allow).toContain("extra_tool");
    expect(result?.allow).toContain("exec");
    expect(result?.allow).toContain("memory_search");
  });

  it("merges sender deny with group deny", () => {
    const result = resolveSenderToolsPolicy({
      cfg: baseConfig,
      channel: "telegram",
      groupId: "group123",
      senderId: "user456",
    });

    // Sender's exec deny should be added to dangerous_tool
    expect(result?.deny).toContain("exec");
    expect(result?.deny).toContain("dangerous_tool");
  });

  it("handles case-insensitive sender lookup", () => {
    const result = resolveSenderToolsPolicy({
      cfg: baseConfig,
      channel: "telegram",
      groupId: "group123",
      senderId: "USER456", // uppercase
    });

    // Should still find user456
    expect(result?.allow).toContain("extra_tool");
  });

  it("returns undefined when no group config", () => {
    const result = resolveSenderToolsPolicy({
      cfg: baseConfig,
      channel: "telegram",
      groupId: "nonexistent_group",
      senderId: "user456",
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined when no channel config", () => {
    const result = resolveSenderToolsPolicy({
      cfg: baseConfig,
      channel: "whatsapp",
      groupId: "group123",
      senderId: "user456",
    });

    expect(result).toBeUndefined();
  });

  it("handles sender with only allow list", () => {
    const config: ZeeConfig = {
      channels: {
        telegram: {
          groups: {
            "group1": {
              tools: { deny: ["dangerous"] },
              senders: {
                "poweruser": {
                  allow: ["special_tool"],
                },
              },
            },
          },
        },
      },
    };

    const result = resolveSenderToolsPolicy({
      cfg: config,
      channel: "telegram",
      groupId: "group1",
      senderId: "poweruser",
    });

    expect(result?.allow).toContain("special_tool");
    expect(result?.deny).toContain("dangerous");
  });

  it("handles sender with only deny list", () => {
    const config: ZeeConfig = {
      channels: {
        telegram: {
          groups: {
            "group1": {
              tools: { allow: ["exec"] },
              senders: {
                "restricted": {
                  deny: ["exec"], // Restrict exec for this user
                },
              },
            },
          },
        },
      },
    };

    const result = resolveSenderToolsPolicy({
      cfg: config,
      channel: "telegram",
      groupId: "group1",
      senderId: "restricted",
    });

    expect(result?.allow).toContain("exec");
    expect(result?.deny).toContain("exec");
    // Note: deny takes precedence in actual tool filtering
  });

  it("uses default group config when specific group not found", () => {
    const config: ZeeConfig = {
      channels: {
        telegram: {
          groups: {
            "*": {
              tools: { allow: ["default_tool"] },
              senders: {
                "user1": {
                  allow: ["sender_tool"],
                },
              },
            },
          },
        },
      },
    };

    const result = resolveSenderToolsPolicy({
      cfg: config,
      channel: "telegram",
      groupId: "any_group",
      senderId: "user1",
    });

    expect(result?.allow).toContain("default_tool");
    expect(result?.allow).toContain("sender_tool");
  });
});

describe("resolveChannelGroupPolicy", () => {
  it("returns allowlist enabled when groups configured", () => {
    const config: ZeeConfig = {
      channels: {
        telegram: {
          groups: {
            "group1": { requireMention: true },
          },
        },
      },
    };

    const result = resolveChannelGroupPolicy({
      cfg: config,
      channel: "telegram",
      groupId: "group1",
    });

    expect(result.allowlistEnabled).toBe(true);
    expect(result.allowed).toBe(true);
  });

  it("returns not allowed for unlisted group", () => {
    const config: ZeeConfig = {
      channels: {
        telegram: {
          groups: {
            "group1": { requireMention: true },
          },
        },
      },
    };

    const result = resolveChannelGroupPolicy({
      cfg: config,
      channel: "telegram",
      groupId: "group2",
    });

    expect(result.allowlistEnabled).toBe(true);
    expect(result.allowed).toBe(false);
  });

  it("allows all groups when * is configured", () => {
    const config: ZeeConfig = {
      channels: {
        telegram: {
          groups: {
            "*": { requireMention: false },
          },
        },
      },
    };

    const result = resolveChannelGroupPolicy({
      cfg: config,
      channel: "telegram",
      groupId: "any_group",
    });

    expect(result.allowlistEnabled).toBe(true);
    expect(result.allowed).toBe(true);
  });
});

describe("resolveChannelGroupToolsPolicy", () => {
  it("returns tools from specific group config", () => {
    const config: ZeeConfig = {
      channels: {
        telegram: {
          groups: {
            "group1": {
              tools: { allow: ["exec"], deny: ["dangerous"] },
            },
          },
        },
      },
    };

    const result = resolveChannelGroupToolsPolicy({
      cfg: config,
      channel: "telegram",
      groupId: "group1",
    });

    expect(result).toEqual({ allow: ["exec"], deny: ["dangerous"] });
  });

  it("falls back to default group config", () => {
    const config: ZeeConfig = {
      channels: {
        telegram: {
          groups: {
            "*": {
              tools: { deny: ["default_denied"] },
            },
          },
        },
      },
    };

    const result = resolveChannelGroupToolsPolicy({
      cfg: config,
      channel: "telegram",
      groupId: "unknown_group",
    });

    expect(result).toEqual({ deny: ["default_denied"] });
  });

  it("returns undefined when no tools configured", () => {
    const config: ZeeConfig = {
      channels: {
        telegram: {
          groups: {
            "group1": { requireMention: true },
          },
        },
      },
    };

    const result = resolveChannelGroupToolsPolicy({
      cfg: config,
      channel: "telegram",
      groupId: "group1",
    });

    expect(result).toBeUndefined();
  });
});
