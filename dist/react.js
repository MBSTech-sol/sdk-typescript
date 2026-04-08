"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/react.ts
var react_exports = {};
__export(react_exports, {
  useAgent: () => useAgent,
  useChat: () => useChat,
  useChatStream: () => useChatStream,
  useMBS: () => useMBS,
  useModels: () => useModels
});
module.exports = __toCommonJS(react_exports);
var import_react = require("react");

// src/types.ts
var MbsError = class extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "MbsError";
    this.status = status;
    this.body = body;
    if (typeof body === "object" && body?.error) {
      if (body.error.retry_after_secs !== void 0) {
        this.retryAfterSecs = body.error.retry_after_secs;
      }
      if (body.error.type !== void 0) {
        this.errorType = body.error.type;
      }
    }
  }
};

// src/client.ts
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var RETRYABLE_STATUS = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
async function withRetry(fn, maxRetries, baseDelayMs) {
  let lastError = new Error("Unknown");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable = err instanceof MbsError && RETRYABLE_STATUS.has(err.status);
      if (!isRetryable || attempt === maxRetries) throw lastError;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
      await sleep(delay);
    }
  }
  throw lastError;
}
async function runBatch(items, fn, concurrency) {
  const results = [];
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
          error: s.reason instanceof Error ? s.reason : new Error(String(s.reason))
        });
        failed++;
      }
    }
  }
  return { results, succeeded, failed };
}
var MbsClient = class {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:3030").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 12e4;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    if (options.apiKey) {
      this.headers["Authorization"] = `Bearer ${options.apiKey}`;
    }
  }
  // ── Low-level fetch wrapper ────────────────────────────────────────────────
  async request(method, path, body, signal) {
    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
        const combinedSignal = signal ? this.combineSignals(signal, controller.signal) : controller.signal;
        let resp;
        try {
          resp = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: this.headers,
            body: body != null ? JSON.stringify(body) : null,
            signal: combinedSignal
          });
        } finally {
          clearTimeout(timeoutId);
        }
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          throw new MbsError(
            `MBS API error ${resp.status}: ${text.slice(0, 200)}`,
            resp.status,
            parsed
          );
        }
        const json = await resp.json();
        return json;
      },
      this.maxRetries,
      this.retryBaseDelayMs
    );
  }
  /** Combine two AbortSignals: abort when either fires. */
  combineSignals(a, b) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    a.addEventListener("abort", abort, { once: true });
    b.addEventListener("abort", abort, { once: true });
    return controller.signal;
  }
  // ── Models ─────────────────────────────────────────────────────────────────
  /** List available models. */
  models(signal) {
    return this.request("GET", "/v1/models", void 0, signal);
  }
  /** Load a GGUF model file into VRAM. */
  loadModel(req, signal) {
    return this.request("POST", "/v1/models/load", req, signal);
  }
  /** Unload the current model from VRAM. */
  unloadModel(signal) {
    return this.request("POST", "/v1/models/unload", {}, signal);
  }
  // ── Chat completions ────────────────────────────────────────────────────────
  /** OpenAI-compatible chat completions (non-streaming). */
  chat(req, signal) {
    return this.request(
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
  async *chatStream(req, signal) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const combinedSignal = signal ? this.combineSignals(signal, controller.signal) : controller.signal;
    let resp;
    try {
      resp = await fetch(`${this.baseUrl}/v1/stream`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          prompt: req.messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
          temperature: req.temperature,
          max_tokens: req.max_tokens,
          model: req.model
        }),
        signal: combinedSignal
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
            const chunk = JSON.parse(data);
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {
      });
    }
  }
  // ── Text completions ────────────────────────────────────────────────────────
  /** OpenAI-compatible text completions. */
  complete(req, signal) {
    return this.request("POST", "/v1/completions", req, signal);
  }
  // ── Embeddings ──────────────────────────────────────────────────────────────
  /** Generate embeddings for one or more strings. */
  embed(req, signal) {
    return this.request("POST", "/v1/embeddings", req, signal);
  }
  // ── Images ─────────────────────────────────────────────────────────────────
  /** Generate an image from a text prompt. */
  generateImage(req, signal) {
    return this.request(
      "POST",
      "/v1/images/generations",
      req,
      signal
    );
  }
  // ── Agents ─────────────────────────────────────────────────────────────────
  /** Run a ReAct-style agent task. */
  runAgent(req, signal) {
    return this.request("POST", "/v1/agents/run", req, signal);
  }
  // ── MCP Tools ──────────────────────────────────────────────────────────────
  /** List registered MCP tools. */
  listTools(signal) {
    return this.request("GET", "/v1/mcp/tools", void 0, signal);
  }
  /** Invoke an MCP tool. */
  invokeTool(req, signal) {
    return this.request("POST", "/v1/mcp/tools/invoke", req, signal);
  }
  // ── Anthropic pass-through ─────────────────────────────────────────────────
  /** Anthropic-compatible messages endpoint (proxied to local LLM). */
  anthropicMessages(req, signal) {
    return this.request("POST", "/v1/messages", req, signal);
  }
  // ── Model Pool ─────────────────────────────────────────────────────────────
  /** List all models in the pool. */
  listPoolModels(signal) {
    return this.request("GET", "/v1/pool", void 0, signal);
  }
  /** Add a model to the pool. */
  addPoolModel(req, signal) {
    return this.request("POST", "/v1/pool/add", req, signal);
  }
  /** Remove a model from the pool. */
  removePoolModel(name, signal) {
    return this.request("POST", "/v1/pool/remove", { name }, signal);
  }
  /** Set the pool routing strategy. */
  setPoolStrategy(strategy, signal) {
    return this.request("POST", "/v1/pool/strategy", { strategy }, signal);
  }
  /** Switch a conversation to a specific model. */
  switchModel(req, signal) {
    return this.request("POST", "/v1/models/switch", req, signal);
  }
  /** Trigger CPU fallback for a model. */
  cpuFallback(model_name, signal) {
    return this.request("POST", "/v1/models/fallback", { model_name }, signal);
  }
  // ── Analytics ──────────────────────────────────────────────────────────────
  /** Get usage analytics summary. */
  getAnalytics(signal) {
    return this.request("GET", "/v1/analytics", void 0, signal);
  }
  /** Reset all analytics data. */
  resetAnalytics(signal) {
    return this.request("POST", "/v1/analytics/reset", {}, signal);
  }
  /** Set per-key token quota. */
  setKeyQuota(apiKey, dailyTokens, signal) {
    return this.request("POST", "/v1/analytics/quota", { api_key: apiKey, daily_tokens: dailyTokens }, signal);
  }
  /** Update global quota configuration. */
  setQuotaConfig(config, signal) {
    return this.request("POST", "/v1/analytics/config", config, signal);
  }
  // ── Webhooks ───────────────────────────────────────────────────────────────
  /** List all registered webhooks. */
  listWebhooks(signal) {
    return this.request("GET", "/v1/webhooks", void 0, signal);
  }
  /** Register a new webhook endpoint. */
  addWebhook(req, signal) {
    return this.request("POST", "/v1/webhooks", req, signal);
  }
  /** Remove a webhook by ID. */
  removeWebhook(id, signal) {
    return this.request("POST", "/v1/webhooks", { id }, signal);
  }
  // ── Health & Metrics ───────────────────────────────────────────────────────
  /** Get detailed component health status. */
  getHealth(signal) {
    return this.request("GET", "/v1/health", void 0, signal);
  }
  /** Get request queue status. */
  getQueueStatus(signal) {
    return this.request("GET", "/v1/queue/status", void 0, signal);
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
  batchChat(batch, signal) {
    return runBatch(
      batch.requests,
      (req) => this.chat(req, signal),
      batch.concurrency ?? 5
    );
  }
  /**
   * Run multiple completions concurrently.
   */
  batchComplete(batch, signal) {
    return runBatch(
      batch.requests,
      (req) => this.complete(req, signal),
      batch.concurrency ?? 5
    );
  }
  /**
   * Run multiple embedding requests concurrently.
   */
  batchEmbed(batch, signal) {
    return runBatch(
      batch.requests,
      (req) => this.embed(req, signal),
      batch.concurrency ?? 5
    );
  }
  // ── Health check ────────────────────────────────────────────────────────────
  /** Returns true if the server is reachable. */
  async ping(signal) {
    try {
      await this.models(signal);
      return true;
    } catch {
      return false;
    }
  }
};

// src/react.ts
function useMBS(options) {
  const clientRef = (0, import_react.useRef)(null);
  const key = `${options?.baseUrl ?? ""}:${options?.apiKey ?? ""}`;
  if (clientRef.current == null) {
    clientRef.current = new MbsClient(options);
  }
  const prevKey = (0, import_react.useRef)(key);
  if (prevKey.current !== key) {
    clientRef.current = new MbsClient(options);
    prevKey.current = key;
  }
  return { client: clientRef.current };
}
function useModels(client) {
  const [state, setState] = (0, import_react.useState)({
    data: null,
    loading: true,
    error: null
  });
  const [tick, setTick] = (0, import_react.useState)(0);
  (0, import_react.useEffect)(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    client.models(controller.signal).then(
      (resp) => setState({ data: resp.data, loading: false, error: null })
    ).catch((err) => {
      if (err.name !== "AbortError") {
        setState({ data: null, loading: false, error: err });
      }
    });
    return () => controller.abort();
  }, [client, tick]);
  const refetch = (0, import_react.useCallback)(() => setTick((t) => t + 1), []);
  return { ...state, refetch };
}
function useChat(client, options = {}) {
  const [messages, setMessages] = (0, import_react.useState)(() => {
    const initial = [];
    if (options.system) {
      initial.push({ role: "system", content: options.system });
    }
    return initial;
  });
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const abortRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  const send = (0, import_react.useCallback)(
    async (content) => {
      if (loading) return;
      const userMessage = { role: "user", content };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setLoading(true);
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      const req = {
        ...options.model !== void 0 && { model: options.model },
        messages: nextMessages,
        ...options.temperature !== void 0 && { temperature: options.temperature },
        ...options.max_tokens !== void 0 && { max_tokens: options.max_tokens },
        stream: false
      };
      try {
        const resp = await client.chat(req, controller.signal);
        const assistantContent = resp.choices[0]?.message.content ?? "";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantContent }
        ]);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err);
          setMessages(messages);
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [client, loading, messages, options.model, options.temperature, options.max_tokens]
  );
  const clear = (0, import_react.useCallback)(() => {
    const initial = [];
    if (options.system) {
      initial.push({ role: "system", content: options.system });
    }
    setMessages(initial);
    setError(null);
  }, [options.system]);
  const abort = (0, import_react.useCallback)(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);
  return { messages, loading, error, send, clear, abort };
}
function useChatStream(client, options = {}) {
  const [messages, setMessages] = (0, import_react.useState)(() => {
    const initial = [];
    if (options.system) {
      initial.push({ role: "system", content: options.system });
    }
    return initial;
  });
  const [partial, setPartial] = (0, import_react.useState)("");
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const abortRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  const send = (0, import_react.useCallback)(
    async (content) => {
      if (loading) return;
      const userMessage = { role: "user", content };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setPartial("");
      setLoading(true);
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      let accumulated = "";
      try {
        const req = {
          ...options.model !== void 0 && { model: options.model },
          messages: nextMessages,
          ...options.temperature !== void 0 && { temperature: options.temperature },
          ...options.max_tokens !== void 0 && { max_tokens: options.max_tokens }
        };
        for await (const delta of client.chatStream(req, controller.signal)) {
          accumulated += delta;
          setPartial(accumulated);
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: accumulated }
        ]);
        setPartial("");
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err);
          setMessages(messages);
        }
        setPartial("");
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [client, loading, messages, options.model, options.temperature, options.max_tokens]
  );
  const clear = (0, import_react.useCallback)(() => {
    const initial = [];
    if (options.system) {
      initial.push({ role: "system", content: options.system });
    }
    setMessages(initial);
    setPartial("");
    setError(null);
  }, [options.system]);
  const abort = (0, import_react.useCallback)(() => {
    abortRef.current?.abort();
    setLoading(false);
    setPartial("");
  }, []);
  return { messages, partial, loading, error, send, clear, abort };
}
function useAgent(client, options = {}) {
  const [result, setResult] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const abortRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  const run = (0, import_react.useCallback)(
    async (task) => {
      if (loading) return;
      setLoading(true);
      setError(null);
      setResult(null);
      const controller = new AbortController();
      abortRef.current = controller;
      const req = {
        task,
        ...options.model !== void 0 && { model: options.model },
        ...options.max_iterations !== void 0 && { max_iterations: options.max_iterations }
      };
      try {
        const resp = await client.runAgent(req, controller.signal);
        setResult(resp);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err);
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [client, loading, options.model, options.max_iterations]
  );
  const abort = (0, import_react.useCallback)(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);
  return { result, loading, error, run, abort };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  useAgent,
  useChat,
  useChatStream,
  useMBS,
  useModels
});
