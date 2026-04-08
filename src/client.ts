// ─────────────────────────────────────────────────────────────────────────────
//  @mbs/sdk — HTTP Client
//  Auto-retry, cancellation, connection pooling, batch processing
// ─────────────────────────────────────────────────────────────────────────────

import type {
  MbsClientOptions,
  ModelsResponse,
  ModelLoadRequest,
  ModelLoadResponse,
  ModelUnloadResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamRequest,
  StreamChunk,
  ImageGenerationRequest,
  ImageGenerationResponse,
  AgentRunRequest,
  AgentRunResponse,
  McpToolsResponse,
  McpInvokeRequest,
  McpInvokeResponse,
  AnthropicMessagesRequest,
  AnthropicMessagesResponse,
  BatchRequest,
  BatchResult,
  PoolModel,
  PoolAddRequest,
  ModelSwitchRequest,
  AnalyticsSummary,
  QuotaConfigUpdate,
  WebhookItem,
  WebhookListResponse,
  WebhookAddRequest,
  HealthResponse,
  QueueStatus,
} from "./types.js";
import { MbsError } from "./types.js";

// ── Sleep helper ──────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ── Retry logic ───────────────────────────────────────────────────────────────

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number
): Promise<T> {
  let lastError: Error = new Error("Unknown");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable =
        err instanceof MbsError && RETRYABLE_STATUS.has(err.status);
      if (!isRetryable || attempt === maxRetries) throw lastError;
      // Exponential backoff with jitter: baseDelay * 2^attempt + random(0-100ms)
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
      await sleep(delay);
    }
  }
  throw lastError;
}

// ── Concurrent batch helper ───────────────────────────────────────────────────

async function runBatch<TReq, TRes>(
  items: TReq[],
  fn: (item: TReq) => Promise<TRes>,
  concurrency: number
): Promise<BatchResult<TRes>> {
  const results: BatchResult<TRes>["results"] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((item) => fn(item)));
    for (const s of settled) {
      if (s.status === "fulfilled") {
        results.push({ ok: true, value: s.value });
        succeeded++;
      } else {
        results.push({
          ok: false,
          error: s.reason instanceof Error ? s.reason : new Error(String(s.reason)),
        });
        failed++;
      }
    }
  }

  return { results, succeeded, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
//  MbsClient
// ─────────────────────────────────────────────────────────────────────────────

export class MbsClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(options: MbsClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:3030").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (options.apiKey) {
      this.headers["Authorization"] = `Bearer ${options.apiKey}`;
    }
  }

  // ── Low-level fetch wrapper ────────────────────────────────────────────────

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
        // Allow external signal to also cancel
        const combinedSignal = signal
          ? this.combineSignals(signal, controller.signal)
          : controller.signal;

        let resp: Response;
        try {
          resp = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: this.headers,
            body: body != null ? JSON.stringify(body) : null,
            signal: combinedSignal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          let parsed: unknown;
          try { parsed = JSON.parse(text); } catch { parsed = text; }
          throw new MbsError(
            `MBS API error ${resp.status}: ${text.slice(0, 200)}`,
            resp.status,
            parsed as MbsError["body"]
          );
        }

        const json = await resp.json() as T;
        return json;
      },
      this.maxRetries,
      this.retryBaseDelayMs
    );
  }

  /** Combine two AbortSignals: abort when either fires. */
  private combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const abort = () => controller.abort();
    a.addEventListener("abort", abort, { once: true });
    b.addEventListener("abort", abort, { once: true });
    return controller.signal;
  }

  // ── Models ─────────────────────────────────────────────────────────────────

  /** List available models. */
  models(signal?: AbortSignal): Promise<ModelsResponse> {
    return this.request<ModelsResponse>("GET", "/v1/models", undefined, signal);
  }

  /** Load a GGUF model file into VRAM. */
  loadModel(req: ModelLoadRequest, signal?: AbortSignal): Promise<ModelLoadResponse> {
    return this.request<ModelLoadResponse>("POST", "/v1/models/load", req, signal);
  }

  /** Unload the current model from VRAM. */
  unloadModel(signal?: AbortSignal): Promise<ModelUnloadResponse> {
    return this.request<ModelUnloadResponse>("POST", "/v1/models/unload", {}, signal);
  }

  // ── Chat completions ────────────────────────────────────────────────────────

  /** OpenAI-compatible chat completions (non-streaming). */
  chat(req: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse> {
    return this.request<ChatCompletionResponse>(
      "POST",
      "/v1/chat/completions",
      { ...req, stream: false },
      signal
    );
  }

  /**
   * SSE streaming chat completions.
   * Returns an async generator that yields decoded text deltas.
   *
   * @example
   * for await (const delta of client.chatStream({ messages: [...] })) {
   *   process.stdout.write(delta);
   * }
   */
  async *chatStream(
    req: ChatCompletionRequest,
    signal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const combinedSignal = signal
      ? this.combineSignals(signal, controller.signal)
      : controller.signal;

    let resp: Response;
    try {
      resp = await fetch(`${this.baseUrl}/v1/stream`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          prompt: req.messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
          temperature: req.temperature,
          max_tokens: req.max_tokens,
          model: req.model,
        }),
        signal: combinedSignal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!resp.ok || resp.body == null) {
      const text = await resp.text().catch(() => "");
      throw new MbsError(`Stream error ${resp.status}: ${text}`, resp.status, text);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          try {
            const chunk = JSON.parse(data) as StreamChunk;
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // skip malformed chunk
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  // ── Text completions ────────────────────────────────────────────────────────

  /** OpenAI-compatible text completions. */
  complete(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse> {
    return this.request<CompletionResponse>("POST", "/v1/completions", req, signal);
  }

  // ── Embeddings ──────────────────────────────────────────────────────────────

  /** Generate embeddings for one or more strings. */
  embed(req: EmbeddingRequest, signal?: AbortSignal): Promise<EmbeddingResponse> {
    return this.request<EmbeddingResponse>("POST", "/v1/embeddings", req, signal);
  }

  // ── Images ─────────────────────────────────────────────────────────────────

  /** Generate an image from a text prompt. */
  generateImage(
    req: ImageGenerationRequest,
    signal?: AbortSignal
  ): Promise<ImageGenerationResponse> {
    return this.request<ImageGenerationResponse>(
      "POST",
      "/v1/images/generations",
      req,
      signal
    );
  }

  // ── Agents ─────────────────────────────────────────────────────────────────

  /** Run a ReAct-style agent task. */
  runAgent(req: AgentRunRequest, signal?: AbortSignal): Promise<AgentRunResponse> {
    return this.request<AgentRunResponse>("POST", "/v1/agents/run", req, signal);
  }

  // ── MCP Tools ──────────────────────────────────────────────────────────────

  /** List registered MCP tools. */
  listTools(signal?: AbortSignal): Promise<McpToolsResponse> {
    return this.request<McpToolsResponse>("GET", "/v1/mcp/tools", undefined, signal);
  }

  /** Invoke an MCP tool. */
  invokeTool(req: McpInvokeRequest, signal?: AbortSignal): Promise<McpInvokeResponse> {
    return this.request<McpInvokeResponse>("POST", "/v1/mcp/tools/invoke", req, signal);
  }

  // ── Anthropic pass-through ─────────────────────────────────────────────────

  /** Anthropic-compatible messages endpoint (proxied to local LLM). */
  anthropicMessages(
    req: AnthropicMessagesRequest,
    signal?: AbortSignal
  ): Promise<AnthropicMessagesResponse> {
    return this.request<AnthropicMessagesResponse>("POST", "/v1/messages", req, signal);
  }

  // ── Model Pool ─────────────────────────────────────────────────────────────

  /** List all models in the pool. */
  listPoolModels(signal?: AbortSignal): Promise<PoolModel[]> {
    return this.request<PoolModel[]>("GET", "/v1/pool", undefined, signal);
  }

  /** Add a model to the pool. */
  addPoolModel(req: PoolAddRequest, signal?: AbortSignal): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", "/v1/pool/add", req, signal);
  }

  /** Remove a model from the pool. */
  removePoolModel(name: string, signal?: AbortSignal): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", "/v1/pool/remove", { name }, signal);
  }

  /** Set the pool routing strategy. */
  setPoolStrategy(strategy: "RoundRobin" | "LeastLoaded" | "ByModelName", signal?: AbortSignal): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", "/v1/pool/strategy", { strategy }, signal);
  }

  /** Switch a conversation to a specific model. */
  switchModel(req: ModelSwitchRequest, signal?: AbortSignal): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", "/v1/models/switch", req, signal);
  }

  /** Trigger CPU fallback for a model. */
  cpuFallback(model_name: string, signal?: AbortSignal): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", "/v1/models/fallback", { model_name }, signal);
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  /** Get usage analytics summary. */
  getAnalytics(signal?: AbortSignal): Promise<AnalyticsSummary> {
    return this.request<AnalyticsSummary>("GET", "/v1/analytics", undefined, signal);
  }

  /** Reset all analytics data. */
  resetAnalytics(signal?: AbortSignal): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", "/v1/analytics/reset", {}, signal);
  }

  /** Set per-key token quota. */
  setKeyQuota(apiKey: string, dailyTokens: number | null, signal?: AbortSignal): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", "/v1/analytics/quota", { api_key: apiKey, daily_tokens: dailyTokens }, signal);
  }

  /** Update global quota configuration. */
  setQuotaConfig(config: QuotaConfigUpdate, signal?: AbortSignal): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", "/v1/analytics/config", config, signal);
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  /** List all registered webhooks. */
  listWebhooks(signal?: AbortSignal): Promise<WebhookListResponse> {
    return this.request<WebhookListResponse>("GET", "/v1/webhooks", undefined, signal);
  }

  /** Register a new webhook endpoint. */
  addWebhook(req: WebhookAddRequest, signal?: AbortSignal): Promise<WebhookItem> {
    return this.request<WebhookItem>("POST", "/v1/webhooks", req, signal);
  }

  /** Remove a webhook by ID. */
  removeWebhook(id: string, signal?: AbortSignal): Promise<{ status: string }> {
    return this.request<{ status: string }>("POST", "/v1/webhooks", { id }, signal);
  }

  // ── Health & Metrics ───────────────────────────────────────────────────────

  /** Get detailed component health status. */
  getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/v1/health", undefined, signal);
  }

  /** Get request queue status. */
  getQueueStatus(signal?: AbortSignal): Promise<QueueStatus> {
    return this.request<QueueStatus>("GET", "/v1/queue/status", undefined, signal);
  }

  // ── Batch processing ────────────────────────────────────────────────────────

  /**
   * Run multiple chat requests concurrently with controlled parallelism.
   * Failed requests are captured in the result rather than throwing.
   *
   * @example
   * const { results, succeeded, failed } = await client.batchChat({
   *   requests: prompts.map(p => ({ messages: [{ role: "user", content: p }] })),
   *   concurrency: 4,
   * });
   */
  batchChat(
    batch: BatchRequest<ChatCompletionRequest>,
    signal?: AbortSignal
  ): Promise<BatchResult<ChatCompletionResponse>> {
    return runBatch(
      batch.requests,
      (req) => this.chat(req, signal),
      batch.concurrency ?? 5
    );
  }

  /**
   * Run multiple completions concurrently.
   */
  batchComplete(
    batch: BatchRequest<CompletionRequest>,
    signal?: AbortSignal
  ): Promise<BatchResult<CompletionResponse>> {
    return runBatch(
      batch.requests,
      (req) => this.complete(req, signal),
      batch.concurrency ?? 5
    );
  }

  /**
   * Run multiple embedding requests concurrently.
   */
  batchEmbed(
    batch: BatchRequest<EmbeddingRequest>,
    signal?: AbortSignal
  ): Promise<BatchResult<EmbeddingResponse>> {
    return runBatch(
      batch.requests,
      (req) => this.embed(req, signal),
      batch.concurrency ?? 5
    );
  }

  // ── Health check ────────────────────────────────────────────────────────────

  /** Returns true if the server is reachable. */
  async ping(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.models(signal);
      return true;
    } catch {
      return false;
    }
  }
}
