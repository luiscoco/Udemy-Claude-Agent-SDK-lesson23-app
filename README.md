# Claude Agent SDK · Lesson 23 · Advanced custom tools

Based on Lesson23_Custom_Tools_Advanced.pptx. Five linked student pages with large text and coloured code in every UML step.

## What you will learn

- Annotate truthfully: readOnlyHint allows read-only calls to run concurrently. The app measures actual handler intervals and reports overlap. An annotation does not enforce behavior or guarantee a particular schedule.
- Return useful tool errors: A controlled local endpoint really returns HTTP 503. The handler returns isError: true with context. A second experiment throws a controlled exception so you can inspect the SDK-converted error result.
- Keep tool and query outcomes separate: The SDK can deliver a tool error to Claude and still finish the query successfully. This is distinct from a model API, process or transport failure, which can still terminate a run.
- Send images as actual bytes: The handler fetches a PNG from this app and returns raw base64 plus image/png. The chart is clearly labelled classroom sample data, not live weather. Inspect its image hash and the native image block.
- Embed resource content: The report uses a classroom URI with inline Markdown text. The URI identifies the supplied content; the app does not read a file from that URI. Text, images and resources can appear together.
- Return exact structured fields: The structured experiment returns a sample chart and its exact JSON points. Compare the native forwarded blocks: structured data, image and resource remain, while a duplicate text sentinel is omitted.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson23-app.git
cd .\Udemy-Claude-Agent-SDK-lesson23-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations use `cd .\agent-sdk\lesson23-advanced-tools` instead of cloning. Open http://127.0.0.1:3123 and keep the terminal running. Node.js 24+, API credit, model access and internet are required. Windows may require Git Bash. No separate MCP server is needed.

## Create your .env file

Copy .env.example only if .env does not exist. Enter your key privately and restart after edits. The startup script loads this file; existing shell values take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3123
# Optional on Windows: CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe
```

No Managed Agents IDs are required. Real .env, media, private workspaces and dependencies are excluded from Git.

## Run the experiments

### Measure read-only calls and inspect errors

Compare actual handler intervals. Then run the intentional HTTP 503 and uncaught exception. Tool error flags and the final query status are different evidence.

```powershell
npm run sample:env -- parallel-readonly
npm run sample:env -- friendly-error
npm run sample:env -- uncaught-error
```

### Inspect image and resource content

The image is bundled classroom sample data served over actual local HTTP. The report carries its content inline. Inspect native tool-result blocks as well as the formatted answer.

```powershell
npm run sample:env -- image
npm run sample:env -- resource
```

### Compare structured and mixed results

Structured mode pairs exact JSON with image and resource blocks, and tests a duplicate-text sentinel. Mixed mode keeps ordinary text alongside image and resource content.

```powershell
npm run sample:env -- structured
npm run sample:env -- mixed
npm test
```

## How the app was built

### 1. Validate the experiment

Accept only the seven classroom tasks. Browser input does not supply executable handlers or arbitrary service URLs.

Source: `src/agent.ts`, lines 59–61. Selected source; surrounding code omitted.

```typescript
return { mode: (value as RunConfig).mode };
}
export function projectToolResult(value: unknown): ToolProjection | null {
```

### 2. Annotate tool behavior

These hints describe read-only behavior. They do not enforce it. The app measures overlap instead of assuming a schedule from the annotation.

Source: `src/tools.ts`, lines 17–22. Selected source; surrounding code omitted.

```typescript
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
```

### 3. Register the advanced server

Wrap the selected tool definitions in an in-process MCP server. The server runs in this Node host while the model remains remote.

Source: `src/tools.ts`, lines 307–312. Selected source; surrounding code omitted.

```typescript
return createSdkMcpServer({
    name: "advanced",
    version: "1.0.0",
    tools: selected,
    alwaysLoad: true,
  });
```

### 4. Configure tool access

Remove built-ins and register only the selected custom tools. The full advanced namespace is pre-approved for this classroom experiment.

Source: `src/agent.ts`, lines 125–128. Selected source; surrounding code omitted.

```typescript
tools: [],
    mcpServers,
    allowedTools: ["mcp__advanced__*"],
    settingSources: [],
```

### 5. Start the actual query

Streaming input keeps the in-process MCP exchange open. The SDK manages the model and tool loop; the host reads actual messages.

Source: `src/agent.ts`, lines 189–191. Selected source; surrounding code omitted.

```typescript
const run = query({ prompt: input(), options });
  let text = "",
    status = "no_result",
```

### 6. Measure handler intervals

Record start and end times on a monotonic clock. Weather includes a labelled seven-hundred-millisecond teaching delay. Only intersecting observed intervals count as overlap.

Source: `src/tools.ts`, lines 64–67. Selected source; surrounding code omitted.

```typescript
const startMs = now();
      const coords =
        args.city === "Madrid" ? [40.4168, -3.7038] : [37.7749, -122.4194];
      const url = new URL("https://api.open-meteo.com/v1/forecast");
```

### 7. Return a friendly tool failure

An intentional local HTTP 503 becomes a composed isError result. It is not a successful data response, and the model is asked not to retry.

Source: `src/tools.ts`, lines 141–144. Selected source; surrounding code omitted.

```typescript
const result = friendlyFailure(response.status);
        record({
          name: "fetch_data",
          args,
```

### 8. Observe exception conversion

This controlled uncaught handler exception is converted by the SDK MCP server to an error tool result. Other kinds of SDK or transport failures can still end a query.

Source: `src/tools.ts`, lines 188–188. Selected source; surrounding code omitted.

```typescript
throw new Error("Classroom upstream unavailable (intentional)");
```

### 9. Encode an actual PNG

The handler fetches the bundled sample PNG and returns raw base64 with image/png. The source image is labelled classroom data, not live weather.

Source: `src/tools.ts`, lines 226–230. Selected source; surrounding code omitted.

```typescript
const image = {
        type: "image" as const,
        data: buffer.toString("base64"),
        mimeType: "image/png",
      };
```

### 10. Embed a report by URI

The resource carries its Markdown text inline. The classroom URI is a label; no filesystem read from that URI is implied.

Source: `src/tools.ts`, lines 33–40. Selected source; surrounding code omitted.

```typescript
export function resourceBlock() {
  return {
    type: "resource" as const,
    resource: {
      uri: "classroom://lesson23/report",
      mimeType: "text/markdown",
      text: REPORT,
    },
```

### 11. Return exact structured fields

Structured JSON is forwarded with the image and inline resource. The redundant text sentinel is not forwarded in the observed SDK tool result.

Source: `src/tools.ts`, lines 258–258. Selected source; surrounding code omitted.

```typescript
return { content, structuredContent: SAMPLE };
```

### 12. Inspect native tool-result blocks

Project actual native tool results, preserving error flags and block metadata. Do not dump base64 into the interface or infer forwarding from the model answer alone.

Source: `src/agent.ts`, lines 221–226. Selected source; surrounding code omitted.

```typescript
if (message.type === "user" && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          const projection = projectToolResult(block);
          if (projection) {
            nativeResults.push(projection);
            emit({ type: "native-result", projection });
```

### 13. Render text beside evidence

Sanitize and format model Markdown. Keep model text separate from handler timings, original block types and actual SDK-forwarded results.

Source: `src/client.ts`, lines 31–33. Selected source; surrounding code omitted.

```typescript
if (e.type === "answer") renderMarkdown($("answer"), e.text);
  if (e.type === "result") {
    $("status").textContent = e.status;
```

## Reference topics and limits

- Annotations are not guards: readOnlyHint permits concurrency but does not guarantee it. The other three hints are descriptive. This app records intervals and labels a 700 ms teaching delay; the reported overlap is an observation, not a benchmark.
- Controlled error demonstrations: The HTTP 503 endpoint and thrown exception are intentional classroom failures. Both travel through real SDK tool calls. A success query status does not convert the error into successful data. API authentication, budget, process and transport failures can still terminate a run.
- Original and forwarded results: Handler evidence shows what the function returned. Native-result projections show the SDK user tool_result content after conversion. Image bytes are represented by MIME type and length. The structured-data experiment checks the duplicate-text sentinel directly.
- Sample chart and inline resource: The bundled PNG uses fixed points 58, 59, 61, 63, 62. It is not weather fetched from Open-Meteo. The report embeds text using a classroom URI. Neither URI access nor file creation is implied.
- Tool search and process boundaries: This small server uses alwaysLoad for its schemas. Deferred tool search is not demonstrated. In-process describes the custom server, not the Claude Code child runtime or remote model service.
- Other result types: Audio, resource links and binary resources are reference topics here. Only text, PNG images, inline text resources and structured JSON are executed. Python differs for structuredContent and binary resources; this application teaches TypeScript.
- Rebuild the sample chart: The PNG is bundled, so Python is not needed to run the app. To regenerate it, install matplotlib in your Python environment and run python scripts/create-chart.py. Keep the classroom-data label.
- Reading the UML: The diagram groups setup and alternative classroom experiments. Its weather, error, image and resource paths are not all executed by one query. Use the selected mode and actual trace to follow the relevant path.

## References

- [Custom tools: official SDK documentation](https://code.claude.com/docs/en/agent-sdk/custom-tools)
- [Open-Meteo weather API](https://open-meteo.com/en/docs)
- [Open-Meteo licence and attribution](https://open-meteo.com/en/licence)

Regenerate student pages with `python scripts/build-pages.py`. `npm test` checks interval overlap, error flags, native image projections, resource content and startup without paid model calls.
