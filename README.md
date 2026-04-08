# mbs-workbench — TypeScript SDK for MBS Workbench

[![npm](https://img.shields.io/npm/v/mbs-workbench?color=lime&label=npm)](https://www.npmjs.com/package/mbs-workbench)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Official TypeScript/JavaScript client for [MBS Workbench](https://mbsworkbench.com).
Connects to a running `mbsd` daemon or any OpenAI-compatible server.

## Installation

```bash
npm install mbs-workbench
# or
pnpm add mbs-workbench
# or
yarn add mbs-workbench
```

## Quick Start

```typescript
import { MbsClient } from "mbs-workbench";

const client = new MbsClient({
  baseUrl: "http://127.0.0.1:3030",  // default
  apiKey: process.env.MBS_API_KEY,   // optional
});

// Chat completion
const resp = await client.chat({
  messages: [{ role: "user", content: "Explain Rust ownership in 2 sentences." }],
  temperature: 0.7,
  max_tokens: 200,
});
console.log(resp.choices[0].message.content);

// Streaming
for await (const delta of client.chatStream({
  messages: [{ role: "user", content: "Write a haiku about async/await." }],
})) {
  process.stdout.write(delta);
}

// Embeddings
const { data } = await client.embed({ input: ["hello", "world"] });
console.log(data[0].embedding.length); // vector dimension
```

## React Hooks

```tsx
import { useMBS, useChat, useChatStream, useModels, useAgent } from "@mbs/sdk/react";

function ChatWidget() {
  const { client } = useMBS({ baseUrl: "http://localhost:3030" });
  const { messages, send, loading } = useChat(client, {
    system: "You are a helpful coding assistant.",
  });

  return (
    <div>
      {messages.filter(m => m.role !== "system").map((m, i) => (
        <p key={i}><strong>{m.role}:</strong> {m.content}</p>
      ))}
      <button onClick={() => send("What is Rust?")} disabled={loading}>
        {loading ? "Thinking…" : "Ask"}
      </button>
    </div>
  );
}

function StreamingChat() {
  const { client } = useMBS();
  const { messages, partial, send, loading } = useChatStream(client);

  return (
    <div>
      {messages.map((m, i) => <p key={i}>{m.role}: {m.content}</p>)}
      {loading && <p>assistant: {partial}<span className="cursor">▊</span></p>}
      <button onClick={() => send("Hello!")}>Send</button>
    </div>
  );
}
```

## API Reference

### `MbsClient`

| Method | Description |
|--------|-------------|
| `models(signal?)` | List available models |
| `loadModel(req, signal?)` | Load a `.gguf` file into VRAM |
| `unloadModel(signal?)` | Unload current model from VRAM |
| `chat(req, signal?)` | Chat completion (non-streaming) |
| `chatStream(req, signal?)` | Async generator yielding text deltas |
| `complete(req, signal?)` | Text completion |
| `embed(req, signal?)` | Generate embeddings |
| `generateImage(req, signal?)` | Image generation |
| `runAgent(req, signal?)` | Run ReAct agent task |
| `listTools(signal?)` | List MCP tools |
| `invokeTool(req, signal?)` | Invoke an MCP tool |
| `anthropicMessages(req, signal?)` | Anthropic-compatible messages |
| `batchChat(batch, signal?)` | Concurrent batch chat requests |
| `batchComplete(batch, signal?)` | Concurrent batch completions |
| `batchEmbed(batch, signal?)` | Concurrent batch embeddings |
| `ping(signal?)` | Health check — returns `boolean` |

### React Hooks

| Hook | Description |
|------|-------------|
| `useMBS(options?)` | Create a stable `MbsClient` |
| `useChat(client, options?)` | Multi-turn chat with history |
| `useChatStream(client, options?)` | Streaming chat with `partial` text |
| `useModels(client)` | Fetch model list with `refetch()` |
| `useAgent(client, options?)` | Run agent tasks |

### `MbsClientOptions`

| Option | Default | Description |
|--------|---------|-------------|
| `baseUrl` | `http://127.0.0.1:3030` | Server URL |
| `apiKey` | — | Bearer token |
| `timeoutMs` | `120_000` | Request timeout |
| `maxRetries` | `3` | Retry attempts |
| `retryBaseDelayMs` | `500` | Backoff base delay |

## Error Handling

```typescript
import { MbsError } from "@mbs/sdk";

try {
  await client.chat({ messages: [...] });
} catch (err) {
  if (err instanceof MbsError) {
    console.error(`MBS API error ${err.status}:`, err.message);
  }
}
```

Transient errors (429, 500–504) are automatically retried with exponential backoff.

## Cancellation

All methods accept an optional `AbortSignal`:

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000); // 5s timeout

const resp = await client.chat({ messages: [...] }, controller.signal);
```

React hooks automatically cancel in-flight requests on component unmount.

## Batch Processing

```typescript
const { results, succeeded, failed } = await client.batchChat({
  requests: prompts.map(p => ({
    messages: [{ role: "user", content: p }],
  })),
  concurrency: 4, // max 4 parallel requests
});

for (const r of results) {
  if (r.ok) console.log(r.value.choices[0].message.content);
  else console.error("Failed:", r.error.message);
}
```

## Environment Variables (for `mbs` CLI and Node.js)

| Variable | Description |
|----------|-------------|
| `MBS_HOST` | Override default base URL |
| `MBS_API_KEY` | API key |

## Building from Source

```bash
cd sdk/typescript
pnpm install
pnpm build      # outputs to dist/
pnpm test       # run Vitest tests
pnpm typecheck  # TypeScript type check
```
