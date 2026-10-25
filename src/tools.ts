import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { HandlerCall, Mode } from "./protocol.js";

export const SAMPLE = {
  label: "Classroom sample; not live weather",
  series: "sample_temperature",
  unit: "F",
  points: [58, 59, 61, 63, 62],
  marker: "STRUCTURED-23",
};
export const REPORT =
  "# Classroom report\n\nLesson 23: advanced custom tools.\n\nResource marker: RESOURCE-23.\n\nThe URI identifies this inline content; no file is read from that URI.";
export const DUPLICATE_TEXT = "TEXT-SHOULD-BE-DROPPED-23";
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
export function intervalsOverlap(
  calls: Pick<HandlerCall, "startMs" | "endMs">[],
) {
  return calls.some((a, i) =>
    calls.some((b, j) => i < j && a.startMs < b.endMs && b.startMs < a.endMs),
  );
}
export function localOrigin() {
  return `http://127.0.0.1:${process.env.PORT || 3123}`;
}
export function resourceBlock() {
  return {
    type: "resource" as const,
    resource: {
      uri: "classroom://lesson23/report",
      mimeType: "text/markdown",
      text: REPORT,
    },
  };
}
export function friendlyFailure(status: number) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Classroom service returned HTTP ${status}. This is an intentional failure. Explain the unavailable result; do not retry or invent data.`,
      },
    ],
    isError: true,
  };
}
export function createAdvancedServer(
  mode: Mode,
  record: (call: HandlerCall) => void,
) {
  const now = () => Math.round(performance.now());
  const getTemperature = tool(
    "get_temperature",
    "Get live Open-Meteo temperature for a listed city; calls are read-only",
    { city: z.enum(["Madrid", "San Francisco"]) },
    async (args) => {
      const startMs = now();
      const coords =
        args.city === "Madrid" ? [40.4168, -3.7038] : [37.7749, -122.4194];
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: String(coords[0]),
        longitude: String(coords[1]),
        current: "temperature_2m",
        temperature_unit: "fahrenheit",
        timezone: "GMT",
      }).toString();
      try {
        // A labelled 700 ms teaching delay makes overlapping handler intervals easier to see.
        await delay(700);
        const response = await fetch(url, {
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error("Weather unavailable");
        const data = z
          .object({
            current: z.object({ time: z.string(), temperature_2m: z.number() }),
          })
          .parse(await response.json());
        const details = {
          city: args.city,
          temperatureF: data.current.temperature_2m,
          observedAtUTC: data.current.time,
          attribution: "Open-Meteo.com",
          teachingDelayMs: 700,
        };
        record({
          name: "get_temperature",
          args,
          startMs,
          endMs: now(),
          source: url.origin,
          httpStatus: response.status,
          isError: false,
          blockTypes: ["text"],
          details,
        });
        return { content: [{ type: "text", text: JSON.stringify(details) }] };
      } catch {
        record({
          name: "get_temperature",
          args,
          startMs,
          endMs: now(),
          source: url.origin,
          isError: true,
          blockTypes: ["text"],
          details: { message: "Live weather unavailable" },
        });
        return {
          content: [
            {
              type: "text",
              text: "Live weather unavailable; no cached result is substituted.",
            },
          ],
          isError: true,
        };
      }
    },
    { annotations: READ_ONLY, alwaysLoad: true },
  );
  const fetchData = tool(
    "fetch_data",
    "Call an intentionally failing local classroom HTTP endpoint",
    {},
    async (args) => {
      const startMs = now(),
        source = localOrigin() + "/api/demo-error";
      try {
        const response = await fetch(source, {
          signal: AbortSignal.timeout(5000),
        });
        const result = friendlyFailure(response.status);
        record({
          name: "fetch_data",
          args,
          startMs,
          endMs: now(),
          source,
          httpStatus: response.status,
          isError: true,
          blockTypes: ["text"],
          details: { message: result.content[0].text },
        });
        return result;
      } catch {
        const result = friendlyFailure(0);
        record({
          name: "fetch_data",
          args,
          startMs,
          endMs: now(),
          source,
          isError: true,
          blockTypes: ["text"],
          details: { message: "Local endpoint could not be reached" },
        });
        return result;
      }
    },
    { annotations: READ_ONLY, alwaysLoad: true },
  );
  const throwError = tool(
    "throw_error",
    "Throw one intentional classroom exception to inspect SDK error conversion",
    {},
    async (args) => {
      const startMs = now();
      record({
        name: "throw_error",
        args,
        startMs,
        endMs: now(),
        source: "in-process classroom exception",
        isError: true,
        threw: true,
        blockTypes: [],
        details: { message: "Classroom upstream unavailable (intentional)" },
      });
      throw new Error("Classroom upstream unavailable (intentional)");
    },
    { annotations: { ...READ_ONLY, openWorldHint: false }, alwaysLoad: true },
  );
  const getReport = tool(
    "get_report",
    "Return an inline classroom Markdown resource; its URI is only a label",
    {},
    async (args) => {
      const startMs = now(),
        content = [resourceBlock()];
      record({
        name: "get_report",
        args,
        startMs,
        endMs: now(),
        source: "generated inline classroom report",
        isError: false,
        blockTypes: ["resource"],
        details: { uri: content[0].resource.uri, text: REPORT },
      });
      return { content };
    },
    { annotations: { ...READ_ONLY, openWorldHint: false }, alwaysLoad: true },
  );
  const getChart = tool(
    "get_chart",
    "Return a labelled classroom sample PNG chart and optional structured data; not live weather",
    {},
    async (args) => {
      const startMs = now(),
        source = localOrigin() + "/demo-chart.png";
      const response = await fetch(source, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok)
        throw new Error("Start the web app to serve the classroom chart");
      const buffer = Buffer.from(await response.arrayBuffer());
      const image = {
        type: "image" as const,
        data: buffer.toString("base64"),
        mimeType: "image/png",
      };
      const details = {
        imageBytes: buffer.length,
        imageSHA256: createHash("sha256").update(buffer).digest("hex"),
        rawBase64HasNoPrefix: !image.data.startsWith("data:"),
        sample: SAMPLE,
      };
      if (mode === "structured") {
        const content = [
          { type: "text" as const, text: DUPLICATE_TEXT },
          image,
          resourceBlock(),
        ];
        record({
          name: "get_chart",
          args,
          startMs,
          endMs: now(),
          source,
          httpStatus: response.status,
          isError: false,
          blockTypes: content.map((b) => b.type),
          details: {
            ...details,
            structuredContent: SAMPLE,
            duplicateText: DUPLICATE_TEXT,
          },
        });
        return { content, structuredContent: SAMPLE };
      }
      if (mode === "mixed") {
        const content = [
          {
            type: "text" as const,
            text: "Classroom sample chart and inline report; not live weather.",
          },
          image,
          resourceBlock(),
        ];
        record({
          name: "get_chart",
          args,
          startMs,
          endMs: now(),
          source,
          httpStatus: response.status,
          isError: false,
          blockTypes: content.map((b) => b.type),
          details,
        });
        return { content };
      }
      record({
        name: "get_chart",
        args,
        startMs,
        endMs: now(),
        source,
        httpStatus: response.status,
        isError: false,
        blockTypes: ["image"],
        details,
      });
      return { content: [image] };
    },
    { annotations: READ_ONLY, alwaysLoad: true },
  );
  const selected =
    mode === "parallel-readonly"
      ? [getTemperature]
      : mode === "friendly-error"
        ? [fetchData]
        : mode === "uncaught-error"
          ? [throwError]
          : mode === "resource"
            ? [getReport]
            : [getChart];
  return createSdkMcpServer({
    name: "advanced",
    version: "1.0.0",
    tools: selected,
    alwaysLoad: true,
  });
}
