import {
  MbsClient
} from "./chunk-UPA45IYS.mjs";

// src/react.ts
import { useState, useEffect, useCallback, useRef } from "react";
function useMBS(options) {
  const clientRef = useRef(null);
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
function useModels(client) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
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
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refetch };
}
function useChat(client, options = {}) {
  const [messages, setMessages] = useState(() => {
    const initial = [];
    if (options.system) {
      initial.push({ role: "system", content: options.system });
    }
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  const send = useCallback(
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
  const clear = useCallback(() => {
    const initial = [];
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
function useChatStream(client, options = {}) {
  const [messages, setMessages] = useState(() => {
    const initial = [];
    if (options.system) {
      initial.push({ role: "system", content: options.system });
    }
    return initial;
  });
  const [partial, setPartial] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  const send = useCallback(
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
  const clear = useCallback(() => {
    const initial = [];
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
function useAgent(client, options = {}) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  const run = useCallback(
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
  const abort = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);
  return { result, loading, error, run, abort };
}
export {
  useAgent,
  useChat,
  useChatStream,
  useMBS,
  useModels
};
