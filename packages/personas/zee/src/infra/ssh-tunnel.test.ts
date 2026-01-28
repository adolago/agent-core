import { describe, expect, it } from "vitest";

import { parseSshTarget } from "./ssh-tunnel.js";

describe("ssh tunnel target parsing", () => {
  it("parses user@host:port", () => {
    expect(parseSshTarget("user@example.com:2222")).toEqual({
      user: "user",
      host: "example.com",
      port: 2222,
    });
  });

  it("parses host with default port", () => {
    expect(parseSshTarget("example.com")).toEqual({ user: undefined, host: "example.com", port: 22 });
  });

  it("rejects targets containing whitespace or flags", () => {
    expect(parseSshTarget("ssh -i key user@example.com")).toBeNull();
    expect(parseSshTarget("-oProxyCommand=echo pwned")).toBeNull();
  });
});

