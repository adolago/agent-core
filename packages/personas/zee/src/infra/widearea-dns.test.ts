import { describe, expect, it } from "vitest";

import {
  renderWideAreaGatewayZoneText,
  WIDE_AREA_DISCOVERY_DOMAIN,
} from "./widearea-dns.js";

describe("wide-area DNS-SD zone rendering", () => {
  it("renders a zee.internal zone with gateway + bridge PTR/SRV/TXT records", () => {
    const txt = renderWideAreaGatewayZoneText({
      serial: 2025121701,
      gatewayPort: 18789,
      bridgePort: 18790,
      displayName: "Mac Studio (Zee)",
      tailnetIPv4: "100.123.224.76",
      tailnetIPv6: "fd7a:115c:a1e0::8801:e04c",
      hostLabel: "studio-london",
      instanceLabel: "studio-london",
      bridgeInstanceLabel: "studio-london",
      sshPort: 2222,
      cliPath: "/opt/homebrew/bin/zee",
    });

    expect(txt).toContain(`$ORIGIN ${WIDE_AREA_DISCOVERY_DOMAIN}`);
    expect(txt).toContain(`studio-london IN A 100.123.224.76`);
    expect(txt).toContain(`studio-london IN AAAA fd7a:115c:a1e0::8801:e04c`);
    expect(txt).toContain(
      `_zee-gateway._tcp IN PTR studio-london._zee-gateway._tcp`,
    );
    expect(txt).toContain(
      `studio-london._zee-gateway._tcp IN SRV 0 0 18789 studio-london`,
    );
    expect(txt).toContain(`gatewayPort=18789`);
    expect(txt).toContain(
      `_zee-bridge._tcp IN PTR studio-london._zee-bridge._tcp`,
    );
    expect(txt).toContain(
      `studio-london._zee-bridge._tcp IN SRV 0 0 18790 studio-london`,
    );
    expect(txt).toContain(`bridgePort=18790`);
    expect(txt).toContain(`sshPort=2222`);
    expect(txt).toContain(`cliPath=/opt/homebrew/bin/zee`);
    expect(txt).toContain(`displayName=Mac Studio (Zee)`);
  });

  it("includes tailnetDns when provided", () => {
    const txt = renderWideAreaGatewayZoneText({
      serial: 2025121701,
      gatewayPort: 18789,
      bridgePort: 18790,
      displayName: "Mac Studio (Zee)",
      tailnetIPv4: "100.123.224.76",
      tailnetDns: "peters-mac-studio-1.sheep-coho.ts.net",
      hostLabel: "studio-london",
      instanceLabel: "studio-london",
      bridgeInstanceLabel: "studio-london",
    });

    expect(txt).toContain(`tailnetDns=peters-mac-studio-1.sheep-coho.ts.net`);
  });
});
