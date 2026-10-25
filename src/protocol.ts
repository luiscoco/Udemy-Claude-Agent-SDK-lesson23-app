export type Mode =
  | "parallel-readonly"
  | "friendly-error"
  | "uncaught-error"
  | "image"
  | "resource"
  | "structured"
  | "mixed";
export type RunConfig = { mode: Mode };
export type HandlerCall = {
  name: string;
  args: Record<string, unknown>;
  startMs: number;
  endMs: number;
  source: string;
  httpStatus?: number;
  isError: boolean;
  threw?: boolean;
  blockTypes: string[];
  details: Record<string, unknown>;
};
export type ToolProjection = {
  isError: boolean;
  blocks: {
    type: string;
    text?: string;
    mimeType?: string;
    base64Characters?: number;
  }[];
};
export type LabEvent =
  | { type: "options"; config: RunConfig; options: Record<string, unknown> }
  | { type: "initialized"; model: string; sessionId: string; tools: string[] }
  | { type: "message"; sdkType: string; summary: string }
  | { type: "tool"; name: string; args: unknown }
  | { type: "handler"; call: HandlerCall }
  | { type: "native-result"; projection: ToolProjection }
  | { type: "answer"; text: string }
  | {
      type: "result";
      status: string;
      text: string;
      sessionId: string;
      costUsd: number;
    }
  | {
      type: "evidence";
      mode: Mode;
      availableTools: string[];
      handlerCalls: HandlerCall[];
      nativeResults: ToolProjection[];
      overlapObserved: boolean;
      builtInsAbsent: boolean;
      structuredMarkerForwarded: boolean;
      duplicateTextForwarded: boolean;
      resourceMarkerForwarded: boolean;
    }
  | { type: "notice" | "error"; text: string };
