/**
 * @mbs/sdk — TypeScript unit tests (Vitest)
 * Tests the MbsClient using the Fetch API (global.fetch mocked via vi.stubGlobal)
 * Run: pnpm test  OR  npx vitest run
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MbsClient, MbsError } from "../src/index.js";

// ── Fetch mock helpers ──────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200): void {
  const resp = new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resp));
}

function lastFetch(): { method: string; url: string; body: unknown } {
  const mock = vi.mocked(globalThis.fetch);
  const call = mock.mock.calls[0];
  if (!call) throw new Error("fetch was not called");
  const [url, init] = call as [string, RequestInit];
  return {
    method: (init?.method ?? "GET").toUpperCase(),
    url: url.toString(),
    body: init?.body ? JSON.parse(init.body as string) : null,
  };
}

// ── Common payloads ─────────────────────────────────────────────────────────

const modelsPayload = {
  object: "list",
  data: [{ id: "llama-3", object: "model", created: 1000, owned_by: "local" }],
};

const chatPayload = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 1000,
  model: "llama-3",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello!" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("MbsClient", () => {
  let client: MbsClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new MbsClient({ baseUrl: "http://127.0.0.1:3030", maxRetries: 0 });
  });

  // ── models() ──────────────────────────────────────────────────────────────

  it("models() calls GET /v1/models", async () => {
    mockFetch(modelsPayload);
    const resp = await client.models();
    const req = lastFetch();
    expect(req.method).toBe("GET");
    expect(req.url).toBe("http://127.0.0.1:3030/v1/models");
    expect(resp.data[0]?.id).toBe("llama-3");
  });

  // ── chat() ────────────────────────────────────────────────────────────────

  it("chat() calls POST /v1/chat/completions with stream=false", async () => {
    mockFetch(chatPayload);
    const resp = await client.chat({
      messages: [{ role: "user", content: "Hi" }],
    });
    const req = lastFetch();
    expect(req.method).toBe("POST");
    expect(req.url).toContain("/v1/chat/completions");
    expect((req.body as Record<string, unknown>)["stream"]).toBe(false);
    expect(resp.choices[0]?.message.content).toBe("Hello!");
  });

  it("chat() sends temperature and max_tokens when provided", async () => {
    mockFetch(chatPayload);
    await client.chat({
      messages: [{ role: "user", content: "Hi" }],
      temperature: 0.2,
      max_tokens: 512,
    });
    const req = lastFetch();
    expect((req.body as Record<string, unknown>)["temperature"]).toBe(0.2);
    expect((req.body as Record<string, unknown>)["max_tokens"]).toBe(512);
  });

  // ── loadModel() ───────────────────────────────────────────────────────────

  it("loadModel() calls POST /v1/models/load", async () => {
    mockFetch({ success: true, model_name: "llama-3", message: "Loaded" });
    const resp = await client.loadModel({ path: "/models/llama.gguf", name: "llama-3" });
    const req = lastFetch();
    expect(req.url).toContain("/v1/models/load");
    expect(resp.success).toBe(true);
  });

  // ── unloadModel() ─────────────────────────────────────────────────────────

  it("unloadModel() calls POST /v1/models/unload", async () => {
    mockFetch({ success: true, message: "Unloaded" });
    const resp = await client.unloadModel();
    expect(lastFetch().url).toContain("/v1/models/unload");
    expect(resp.success).toBe(true);
  });

  // ── embed() ───────────────────────────────────────────────────────────────

  it("embed() calls POST /v1/embeddings", async () => {
    mockFetch({
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
      model: "llama-3",
      usage: { prompt_tokens: 2, completion_tokens: 0, total_tokens: 2 },
    });
    const resp = await client.embed({ input: "hello" });
    expect(resp.data[0]?.embedding).toHaveLength(2);
  });

  // ── generateImage() ───────────────────────────────────────────────────────

  it("generateImage() calls POST /v1/images/generations", async () => {
    mockFetch({
      created: 1000,
      data: [{ url: "http://example.com/img.png" }],
      revised_prompt: "A photo of a cat",
    });
    const resp = await client.generateImage({ prompt: "A cat" });
    expect(resp.revised_prompt).toBe("A photo of a cat");
  });

  // ── runAgent() ────────────────────────────────────────────────────────────

  it("runAgent() calls POST /v1/agents/run", async () => {
    mockFetch({
      success: true,
      result: "Done",
      iterations: 2,
      reasoning_steps: ["a", "b"],
    });
    const resp = await client.runAgent({ task: "Do something" });
    expect(resp.success).toBe(true);
    expect(resp.iterations).toBe(2);
  });

  // ── listTools() ───────────────────────────────────────────────────────────

  it("listTools() calls GET /v1/mcp/tools", async () => {
    mockFetch({ tools: [{ id: "t1", name: "Tool1", description: "desc" }] });
    const resp = await client.listTools();
    expect(resp.tools[0]?.id).toBe("t1");
    expect(lastFetch().method).toBe("GET");
  });

  // ── invokeTool() ──────────────────────────────────────────────────────────

  it("invokeTool() calls POST /v1/mcp/tools/invoke", async () => {
    mockFetch({ success: true, result: { answer: 42 } });
    const resp = await client.invokeTool({ tool_id: "t1", arguments: { x: 1 } });
    expect(resp.success).toBe(true);
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("throws MbsError on non-2xx response", async () => {
    mockFetch({ error: { message: "Unauthorized", type: "auth_error" } }, 401);
    await expect(client.models()).rejects.toBeInstanceOf(MbsError);
  });

  it("MbsError contains status code", async () => {
    mockFetch({}, 500);
    try {
      await client.models();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MbsError);
      expect((err as MbsError).status).toBe(500);
    }
  });

  // ── batchChat() ───────────────────────────────────────────────────────────

  it("batchChat() returns succeeded/failed counts", async () => {
    // Two requests succeed, one fails
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(chatPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(chatPayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.batchChat({
      requests: [
        { messages: [{ role: "user", content: "q1" }] },
        { messages: [{ role: "user", content: "q2" }] },
        { messages: [{ role: "user", content: "q3" }] },
      ],
      concurrency: 3,
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results).toHaveLength(3);
  });

  // ── ping() ────────────────────────────────────────────────────────────────

  it("ping() returns true on success", async () => {
    mockFetch(modelsPayload);
    expect(await client.ping()).toBe(true);
  });

  it("ping() returns false on error", async () => {
    mockFetch({}, 500);
    expect(await client.ping()).toBe(false);
  });

  // ── Auth header ───────────────────────────────────────────────────────────

  it("sends Authorization header when apiKey provided", async () => {
    mockFetch(modelsPayload);
    const authed = new MbsClient({
      baseUrl: "http://127.0.0.1:3030",
      apiKey: "sk-test",
      maxRetries: 0,
    });
    await authed.models();
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-test");
  });
});
