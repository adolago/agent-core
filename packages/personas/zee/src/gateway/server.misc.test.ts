import { createServer } from "node:net";
import { describe, expect, test, vi } from "vitest";
import { resolveCanvasHostUrl } from "../infra/canvas-host-url.js";
import { GatewayLockError } from "../infra/gateway-lock.js";
import {
  connectOk,
  getFreePort,
  installGatewayTestHooks,
  occupyPort,
  onceMessage,
  rpcReq,
  startGatewayServer,
  startServerWithClient,
  testState,
  testTailnetIPv4,
} from "./test-helpers.js";

installGatewayTestHooks();

describe("gateway server misc", () => {
  test("hello-ok advertises the gateway port for canvas host", async () => {
    const prevToken = process.env.ZEE_GATEWAY_TOKEN;
    const prevCanvasPort = process.env.ZEE_CANVAS_HOST_PORT;
    process.env.ZEE_GATEWAY_TOKEN = "secret";
    testTailnetIPv4.value = "100.64.0.1";
    testState.gatewayBind = "lan";
    const canvasPort = await getFreePort();
    testState.canvasHostPort = canvasPort;
    process.env.ZEE_CANVAS_HOST_PORT = String(canvasPort);

    const port = await getFreePort();
    const canvasHostUrl = resolveCanvasHostUrl({
      canvasPort,
      requestHost: `100.64.0.1:${port}`,
      localAddress: "127.0.0.1",
    });
    expect(canvasHostUrl).toBe(`http://100.64.0.1:${canvasPort}`);
    if (prevToken === undefined) {
      delete process.env.ZEE_GATEWAY_TOKEN;
    } else {
      process.env.ZEE_GATEWAY_TOKEN = prevToken;
    }
    if (prevCanvasPort === undefined) {
      delete process.env.ZEE_CANVAS_HOST_PORT;
    } else {
      process.env.ZEE_CANVAS_HOST_PORT = prevCanvasPort;
    }
  });

  test("send dedupes by idempotencyKey", { timeout: 8000 }, async () => {
    const { server, ws } = await startServerWithClient();
    await connectOk(ws);

    const idem = "same-key";
    const res1P = onceMessage(ws, (o) => o.type === "res" && o.id === "a1");
    const res2P = onceMessage(ws, (o) => o.type === "res" && o.id === "a2");
    const sendReq = (id: string) =>
      ws.send(
        JSON.stringify({
          type: "req",
          id,
          method: "send",
          params: { to: "+15550000000", message: "hi", idempotencyKey: idem },
        }),
      );
    sendReq("a1");
    sendReq("a2");

    const res1 = await res1P;
    const res2 = await res2P;
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(res1.payload).toEqual(res2.payload);
    ws.close();
    await server.close();
  });

  test("send accepts media-only payloads", async () => {
    const { server, ws } = await startServerWithClient();
    await connectOk(ws);

    const resP = onceMessage(ws, (o) => o.type === "res" && o.id === "media");
    ws.send(
      JSON.stringify({
        type: "req",
        id: "media",
        method: "send",
        params: {
          to: "+15550000000",
          mediaUrl: "https://example.com/photo.jpg",
          idempotencyKey: "media-only",
        },
      }),
    );
    const res = await resP;
    expect(res.ok).toBe(true);
    ws.close();
    await server.close();
  });

  test("poll trims recipient, question, and options", async () => {
    const { server, ws } = await startServerWithClient();
    await connectOk(ws);

    const { sendPollWhatsApp } = await import("../web/outbound.js");
    const sendPollWhatsAppMock = vi.mocked(sendPollWhatsApp);
    sendPollWhatsAppMock.mockClear();

    const res = await rpcReq(ws, "poll", {
      to: " +15550000000 ",
      question: "  Ready? ",
      options: [" yes ", " no "],
      idempotencyKey: "poll-trim",
    });
    expect(res.ok).toBe(true);
    expect(sendPollWhatsAppMock).toHaveBeenCalledTimes(1);
    const [to, poll] = sendPollWhatsAppMock.mock.calls[0] ?? [];
    expect(to).toBe("+15550000000");
    expect(poll).toEqual(
      expect.objectContaining({
        question: "Ready?",
        options: ["yes", "no"],
      }),
    );

    ws.close();
    await server.close();
  });

  test("send rejects empty message and media", async () => {
    const { server, ws } = await startServerWithClient();
    await connectOk(ws);

    const resP = onceMessage(ws, (o) => o.type === "res" && o.id === "empty");
    ws.send(
      JSON.stringify({
        type: "req",
        id: "empty",
        method: "send",
        params: {
          to: "+15550000000",
          message: " ",
          idempotencyKey: "empty-send",
        },
      }),
    );
    const res = await resP;
    expect(res.ok).toBe(false);
    expect(res.error?.message).toMatch(/message or mediaUrl required/i);
    ws.close();
    await server.close();
  });

  test("poll rejects empty question", async () => {
    const { server, ws } = await startServerWithClient();
    await connectOk(ws);

    const res = await rpcReq(ws, "poll", {
      to: "+15550000000",
      question: " ",
      options: ["yes", "no"],
      idempotencyKey: "poll-empty-question",
    });
    expect(res.ok).toBe(false);
    expect(res.error?.message ?? "").toMatch(/question required/i);

    ws.close();
    await server.close();
  });

  test("poll rejects empty options", async () => {
    const { server, ws } = await startServerWithClient();
    await connectOk(ws);

    const res = await rpcReq(ws, "poll", {
      to: "+15550000000",
      question: "Ready?",
      options: ["yes", " "],
      idempotencyKey: "poll-empty-options",
    });
    expect(res.ok).toBe(false);
    expect(res.error?.message ?? "").toMatch(/options must be non-empty/i);

    ws.close();
    await server.close();
  });

  test("send rejects empty recipient", async () => {
    const { server, ws } = await startServerWithClient();
    await connectOk(ws);

    const res = await rpcReq(ws, "send", {
      to: " ",
      message: "hi",
      idempotencyKey: "send-empty-to",
    });
    expect(res.ok).toBe(false);
    expect(res.error?.message ?? "").toMatch(/to required/i);
    ws.close();
    await server.close();
  });

  test("refuses to start when port already bound", async () => {
    const { server: blocker, port } = await occupyPort();
    await expect(startGatewayServer(port)).rejects.toBeInstanceOf(
      GatewayLockError,
    );
    await expect(startGatewayServer(port)).rejects.toThrow(
      /already listening/i,
    );
    blocker.close();
  });

  test("releases port after close", async () => {
    const port = await getFreePort();
    const server = await startGatewayServer(port);
    await server.close();

    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", () => resolve());
    });
    await new Promise<void>((resolve, reject) =>
      probe.close((err) => (err ? reject(err) : resolve())),
    );
  });
});
