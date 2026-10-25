import {
  query,
  type Options,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { mkdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  createAdvancedServer,
  intervalsOverlap,
  DUPLICATE_TEXT,
} from "./tools.js";
import type {
  Mode,
  RunConfig,
  LabEvent,
  HandlerCall,
  ToolProjection,
} from "./protocol.js";
export type { RunConfig, LabEvent } from "./protocol.js";
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const MODES: Mode[] = [
  "parallel-readonly",
  "friendly-error",
  "uncaught-error",
  "image",
  "resource",
  "structured",
  "mixed",
];
export const DEFAULT_CONFIG: RunConfig = { mode: "parallel-readonly" };
export const PROMPTS: Record<Mode, string> = {
  "parallel-readonly":
    "Call get_temperature for Madrid and San Francisco, once each. Issue both independent read-only calls together in the same response if possible. Briefly report both actual temperatures and Open-Meteo attribution. No retries or invented data.",
  "friendly-error":
    "Call fetch_data once. It intentionally returns an error. Accept the failure and briefly explain the actual HTTP status and suggested next step. Do not retry or invent a successful result.",
  "uncaught-error":
    "Call throw_error once. Accept the intentional tool exception and briefly explain the actual error result. Do not retry. A tool error need not mean the whole query failed.",
  image:
    "Call get_chart once. Inspect the actual returned image. State the first and last sample values and say this is classroom sample data, not live weather.",
  resource:
    "Call get_report once. Report the resource marker and explain what the inline report says. Do not claim that its URI was read from disk.",
  structured:
    "Call get_chart once. Return the exact marker and all points from structured data, and the marker from the embedded report. Do not infer exact values from the chart when JSON is present. This is classroom sample data.",
  mixed:
    "Call get_chart once. Briefly describe the sample chart and report the inline resource marker. This result combines text, image and a resource without structuredContent.",
};
export function validateConfig(value: unknown): RunConfig {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !MODES.includes((value as RunConfig).mode)
  )
    throw new Error("Choose a listed custom-tool experiment.");
  return { mode: (value as RunConfig).mode };
}
export function projectToolResult(value: unknown): ToolProjection | null {
  if (!value || typeof value !== "object") return null;
  const block = value as Record<string, unknown>;
  if (block.type !== "tool_result") return null;
  const content =
    typeof block.content === "string"
      ? [{ type: "text", text: block.content }]
      : Array.isArray(block.content)
        ? block.content
        : [];
  return {
    isError: block.is_error === true,
    blocks: content.map((v: unknown) => {
      const b = v as Record<string, unknown>;
      if (b.type === "image") {
        const source = b.source as Record<string, unknown> | undefined;
        return {
          type: "image",
          mimeType: String(source?.media_type || b.mimeType || ""),
          base64Characters:
            typeof source?.data === "string" ? source.data.length : 0,
        };
      }
      return {
        type: String(b.type),
        text:
          typeof b.text === "string"
            ? b.text.slice(0, 6000)
            : JSON.stringify(b).slice(0, 6000),
      };
    }),
  };
}
export function redact(text: string) {
  const key = process.env.ANTHROPIC_API_KEY;
  return (key ? text.split(key).join("[REDACTED]") : text)
    .replace(/sk-ant-[A-Za-z0-9_-]{16,}/g, "[REDACTED]")
    .slice(0, 18000);
}
export async function runAgent(
  config: RunConfig,
  emit: (event: LabEvent) => void,
  controller = new AbortController(),
) {
  const c = validateConfig(config),
    root = resolve(
      realpathSync.native(tmpdir()),
      "claude-sdk23",
      randomUUID().slice(0, 12),
    );
  const cwd = resolve(root, "p"),
    home = resolve(root, "h"),
    sdkHome = resolve(root, "c");
  for (const dir of [cwd, home, sdkHome]) await mkdir(dir, { recursive: true });
  const handlerCalls: HandlerCall[] = [],
    nativeResults: ToolProjection[] = [];
  const record = (call: HandlerCall) => {
    handlerCalls.push(call);
    emit({ type: "handler", call });
  };
  const mcpServers = { advanced: createAdvancedServer(c.mode, record) };
  const options: Options = {
    model: MODEL,
    cwd,
    tools: [],
    mcpServers,
    allowedTools: ["mcp__advanced__*"],
    settingSources: [],
    skills: [],
    plugins: [],
    strictMcpConfig: true,
    persistSession: false,
    permissionMode: "default",
    effort: "low",
    thinking: { type: "disabled" },
    maxTurns: 6,
    maxBudgetUsd: 0.3,
    abortController: controller,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CLAUDE_CONFIG_DIR: sdkHome,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      ENABLE_CLAUDEAI_MCP_SERVERS: "false",
    },
    systemPrompt:
      "Use actual configured tools for this classroom task. Never invent tool results. Do not retry failures. Keep the final answer brief. You have no built-in tools.",
    canUseTool: async (name) => {
      return {
        behavior: "deny",
        message:
          "This classroom denies calls not pre-approved. Accept the denial and do not retry.",
      };
    },
  };
  emit({
    type: "options",
    config: c,
    options: {
      model: MODEL,
      tools: options.tools,
      allowedTools: options.allowedTools,
      mcpServers: Object.keys(mcpServers),
      permissionMode: options.permissionMode,
      alwaysLoad: true,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: "per handler",
      },
      cwd: "fresh private working directory",
    },
  });
  let release!: () => void;
  const gate = new Promise<void>((ok) => {
    release = ok;
  });
  async function* input(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: "user",
      message: { role: "user", content: PROMPTS[c.mode] },
      parent_tool_use_id: null,
      session_id: "",
    };
    await gate;
  }
  const run = query({ prompt: input(), options });
  let text = "",
    status = "no_result",
    sessionId = "",
    costUsd = 0,
    availableTools: string[] = [];
  try {
    for await (const message of run) {
      emit({
        type: "message",
        sdkType: message.type,
        summary:
          "subtype" in message ? String(message.subtype) : "Actual SDK message",
      });
      if (message.type === "system" && message.subtype === "init") {
        availableTools = message.tools;
        sessionId = message.session_id;
        emit({
          type: "initialized",
          model: message.model,
          sessionId,
          tools: message.tools,
        });
      }
      if (message.type === "assistant")
        for (const block of message.message.content) {
          if (block.type === "text")
            emit({ type: "answer", text: redact(block.text) });
          if (block.type === "tool_use") {
            emit({ type: "tool", name: block.name, args: block.input });
          }
        }
      if (message.type === "user" && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          const projection = projectToolResult(block);
          if (projection) {
            nativeResults.push(projection);
            emit({ type: "native-result", projection });
          }
        }
      }
      if (message.type === "result") {
        text = redact(
          message.subtype === "success"
            ? message.result
            : message.errors.join("\n"),
        );
        status =
          message.subtype === "success" && message.is_error
            ? "error"
            : message.subtype;
        sessionId = message.session_id;
        costUsd = message.total_cost_usd;
        break;
      }
    }
  } finally {
    release();
    run.close();
  }
  emit({ type: "result", status, text, sessionId, costUsd });
  const forwarded = nativeResults
    .flatMap((result) => result.blocks)
    .map((block) => block.text || "")
    .join("\n");
  emit({
    type: "evidence",
    mode: c.mode,
    availableTools,
    handlerCalls,
    nativeResults,
    overlapObserved: intervalsOverlap(handlerCalls),
    builtInsAbsent: availableTools.every((name) => name.startsWith("mcp__")),
    structuredMarkerForwarded: forwarded.includes("STRUCTURED-23"),
    duplicateTextForwarded: forwarded.includes(DUPLICATE_TEXT),
    resourceMarkerForwarded: forwarded.includes("RESOURCE-23"),
  });
}
