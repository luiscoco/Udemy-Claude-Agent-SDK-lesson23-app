import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig, projectToolResult } from "./agent.js";
import {
  intervalsOverlap,
  friendlyFailure,
  resourceBlock,
  SAMPLE,
} from "./tools.js";
test("tasks reject arbitrary operations and strip unrelated browser input", () => {
  assert.throws(() => validateConfig({ mode: "shell" }));
  assert.deepEqual(
    validateConfig({ mode: "structured", url: "http://example.org" }),
    { mode: "structured" },
  );
});
test("overlap requires intersecting measured intervals, not just two calls", () => {
  assert.equal(
    intervalsOverlap([
      { startMs: 0, endMs: 10 },
      { startMs: 5, endMs: 15 },
    ]),
    true,
  );
  assert.equal(
    intervalsOverlap([
      { startMs: 0, endMs: 10 },
      { startMs: 10, endMs: 20 },
    ]),
    false,
  );
});
test("friendly HTTP failures remain tool error results with useful context", () => {
  const r = friendlyFailure(503);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /503/);
  assert.match(r.content[0].text, /intentional failure/);
});
test("embedded resource carries inline text and an identifying URI", () => {
  const b = resourceBlock();
  assert.equal(b.type, "resource");
  assert.equal(b.resource.uri, "classroom://lesson23/report");
  assert.match(b.resource.text, /RESOURCE-23/);
});
test("native projections preserve error flags and image metadata without copying image bytes", () => {
  const p = projectToolResult({
    type: "tool_result",
    is_error: true,
    content: [
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "ABCD" },
      },
      { type: "text", text: "Error" },
    ],
  })!;
  assert.equal(p.isError, true);
  assert.equal(p.blocks[0].base64Characters, 4);
  assert.equal(JSON.stringify(p).includes('"ABCD"'), false);
  assert.equal(
    projectToolResult({ type: "text", text: "No tool result" }),
    null,
  );
});
test("structured sample fields retain exact values and identify synthetic classroom data", () => {
  assert.deepEqual(SAMPLE.points, [58, 59, 61, 63, 62]);
  assert.match(SAMPLE.label, /not live weather/);
});
