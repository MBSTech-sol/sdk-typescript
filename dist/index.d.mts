interface MbsClientOptions {
    /** Base URL of the MBS server (default: http://127.0.0.1:3030) */
    baseUrl?: string;
    /** Bearer token / API key */
    apiKey?: string;
    /** Request timeout in ms (default: 120_000) */
    timeoutMs?: number;
    /** Max retry attempts on transient failures (default: 3) */
    maxRetries?: number;
    /** Base delay for exponential backoff in ms (default: 500) */
    retryBaseDelayMs?: number;
}
interface Model {
    id: string;
    object: "model";
    created: number;
    owned_by: string;
}
interface ModelsResponse {
    object: "list";
    data: Model[];
}
interface ModelLoadRequest {
    /** Absolute path to .gguf file */
    path: string;
    /** Friendly name for the model */
    name?: string;
    /** GPU layers to offload (-1 = all, 0 = CPU only) */
    gpu_layers?: number;
}
interface ModelLoadResponse {
    success: boolean;
    model_name: string;
    message: string;
}
interface ModelUnloadResponse {
    success: boolean;
    message: string;
}
type MessageRole = "system" | "user" | "assistant";
interface ChatMessage {
    role: MessageRole;
    content: string;
}
interface ChatCompletionRequest {
    model?: string;
    messages: ChatMessage[];
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stream?: boolean;
    stop?: string[];
    presence_penalty?: number;
    frequency_penalty?: number;
}
interface ChatCompletionResponse {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: ChatChoice[];
    usage: UsageInfo;
}
interface ChatChoice {
    index: number;
    message: ChatMessage;
    finish_reason: "stop" | "length" | "content_filter";
}
interface CompletionRequest {
    model?: string;
    prompt: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    stop?: string[];
}
interface CompletionResponse {
    id: string;
    object: "text_completion";
    created: number;
    model: string;
    choices: CompletionChoice[];
    usage: UsageInfo;
}
interface CompletionChoice {
    index: number;
    text: string;
    finish_reason: "stop" | "length";
}
interface EmbeddingRequest {
    model?: string;
    input: string | string[];
}
interface EmbeddingResponse {
    object: "list";
    data: EmbeddingObject[];
    model: string;
    usage: UsageInfo;
}
interface EmbeddingObject {
    object: "embedding";
    index: number;
    embedding: number[];
}
interface StreamRequest {
    prompt: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
}
interface StreamChunk {
    id: string;
    object: "chat.completion.chunk";
    created: number;
    model: string;
    choices: StreamChoice[];
}
interface StreamChoice {
    index: number;
    delta: {
        content?: string;
        role?: string;
    };
    finish_reason: "stop" | "length" | null;
}
interface ImageGenerationRequest {
    prompt: string;
    n?: number;
    size?: string;
}
interface ImageGenerationResponse {
    created: number;
    data: ImageData[];
    revised_prompt?: string;
}
interface ImageData {
    url?: string;
    b64_json?: string;
}
interface AgentRunRequest {
    task: string;
    model?: string;
    max_iterations?: number;
}
interface AgentRunResponse {
    success: boolean;
    result: string;
    iterations: number;
    reasoning_steps: string[];
}
interface McpTool {
    id: string;
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
}
interface McpToolsResponse {
    tools: McpTool[];
}
interface McpInvokeRequest {
    tool_id: string;
    arguments?: Record<string, unknown>;
}
interface McpInvokeResponse {
    success: boolean;
    result: unknown;
    error?: string;
}
interface AnthropicMessage {
    role: "user" | "assistant";
    content: string;
}
interface AnthropicMessagesRequest {
    model: string;
    max_tokens: number;
    messages: AnthropicMessage[];
    system?: string;
    temperature?: number;
}
interface AnthropicMessagesResponse {
    id: string;
    type: "message";
    role: "assistant";
    content: Array<{
        type: "text";
        text: string;
    }>;
    model: string;
    stop_reason: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}
interface MbsApiError {
    error: {
        message: string;
        type: string;
        code?: string;
        /** Seconds to wait before retrying (present on 429 responses) */
        retry_after_secs?: number;
    };
}
declare class MbsError extends Error {
    readonly status: number;
    readonly body: MbsApiError | string;
    /** Seconds to wait before retrying, if the server suggested one */
    readonly retryAfterSecs?: number;
    /** Structured error type from the server (e.g. "quota_exceeded", "model_not_loaded") */
    readonly errorType?: string;
    constructor(message: string, status: number, body: MbsApiError | string);
}
interface BatchRequest<T> {
    requests: T[];
    /** Max concurrent requests (default: 5) */
    concurrency?: number;
}
interface BatchResult<T> {
    results: Array<{
        ok: true;
        value: T;
    } | {
        ok: false;
        error: Error;
    }>;
    succeeded: number;
    failed: number;
}
interface UsageInfo {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}
interface PoolModel {
    name: string;
    path: string;
    gpu_layers: number;
    loaded: boolean;
    requests_handled: number;
    active_requests: number;
    errors: number;
    added_at: string;
    cpu_fallback: boolean;
}
interface PoolAddRequest {
    path: string;
    name: string;
    gpu_layers?: number;
    auto_load?: boolean;
}
interface ModelSwitchRequest {
    conversation_id: string;
    model_name: string;
}
interface AnalyticsSummary {
    total_requests: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    total_cost_usd: number;
    active_keys: number;
    per_key: KeyUsage[];
    per_route: RouteStats[];
    quota_config: QuotaConfig;
}
interface KeyUsage {
    api_key_hint: string;
    requests: number;
    tokens: number;
    daily_tokens_used: number;
    daily_limit: number | null;
}
interface RouteStats {
    route: string;
    requests: number;
    tokens: number;
}
interface QuotaConfig {
    default_daily_token_limit: number | null;
    cost_per_1k_tokens: number;
    hard_limit: boolean;
    reset_hour_utc: number;
    last_reset_at: string | null;
}
interface QuotaConfigUpdate {
    default_daily_token_limit?: number | null;
    cost_per_1k_tokens?: number;
    hard_limit?: boolean;
    reset_hour_utc?: number;
}
interface WebhookItem {
    id: string;
    url: string;
    events: string[];
    format: string;
    enabled: boolean;
    retry_count: number;
    created_at: string;
    last_triggered_at: string | null;
    total_deliveries: number;
    failed_deliveries: number;
}
interface WebhookListResponse {
    object: "list";
    data: WebhookItem[];
    count: number;
}
interface WebhookAddRequest {
    url: string;
    events: string[];
    secret?: string;
    format?: string;
}
interface HealthResponse {
    status: string;
    version: string;
    api_version: string;
    components: Record<string, {
        status: string;
        [key: string]: unknown;
    }>;
    timestamp: string;
}
interface QueueStatus {
    depth: number;
    max_size: number;
    total_processed: number;
    config: {
        max_queue_size: number;
        default_priority: number;
        priority_levels: {
            value: number;
            name: string;
            description: string;
        }[];
    };
}

declare class MbsClient {
    private readonly baseUrl;
    private readonly headers;
    private readonly timeoutMs;
    private readonly maxRetries;
    private readonly retryBaseDelayMs;
    constructor(options?: MbsClientOptions);
    private request;
    /** Combine two AbortSignals: abort when either fires. */
    private combineSignals;
    /** List available models. */
    models(signal?: AbortSignal): Promise<ModelsResponse>;
    /** Load a GGUF model file into VRAM. */
    loadModel(req: ModelLoadRequest, signal?: AbortSignal): Promise<ModelLoadResponse>;
    /** Unload the current model from VRAM. */
    unloadModel(signal?: AbortSignal): Promise<ModelUnloadResponse>;
    /** OpenAI-compatible chat completions (non-streaming). */
    chat(req: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse>;
    /**
     * SSE streaming chat completions.
     * Returns an async generator that yields decoded text deltas.
     *
     * @example
     * for await (const delta of client.chatStream({ messages: [...] })) {
     *   process.stdout.write(delta);
     * }
     */
    chatStream(req: ChatCompletionRequest, signal?: AbortSignal): AsyncGenerator<string, void, unknown>;
    /** OpenAI-compatible text completions. */
    complete(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse>;
    /** Generate embeddings for one or more strings. */
    embed(req: EmbeddingRequest, signal?: AbortSignal): Promise<EmbeddingResponse>;
    /** Generate an image from a text prompt. */
    generateImage(req: ImageGenerationRequest, signal?: AbortSignal): Promise<ImageGenerationResponse>;
    /** Run a ReAct-style agent task. */
    runAgent(req: AgentRunRequest, signal?: AbortSignal): Promise<AgentRunResponse>;
    /** List registered MCP tools. */
    listTools(signal?: AbortSignal): Promise<McpToolsResponse>;
    /** Invoke an MCP tool. */
    invokeTool(req: McpInvokeRequest, signal?: AbortSignal): Promise<McpInvokeResponse>;
    /** Anthropic-compatible messages endpoint (proxied to local LLM). */
    anthropicMessages(req: AnthropicMessagesRequest, signal?: AbortSignal): Promise<AnthropicMessagesResponse>;
    /** List all models in the pool. */
    listPoolModels(signal?: AbortSignal): Promise<PoolModel[]>;
    /** Add a model to the pool. */
    addPoolModel(req: PoolAddRequest, signal?: AbortSignal): Promise<{
        status: string;
    }>;
    /** Remove a model from the pool. */
    removePoolModel(name: string, signal?: AbortSignal): Promise<{
        status: string;
    }>;
    /** Set the pool routing strategy. */
    setPoolStrategy(strategy: "RoundRobin" | "LeastLoaded" | "ByModelName", signal?: AbortSignal): Promise<{
        status: string;
    }>;
    /** Switch a conversation to a specific model. */
    switchModel(req: ModelSwitchRequest, signal?: AbortSignal): Promise<{
        status: string;
    }>;
    /** Trigger CPU fallback for a model. */
    cpuFallback(model_name: string, signal?: AbortSignal): Promise<{
        status: string;
    }>;
    /** Get usage analytics summary. */
    getAnalytics(signal?: AbortSignal): Promise<AnalyticsSummary>;
    /** Reset all analytics data. */
    resetAnalytics(signal?: AbortSignal): Promise<{
        status: string;
    }>;
    /** Set per-key token quota. */
    setKeyQuota(apiKey: string, dailyTokens: number | null, signal?: AbortSignal): Promise<{
        status: string;
    }>;
    /** Update global quota configuration. */
    setQuotaConfig(config: QuotaConfigUpdate, signal?: AbortSignal): Promise<{
        status: string;
    }>;
    /** List all registered webhooks. */
    listWebhooks(signal?: AbortSignal): Promise<WebhookListResponse>;
    /** Register a new webhook endpoint. */
    addWebhook(req: WebhookAddRequest, signal?: AbortSignal): Promise<WebhookItem>;
    /** Remove a webhook by ID. */
    removeWebhook(id: string, signal?: AbortSignal): Promise<{
        status: string;
    }>;
    /** Get detailed component health status. */
    getHealth(signal?: AbortSignal): Promise<HealthResponse>;
    /** Get request queue status. */
    getQueueStatus(signal?: AbortSignal): Promise<QueueStatus>;
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
    batchChat(batch: BatchRequest<ChatCompletionRequest>, signal?: AbortSignal): Promise<BatchResult<ChatCompletionResponse>>;
    /**
     * Run multiple completions concurrently.
     */
    batchComplete(batch: BatchRequest<CompletionRequest>, signal?: AbortSignal): Promise<BatchResult<CompletionResponse>>;
    /**
     * Run multiple embedding requests concurrently.
     */
    batchEmbed(batch: BatchRequest<EmbeddingRequest>, signal?: AbortSignal): Promise<BatchResult<EmbeddingResponse>>;
    /** Returns true if the server is reachable. */
    ping(signal?: AbortSignal): Promise<boolean>;
}

export { type AgentRunRequest, type AgentRunResponse, type AnthropicMessage, type AnthropicMessagesRequest, type AnthropicMessagesResponse, type BatchRequest, type BatchResult, type ChatChoice, type ChatCompletionRequest, type ChatCompletionResponse, type ChatMessage, type CompletionChoice, type CompletionRequest, type CompletionResponse, type EmbeddingObject, type EmbeddingRequest, type EmbeddingResponse, type ImageData, type ImageGenerationRequest, type ImageGenerationResponse, type MbsApiError, MbsClient, type MbsClientOptions, MbsError, type McpInvokeRequest, type McpInvokeResponse, type McpTool, type McpToolsResponse, type MessageRole, type Model, type ModelLoadRequest, type ModelLoadResponse, type ModelUnloadResponse, type ModelsResponse, type StreamChoice, type StreamChunk, type StreamRequest, type UsageInfo };
