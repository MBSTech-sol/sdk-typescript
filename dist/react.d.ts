import { AgentRunResponse, ChatMessage, MbsClient, MbsClientOptions, Model } from './index.js';

interface AsyncState<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
}
/**
 * Creates and memoizes an MbsClient for use across a component subtree.
 *
 * @example
 * const { client } = useMBS({ baseUrl: "http://localhost:3030" });
 */
declare function useMBS(options?: MbsClientOptions): {
    client: MbsClient;
};
/**
 * Fetches the list of available models. Automatically cancels on unmount.
 *
 * @example
 * const { models, loading, error } = useModels(client);
 */
declare function useModels(client: MbsClient): AsyncState<Model[]> & {
    refetch: () => void;
};
interface UseChatReturn {
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
declare function useChat(client: MbsClient, options?: {
    model?: string;
    system?: string;
    temperature?: number;
    max_tokens?: number;
}): UseChatReturn;
interface UseChatStreamReturn {
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
declare function useChatStream(client: MbsClient, options?: {
    model?: string;
    system?: string;
    temperature?: number;
    max_tokens?: number;
}): UseChatStreamReturn;
interface UseAgentReturn {
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
declare function useAgent(client: MbsClient, options?: {
    model?: string;
    max_iterations?: number;
}): UseAgentReturn;

export { type AsyncState, type UseAgentReturn, type UseChatReturn, type UseChatStreamReturn, useAgent, useChat, useChatStream, useMBS, useModels };
