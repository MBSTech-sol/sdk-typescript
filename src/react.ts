// ─────────────────────────────────────────────────────────────────────────────
//  @mbs/sdk — React Hooks
//  Requires React >=17. Auto-cancels on unmount via AbortController.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { MbsClient } from "./client.js";
import type {
  MbsClientOptions,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelsResponse,
  AgentRunRequest,
  AgentRunResponse,
  Model,
} from "./types.js";

// ── Shared hook state type ────────────────────────────────────────────────────

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

// ── useMBS — top-level hook providing a stable client ────────────────────────

/**
 * Creates and memoizes an MbsClient for use across a component subtree.
 *
 * @example
 * const { client } = useMBS({ baseUrl: "http://localhost:3030" });
 */
export function useMBS(options?: MbsClientOptions): { client: MbsClient } {
  const clientRef = useRef<MbsClient | null>(null);
  // Re-create client only when options change (by reference equality of baseUrl+apiKey)
  const key = `${options?.baseUrl ?? ""}:${options?.apiKey ?? ""}`;
  if (clientRef.current == null) {
    clientRef.current = new MbsClient(options);
  }
  const prevKey = useRef(key);
  if (prevKey.current !== key) {
    clientRef.current = new MbsClient(options);
    prevKey.current = key;
  }
  return { client: clientRef.current };
}

// ── useModels ─────────────────────────────────────────────────────────────────

/**
 * Fetches the list of available models. Automatically cancels on unmount.
 *
 * @example
 * const { models, loading, error } = useModels(client);
 */
export function useModels(client: MbsClient): AsyncState<Model[]> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<Model[]>>({
    data: null,
    loading: true,
    error: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    client
      .models(controller.signal)
      .then((resp: ModelsResponse) =>
        setState({ data: resp.data, loading: false, error: null })
      )
      .catch((err: Error) => {
        if (err.name !== "AbortError") {
          setState({ data: null, loading: false, error: err });
        }
      });

    return () => controller.abort();
  }, [client, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refetch };
}

// ── useChat ───────────────────────────────────────────────────────────────────

export interface UseChatReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: Error | null;
  /** Send a user message and get an assistant reply. */
  send: (content: string) => Promise<void>;
  /** Clear the conversation history. */
  clear: () => void;
  /** Abort an in-progress request. */
  abort: () => void;
}

/**
 * Multi-turn chat hook. Maintains conversation history and handles
 * loading / error states. Cancels any in-flight request on unmount.
 *
 * @example
 * const { messages, send, loading } = useChat(client, {
 *   model: "my-model",
 *   system: "You are a helpful assistant.",
 * });
 */
export function useChat(
  client: MbsClient,
  options: {
    model?: string;
    system?: string;
    temperature?: number;
    max_tokens?: number;
  } = {}
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initial: ChatMessage[] = [];
    if (options.system) {
      initial.push({ role: "system", content: options.system });
    }
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel in-flight request when component unmounts
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (loading) return;

      const userMessage: ChatMessage = { role: "user", content };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const req: ChatCompletionRequest = {
        ...(options.model !== undefined && { model: options.model }),
        messages: nextMessages,
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.max_tokens !== undefined && { max_tokens: options.max_tokens }),
        stream: false,
      };

      try {
        const resp: ChatCompletionResponse = await client.chat(req, controller.signal);
        const assistantContent = resp.choices[0]?.message.content ?? "";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantContent },
        ]);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err);
          // Remove the optimistically-added user message on error
          setMessages(messages);
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [client, loading, messages, options.model, options.temperature, options.max_tokens]
  );

  const clear = useCallback(() => {
    const initial: ChatMessage[] = [];
    if (options.system) {
      initial.push({ role: "system", content: options.system });
    }
    setMessages(initial);
    setError(null);
  }, [options.system]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  return { messages, loading, error, send, clear, abort };
}

// ── useChatStream ─────────────────────────────────────────────────────────────

export interface UseChatStreamReturn {
  /** The current partial (accumulating) assistant reply. */
  partial: string;
  /** Previous completed messages. */
  messages: ChatMessage[];
  loading: boolean;
  error: Error | null;
  send: (content: string) => Promise<void>;
  clear: () => void;
  abort: () => void;
}

/**
 * Streaming chat hook. The `partial` field updates token-by-token as the
 * model generates. When generation finishes, the completed text is appended
 * to `messages` and `partial` is reset to "".
 *
 * @example
 * const { messages, partial, send, loading } = useChatStream(client);
 */
export function useChatStream(
  client: MbsClient,
  options: {
    model?: string;
    system?: string;
    temperature?: number;
    max_tokens?: number;
  } = {}
): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initial: ChatMessage[] = [];
    if (options.system) {
      initial.push({ role: "system", content: options.system });
    }
    return initial;
  });
  const [partial, setPartial] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (loading) return;

      const userMessage: ChatMessage = { role: "user", content };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setPartial("");
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = "";

      try {
        const req: ChatCompletionRequest = {
          ...(options.model !== undefined && { model: options.model }),
          messages: nextMessages,
          ...(options.temperature !== undefined && { temperature: options.temperature }),
          ...(options.max_tokens !== undefined && { max_tokens: options.max_tokens }),
        };

        for await (const delta of client.chatStream(req, controller.signal)) {
          accumulated += delta;
          setPartial(accumulated);
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: accumulated },
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

  const clear = useCallback(() => {
    const initial: ChatMessage[] = [];
    if (options.system) {
      initial.push({ role: "system", content: options.system });
    }
    setMessages(initial);
    setPartial("");
    setError(null);
  }, [options.system]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setPartial("");
  }, []);

  return { messages, partial, loading, error, send, clear, abort };
}

// ── useAgent ──────────────────────────────────────────────────────────────────

export interface UseAgentReturn {
  result: AgentRunResponse | null;
  loading: boolean;
  error: Error | null;
  run: (task: string) => Promise<void>;
  abort: () => void;
}

/**
 * Run a ReAct agent task. Cancels on unmount.
 *
 * @example
 * const { run, result, loading } = useAgent(client);
 * await run("Find all TODO comments in this project");
 */
export function useAgent(
  client: MbsClient,
  options: { model?: string; max_iterations?: number } = {}
): UseAgentReturn {
  const [result, setResult] = useState<AgentRunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const run = useCallback(
    async (task: string) => {
      if (loading) return;
      setLoading(true);
      setError(null);
      setResult(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const req: AgentRunRequest = {
        task,
        ...(options.model !== undefined && { model: options.model }),
        ...(options.max_iterations !== undefined && { max_iterations: options.max_iterations }),
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

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  return { result, loading, error, run, abort };
}
