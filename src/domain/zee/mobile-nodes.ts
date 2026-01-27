/**
 * Zee Mobile Nodes Tools
 *
 * Control iOS/Android/macOS devices connected to the Zee gateway:
 * - Camera: Take photos, record video
 * - Screen: Record screen
 * - Location: Get GPS coordinates
 * - Notifications: Send push notifications
 * - System: Execute commands on nodes
 *
 * Nodes are companion apps that connect via WebSocket and provide
 * device-specific capabilities to the agent.
 */

import { z } from "zod";
import type { ToolDefinition, ToolExecutionResult } from "../../mcp/types.js";
import { Log } from "../../../packages/agent-core/src/util/log.js";

const log = Log.create({ service: "zee-mobile-nodes" });

// =============================================================================
// Gateway Client
// =============================================================================

const DEFAULT_TIMEOUT_MS = 30000;

function resolveGatewayHttpUrl(): string {
  const envUrl = process.env.ZEE_GATEWAY_URL || process.env.GATEWAY_URL;
  if (envUrl) {
    return envUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
  }
  const port = process.env.ZEE_GATEWAY_PORT || "18789";
  return `http://127.0.0.1:${port}`;
}

async function callGatewayRpc<T = unknown>(
  method: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
): Promise<T> {
  const baseUrl = resolveGatewayHttpUrl();
  const timeout = timeoutMs || DEFAULT_TIMEOUT_MS;

  const url = `${baseUrl}/rpc`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gateway error: ${response.status} ${text}`);
    }

    const result = await response.json() as { result?: T; error?: { message: string } };

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.result as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Gateway request timed out after ${timeout}ms`);
    }
    throw error;
  }
}

function formatConnectionError(errorMsg: string): string {
  return `Could not connect to Zee gateway.

Ensure agent-core daemon is running:
  agent-core daemon

Error: ${errorMsg}`;
}

function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// =============================================================================
// Types
// =============================================================================

interface NodeInfo {
  nodeId: string;
  displayName: string;
  platform: string;
  version?: string;
  connected: boolean;
  caps: string[];
  commands: string[];
  lastConnectedAtMs?: number;
}

interface PairingRequest {
  requestId: string;
  nodeId: string;
  displayName: string;
  platform: string;
  remoteIp?: string;
  caps: string[];
  commands: string[];
  ts: number;
}

// =============================================================================
// Node List Tool
// =============================================================================

const NodeListParams = z.object({
  includeOffline: z.boolean().default(true).describe("Include paired but offline nodes"),
});

export const nodeListTool: ToolDefinition = {
  id: "zee:node-list",
  category: "domain",
  init: async () => ({
    description: `List all connected and paired mobile nodes.

Returns nodes with their status, capabilities, and connection state.
Nodes are iOS/Android/macOS companion apps that connect to the gateway.

Example:
- { }
- { includeOffline: false }`,
    parameters: NodeListParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: "Mobile Nodes" });

      try {
        const result = await callGatewayRpc<{
          nodes: NodeInfo[];
        }>("node.list", {});

        const nodes = args.includeOffline
          ? result.nodes
          : result.nodes.filter(n => n.connected);

        if (nodes.length === 0) {
          return {
            title: "No Nodes",
            metadata: { count: 0 },
            output: `No mobile nodes ${args.includeOffline ? "paired" : "connected"}.

To connect a node:
1. Install the Zee companion app on your device
2. Open the app and scan the pairing QR code
3. Approve the pairing request with zee:node-approve`,
          };
        }

        const connected = nodes.filter(n => n.connected);
        const offline = nodes.filter(n => !n.connected);

        const formatNode = (n: NodeInfo, idx: number) => {
          const status = n.connected ? "online" : "offline";
          const lastSeen = n.lastConnectedAtMs
            ? new Date(n.lastConnectedAtMs).toLocaleString()
            : "never";
          return `${idx + 1}. ${n.displayName} [${status}]
   ID: ${n.nodeId}
   Platform: ${n.platform}
   Capabilities: ${n.caps.join(", ") || "none"}
   ${!n.connected ? `Last seen: ${lastSeen}` : ""}`;
        };

        let output = "";
        if (connected.length > 0) {
          output += `Connected (${connected.length}):\n\n`;
          output += connected.map((n, i) => formatNode(n, i)).join("\n\n");
        }
        if (offline.length > 0 && args.includeOffline) {
          if (output) output += "\n\n";
          output += `Offline (${offline.length}):\n\n`;
          output += offline.map((n, i) => formatNode(n, i)).join("\n\n");
        }

        return {
          title: `${connected.length} Online, ${offline.length} Offline`,
          metadata: {
            connected: connected.length,
            offline: offline.length,
            nodes: nodes.map(n => n.nodeId),
          },
          output,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Node List Error",
          metadata: { error: errorMsg },
          output: `Failed to list nodes: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Node Describe Tool
// =============================================================================

const NodeDescribeParams = z.object({
  nodeId: z.string().describe("Node ID to describe"),
});

export const nodeDescribeTool: ToolDefinition = {
  id: "zee:node-describe",
  category: "domain",
  init: async () => ({
    description: `Get detailed information about a specific node.

Returns full capabilities, commands, and connection history.

Example:
- { nodeId: "iphone-12-pro" }`,
    parameters: NodeDescribeParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Node: ${args.nodeId}` });

      try {
        const result = await callGatewayRpc<{
          node: NodeInfo & {
            deviceFamily?: string;
            modelIdentifier?: string;
            coreVersion?: string;
            uiVersion?: string;
            remoteIp?: string;
          };
        }>("node.describe", { nodeId: args.nodeId });

        const n = result.node;

        return {
          title: n.displayName,
          metadata: {
            nodeId: n.nodeId,
            platform: n.platform,
            connected: n.connected,
          },
          output: `Node: ${n.displayName}

ID: ${n.nodeId}
Platform: ${n.platform}
Status: ${n.connected ? "Connected" : "Offline"}
${n.deviceFamily ? `Device: ${n.deviceFamily}` : ""}
${n.modelIdentifier ? `Model: ${n.modelIdentifier}` : ""}
${n.version ? `Version: ${n.version}` : ""}
${n.coreVersion ? `Core: ${n.coreVersion}` : ""}
${n.remoteIp ? `IP: ${n.remoteIp}` : ""}

Capabilities: ${n.caps.join(", ") || "none"}

Commands:
${n.commands.map(c => `  • ${c}`).join("\n") || "  none"}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("not found") || errorMsg.includes("404")) {
          return {
            title: "Node Not Found",
            metadata: { error: "not_found", nodeId: args.nodeId },
            output: `Node "${args.nodeId}" not found.

Use zee:node-list to see available nodes.`,
          };
        }

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Node Describe Error",
          metadata: { error: errorMsg },
          output: `Failed to describe node: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Node Pairing Tools
// =============================================================================

const NodePendingParams = z.object({});

export const nodePendingTool: ToolDefinition = {
  id: "zee:node-pending",
  category: "domain",
  init: async () => ({
    description: `List pending pairing requests from nodes.

Shows nodes waiting for approval to connect.

Example:
- { }`,
    parameters: NodePendingParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: "Pending Nodes" });

      try {
        const result = await callGatewayRpc<{
          pending: PairingRequest[];
        }>("node.pair.list", {});

        if (result.pending.length === 0) {
          return {
            title: "No Pending Requests",
            metadata: { count: 0 },
            output: `No pending pairing requests.

When a new device connects, it will appear here for approval.`,
          };
        }

        const formatRequest = (r: PairingRequest, idx: number) => {
          const age = Math.round((Date.now() - r.ts) / 1000);
          return `${idx + 1}. ${r.displayName}
   Request ID: ${r.requestId}
   Node ID: ${r.nodeId}
   Platform: ${r.platform}
   IP: ${r.remoteIp || "unknown"}
   Age: ${age}s
   Capabilities: ${r.caps.join(", ") || "none"}`;
        };

        return {
          title: `${result.pending.length} Pending`,
          metadata: {
            count: result.pending.length,
            requests: result.pending.map(r => r.requestId),
          },
          output: `Pending Pairing Requests:

${result.pending.map((r, i) => formatRequest(r, i)).join("\n\n")}

Approve with: zee:node-approve { requestId: "..." }
Reject with: zee:node-reject { requestId: "..." }`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Pending Error",
          metadata: { error: errorMsg },
          output: `Failed to list pending requests: ${errorMsg}`,
        };
      }
    },
  }),
};

const NodeApproveParams = z.object({
  requestId: z.string().describe("Pairing request ID to approve"),
});

export const nodeApproveTool: ToolDefinition = {
  id: "zee:node-approve",
  category: "domain",
  init: async () => ({
    description: `Approve a pending node pairing request.

Grants the node permission to connect and execute commands.

Example:
- { requestId: "abc123" }`,
    parameters: NodeApproveParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Approve: ${args.requestId.substring(0, 8)}...` });

      try {
        const result = await callGatewayRpc<{
          ok: boolean;
          nodeId: string;
          displayName: string;
        }>("node.pair.approve", { requestId: args.requestId });

        return {
          title: "Node Approved",
          metadata: {
            requestId: args.requestId,
            nodeId: result.nodeId,
          },
          output: `Approved node: ${result.displayName}

Node ID: ${result.nodeId}
The node can now connect and execute commands.`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("not found") || errorMsg.includes("404")) {
          return {
            title: "Request Not Found",
            metadata: { error: "not_found" },
            output: `Pairing request "${args.requestId}" not found.

Use zee:node-pending to see available requests.`,
          };
        }

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Approve Error",
          metadata: { error: errorMsg },
          output: `Failed to approve: ${errorMsg}`,
        };
      }
    },
  }),
};

const NodeRejectParams = z.object({
  requestId: z.string().describe("Pairing request ID to reject"),
});

export const nodeRejectTool: ToolDefinition = {
  id: "zee:node-reject",
  category: "domain",
  init: async () => ({
    description: `Reject a pending node pairing request.

Denies the node permission to connect.

Example:
- { requestId: "abc123" }`,
    parameters: NodeRejectParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Reject: ${args.requestId.substring(0, 8)}...` });

      try {
        await callGatewayRpc<{ ok: boolean }>("node.pair.reject", {
          requestId: args.requestId,
        });

        return {
          title: "Request Rejected",
          metadata: { requestId: args.requestId },
          output: `Rejected pairing request: ${args.requestId}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Reject Error",
          metadata: { error: errorMsg },
          output: `Failed to reject: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Camera Tools
// =============================================================================

const NodeCameraSnapParams = z.object({
  nodeId: z.string().describe("Node ID"),
  facing: z.enum(["front", "back", "both"]).default("back")
    .describe("Which camera to use"),
  maxWidth: z.number().optional().describe("Max image width in pixels"),
  quality: z.number().min(0).max(100).optional().describe("JPEG quality (0-100)"),
  delayMs: z.number().optional().describe("Delay before capture in ms"),
  timeoutMs: z.number().optional().describe("Operation timeout"),
});

export const nodeCameraSnapTool: ToolDefinition = {
  id: "zee:node-camera-snap",
  category: "domain",
  init: async () => ({
    description: `Take a photo using a node's camera.

Captures an image from the front, back, or both cameras.

Examples:
- Back camera: { nodeId: "iphone", facing: "back" }
- Selfie: { nodeId: "iphone", facing: "front" }
- Both cameras: { nodeId: "iphone", facing: "both" }`,
    parameters: NodeCameraSnapParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Camera: ${args.facing}` });

      try {
        const result = await callGatewayRpc<{
          ok: boolean;
          payload: {
            format: string;
            base64: string;
            width?: number;
            height?: number;
          } | Array<{
            facing: string;
            format: string;
            base64: string;
            width?: number;
            height?: number;
          }>;
        }>("node.invoke", {
          nodeId: args.nodeId,
          command: "camera.snap",
          params: {
            facing: args.facing,
            maxWidth: args.maxWidth,
            quality: args.quality,
            delayMs: args.delayMs,
          },
          timeoutMs: args.timeoutMs || 30000,
          idempotencyKey: generateIdempotencyKey(),
        }, args.timeoutMs);

        const payload = result.payload;
        const images = Array.isArray(payload) ? payload : [payload];

        const summary = images.map(img => {
          const facing = "facing" in img ? img.facing : args.facing;
          const size = img.base64.length;
          const dims = img.width && img.height ? `${img.width}x${img.height}` : "unknown";
          return `${facing}: ${dims}, ${Math.round(size / 1024)}KB`;
        }).join("\n");

        return {
          title: `Photo Captured`,
          metadata: {
            nodeId: args.nodeId,
            facing: args.facing,
            count: images.length,
          },
          output: `Captured ${images.length} image(s) from ${args.nodeId}

${summary}

Images are returned as base64-encoded ${images[0]?.format || "jpg"}.`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("not found") || errorMsg.includes("offline")) {
          return {
            title: "Node Unavailable",
            metadata: { error: "node_unavailable", nodeId: args.nodeId },
            output: `Node "${args.nodeId}" is not connected.

Use zee:node-list to see available nodes.`,
          };
        }

        if (errorMsg.includes("not allowed") || errorMsg.includes("permission")) {
          return {
            title: "Permission Denied",
            metadata: { error: "permission_denied" },
            output: `Camera access not allowed on this node.

Check node permissions in gateway config.`,
          };
        }

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Camera Error",
          metadata: { error: errorMsg },
          output: `Failed to capture photo: ${errorMsg}`,
        };
      }
    },
  }),
};

const NodeCameraClipParams = z.object({
  nodeId: z.string().describe("Node ID"),
  facing: z.enum(["front", "back"]).default("back")
    .describe("Which camera to use"),
  durationMs: z.number().default(3000).describe("Recording duration in ms"),
  includeAudio: z.boolean().default(true).describe("Include audio"),
  timeoutMs: z.number().optional().describe("Operation timeout"),
});

export const nodeCameraClipTool: ToolDefinition = {
  id: "zee:node-camera-clip",
  category: "domain",
  init: async () => ({
    description: `Record a video clip using a node's camera.

Captures video from front or back camera with optional audio.

Examples:
- 3 second clip: { nodeId: "iphone", facing: "back", durationMs: 3000 }
- Silent video: { nodeId: "iphone", includeAudio: false }`,
    parameters: NodeCameraClipParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Video: ${args.durationMs}ms` });

      try {
        const result = await callGatewayRpc<{
          ok: boolean;
          payload: {
            format: string;
            base64: string;
            durationMs?: number;
            hasAudio?: boolean;
          };
        }>("node.invoke", {
          nodeId: args.nodeId,
          command: "camera.clip",
          params: {
            facing: args.facing,
            durationMs: args.durationMs,
            includeAudio: args.includeAudio,
          },
          timeoutMs: args.timeoutMs || (args.durationMs + 10000),
          idempotencyKey: generateIdempotencyKey(),
        }, args.timeoutMs || (args.durationMs + 10000));

        const p = result.payload;
        const size = Math.round(p.base64.length / 1024);

        return {
          title: `Video Recorded`,
          metadata: {
            nodeId: args.nodeId,
            facing: args.facing,
            durationMs: p.durationMs,
          },
          output: `Recorded video from ${args.nodeId}

Duration: ${p.durationMs || args.durationMs}ms
Format: ${p.format}
Size: ${size}KB
Audio: ${p.hasAudio ? "Yes" : "No"}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Video Error",
          metadata: { error: errorMsg },
          output: `Failed to record video: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Screen Record Tool
// =============================================================================

const NodeScreenRecordParams = z.object({
  nodeId: z.string().describe("Node ID"),
  durationMs: z.number().default(10000).describe("Recording duration in ms"),
  fps: z.number().default(10).describe("Frames per second"),
  includeAudio: z.boolean().default(true).describe("Include audio"),
  timeoutMs: z.number().optional().describe("Operation timeout"),
});

export const nodeScreenRecordTool: ToolDefinition = {
  id: "zee:node-screen-record",
  category: "domain",
  init: async () => ({
    description: `Record the screen of a mobile node.

Captures screen content with optional audio.

Examples:
- 10 second recording: { nodeId: "iphone", durationMs: 10000 }
- High FPS: { nodeId: "iphone", fps: 30, durationMs: 5000 }`,
    parameters: NodeScreenRecordParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Screen: ${args.durationMs}ms` });

      try {
        const result = await callGatewayRpc<{
          ok: boolean;
          payload: {
            format: string;
            base64: string;
            durationMs?: number;
            hasAudio?: boolean;
          };
        }>("node.invoke", {
          nodeId: args.nodeId,
          command: "screen.record",
          params: {
            durationMs: args.durationMs,
            fps: args.fps,
            includeAudio: args.includeAudio,
          },
          timeoutMs: args.timeoutMs || (args.durationMs + 15000),
          idempotencyKey: generateIdempotencyKey(),
        }, args.timeoutMs || (args.durationMs + 15000));

        const p = result.payload;
        const size = Math.round(p.base64.length / 1024);

        return {
          title: `Screen Recorded`,
          metadata: {
            nodeId: args.nodeId,
            durationMs: p.durationMs,
          },
          output: `Recorded screen from ${args.nodeId}

Duration: ${p.durationMs || args.durationMs}ms
FPS: ${args.fps}
Format: ${p.format}
Size: ${size}KB
Audio: ${p.hasAudio ? "Yes" : "No"}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Screen Record Error",
          metadata: { error: errorMsg },
          output: `Failed to record screen: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Location Tool
// =============================================================================

const NodeLocationParams = z.object({
  nodeId: z.string().describe("Node ID"),
  desiredAccuracy: z.enum(["coarse", "balanced", "precise"]).default("balanced")
    .describe("Location accuracy level"),
  maxAgeMs: z.number().optional().describe("Accept cached location if newer than this"),
  timeoutMs: z.number().optional().describe("Operation timeout"),
});

export const nodeLocationTool: ToolDefinition = {
  id: "zee:node-location",
  category: "domain",
  init: async () => ({
    description: `Get GPS location from a mobile node.

Returns latitude, longitude, and accuracy information.

Examples:
- Current location: { nodeId: "iphone" }
- Precise location: { nodeId: "iphone", desiredAccuracy: "precise" }
- Allow cached: { nodeId: "iphone", maxAgeMs: 60000 }`,
    parameters: NodeLocationParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Location: ${args.desiredAccuracy}` });

      try {
        const result = await callGatewayRpc<{
          ok: boolean;
          payload: {
            latitude: number;
            longitude: number;
            accuracy?: number;
            altitude?: number;
            timestamp?: number;
          };
        }>("node.invoke", {
          nodeId: args.nodeId,
          command: "location.get",
          params: {
            desiredAccuracy: args.desiredAccuracy,
            maxAgeMs: args.maxAgeMs,
          },
          timeoutMs: args.timeoutMs || 30000,
          idempotencyKey: generateIdempotencyKey(),
        }, args.timeoutMs);

        const loc = result.payload;
        const mapsUrl = `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;

        return {
          title: `Location: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`,
          metadata: {
            nodeId: args.nodeId,
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracy: loc.accuracy,
          },
          output: `Location from ${args.nodeId}

Latitude: ${loc.latitude}
Longitude: ${loc.longitude}
${loc.accuracy ? `Accuracy: ±${loc.accuracy}m` : ""}
${loc.altitude ? `Altitude: ${loc.altitude}m` : ""}
${loc.timestamp ? `Timestamp: ${new Date(loc.timestamp).toISOString()}` : ""}

Maps: ${mapsUrl}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("permission") || errorMsg.includes("denied")) {
          return {
            title: "Location Denied",
            metadata: { error: "permission_denied" },
            output: `Location access denied on node.

Enable location permissions in device settings.`,
          };
        }

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Location Error",
          metadata: { error: errorMsg },
          output: `Failed to get location: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Notification Tool
// =============================================================================

const NodeNotifyParams = z.object({
  nodeId: z.string().describe("Node ID"),
  title: z.string().optional().describe("Notification title"),
  body: z.string().describe("Notification body"),
  priority: z.enum(["passive", "active", "timeSensitive"]).default("active")
    .describe("Notification priority"),
  sound: z.string().optional().describe("Sound identifier"),
});

export const nodeNotifyTool: ToolDefinition = {
  id: "zee:node-notify",
  category: "domain",
  init: async () => ({
    description: `Send a push notification to a mobile node.

Displays a notification on the device.

Examples:
- Basic: { nodeId: "iphone", body: "Hello!" }
- With title: { nodeId: "iphone", title: "Reminder", body: "Meeting in 5 min" }
- Urgent: { nodeId: "iphone", body: "Action required", priority: "timeSensitive" }`,
    parameters: NodeNotifyParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Notify: ${args.nodeId}` });

      try {
        await callGatewayRpc<{ ok: boolean }>("node.invoke", {
          nodeId: args.nodeId,
          command: "system.notify",
          params: {
            title: args.title,
            body: args.body,
            priority: args.priority,
            sound: args.sound,
          },
          timeoutMs: 10000,
          idempotencyKey: generateIdempotencyKey(),
        });

        return {
          title: "Notification Sent",
          metadata: {
            nodeId: args.nodeId,
            priority: args.priority,
          },
          output: `Sent notification to ${args.nodeId}

${args.title ? `Title: ${args.title}` : ""}
Body: ${args.body}
Priority: ${args.priority}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Notify Error",
          metadata: { error: errorMsg },
          output: `Failed to send notification: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// System Run Tool
// =============================================================================

const NodeRunParams = z.object({
  nodeId: z.string().describe("Node ID"),
  command: z.array(z.string()).describe("Command and arguments: ['echo', 'hello']"),
  cwd: z.string().optional().describe("Working directory"),
  env: z.array(z.string()).optional().describe("Environment variables: ['KEY=value']"),
  timeoutMs: z.number().optional().describe("Command timeout"),
});

export const nodeRunTool: ToolDefinition = {
  id: "zee:node-run",
  category: "domain",
  init: async () => ({
    description: `Execute a shell command on a node.

Runs commands on macOS/Linux nodes (not available on iOS/Android).

Examples:
- Simple command: { nodeId: "mac", command: ["echo", "hello"] }
- With directory: { nodeId: "mac", command: ["ls", "-la"], cwd: "/tmp" }`,
    parameters: NodeRunParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const cmdStr = args.command.join(" ");
      ctx.metadata({ title: `Run: ${cmdStr.substring(0, 30)}...` });

      try {
        const result = await callGatewayRpc<{
          ok: boolean;
          payload: {
            exitCode: number;
            stdout?: string;
            stderr?: string;
          };
        }>("node.invoke", {
          nodeId: args.nodeId,
          command: "system.run",
          params: {
            command: args.command,
            cwd: args.cwd,
            env: args.env,
            commandTimeoutMs: args.timeoutMs,
          },
          timeoutMs: args.timeoutMs || 60000,
          idempotencyKey: generateIdempotencyKey(),
        }, args.timeoutMs || 60000);

        const p = result.payload;
        const status = p.exitCode === 0 ? "success" : `failed (${p.exitCode})`;

        let output = `Command: ${cmdStr}\nStatus: ${status}\n`;
        if (p.stdout) output += `\nStdout:\n${p.stdout}`;
        if (p.stderr) output += `\nStderr:\n${p.stderr}`;

        return {
          title: status === "success" ? "Command Succeeded" : "Command Failed",
          metadata: {
            nodeId: args.nodeId,
            exitCode: p.exitCode,
            command: args.command,
          },
          output,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("not allowed") || errorMsg.includes("permission")) {
          return {
            title: "Command Not Allowed",
            metadata: { error: "not_allowed" },
            output: `system.run is not allowed on this node.

Only macOS/Linux nodes support shell commands.
iOS/Android nodes do not have this capability.`,
          };
        }

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Gateway Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(errorMsg),
          };
        }

        return {
          title: "Run Error",
          metadata: { error: errorMsg },
          output: `Failed to run command: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Exports
// =============================================================================

export const MOBILE_NODE_TOOLS = [
  nodeListTool,
  nodeDescribeTool,
  nodePendingTool,
  nodeApproveTool,
  nodeRejectTool,
  nodeCameraSnapTool,
  nodeCameraClipTool,
  nodeScreenRecordTool,
  nodeLocationTool,
  nodeNotifyTool,
  nodeRunTool,
];

export function registerMobileNodeTools(registry: { register: (tool: ToolDefinition, options: { source: string }) => void }): void {
  for (const tool of MOBILE_NODE_TOOLS) {
    registry.register(tool, { source: "domain" });
  }
}
