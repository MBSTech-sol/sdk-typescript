// ─────────────────────────────────────────────────────────────────────────────
//  @mbs/sdk — Type Definitions
//  Wire-compatible with OpenAI API spec + MBS extensions
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared primitives ────────────────────────────────────────────────────────

export interface MbsClientOptions {
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

// ── Models ───────────────────────────────────────────────────────────────────

export interface Model {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  object: "list";
  data: Model[];
}

export interface ModelLoadRequest {
  /** Absolute path to .gguf file */
  path: string;
  /** Friendly name for the model */
  name?: string;
  /** GPU layers to offload (-1 = all, 0 = CPU only) */
  gpu_layers?: number;
}

export interface ModelLoadResponse {
  success: boolean;
  model_name: string;
  message: string;
}

export interface ModelUnloadResponse {
  success: boolean;
  message: string;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface ChatCompletionRequest {
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

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatChoice[];
  usage: UsageInfo;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "length" | "content_filter";
}

// ── Completions ──────────────────────────────────────────────────────────────

export interface CompletionRequest {
  model?: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string[];
}

export interface CompletionResponse {
  id: string;
  object: "text_completion";
  created: number;
  model: string;
  choices: CompletionChoice[];
  usage: UsageInfo;
}

export interface CompletionChoice {
  index: number;
  text: string;
  finish_reason: "stop" | "length";
}

// ── Embeddings ───────────────────────────────────────────────────────────────

export interface EmbeddingRequest {
  model?: string;
  input: string | string[];
}

export interface EmbeddingResponse {
  object: "list";
  data: EmbeddingObject[];
  model: string;
  usage: UsageInfo;
}

export interface EmbeddingObject {
  object: "embedding";
  index: number;
  embedding: number[];
}

// ── Streaming ────────────────────────────────────────────────────────────────

export interface StreamRequest {
  prompt: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface StreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: StreamChoice[];
}

export interface StreamChoice {
  index: number;
  delta: { content?: string; role?: string };
  finish_reason: "stop" | "length" | null;
}

// ── Images ───────────────────────────────────────────────────────────────────

export interface ImageGenerationRequest {
  prompt: string;
  n?: number;
  size?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: ImageData[];
  revised_prompt?: string;
}

export interface ImageData {
  url?: string;
  b64_json?: string;
}

// ── Agents ───────────────────────────────────────────────────────────────────

export interface AgentRunRequest {
  task: string;
  model?: string;
  max_iterations?: number;
}

export interface AgentRunResponse {
  success: boolean;
  result: string;
  iterations: number;
  reasoning_steps: string[];
}

// ── MCP Tools ────────────────────────────────────────────────────────────────

export interface McpTool {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface McpToolsResponse {
  tools: McpTool[];
}

export interface McpInvokeRequest {
  tool_id: string;
  arguments?: Record<string, unknown>;
}

export interface McpInvokeResponse {
  success: boolean;
  result: unknown;
  error?: string;
}

// ── Anthropic (pass-through) ──────────────────────────────────────────────────

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicMessagesRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
}

export interface AnthropicMessagesResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{ type: "text"; text: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

// ── Error ────────────────────────────────────────────────────────────────────

export interface MbsApiError {
  error: {
    message: string;
    type: string;
    code?: string;
    /** Seconds to wait before retrying (present on 429 responses) */
    retry_after_secs?: number;
  };
}

export class MbsError extends Error {
  readonly status: number;
  readonly body: MbsApiError | string;
  /** Seconds to wait before retrying, if the server suggested one */
  readonly retryAfterSecs?: number;
  /** Structured error type from the server (e.g. "quota_exceeded", "model_not_loaded") */
  readonly errorType?: string;

  constructor(message: string, status: number, body: MbsApiError | string) {
    super(message);
    this.name = "MbsError";
    this.status = status;
    this.body = body;

    // Extract structured fields if available
    if (typeof body === "object" && body?.error) {
      if (body.error.retry_after_secs !== undefined) {
        this.retryAfterSecs = body.error.retry_after_secs;
      }
      if (body.error.type !== undefined) {
        this.errorType = body.error.type;
      }
    }
  }
}

// ── Batch ────────────────────────────────────────────────────────────────────

export interface BatchRequest<T> {
  requests: T[];
  /** Max concurrent requests (default: 5) */
  concurrency?: number;
}

export interface BatchResult<T> {
  results: Array<{ ok: true; value: T } | { ok: false; error: Error }>;
  succeeded: number;
  failed: number;
}

// ── Usage shared ─────────────────────────────────────────────────────────────

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ── Model Pool ───────────────────────────────────────────────────────────────

export interface PoolModel {
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

export interface PoolAddRequest {
  path: string;
  name: string;
  gpu_layers?: number;
  auto_load?: boolean;
}

export interface ModelSwitchRequest {
  conversation_id: string;
  model_name: string;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
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

export interface KeyUsage {
  api_key_hint: string;
  requests: number;
  tokens: number;
  daily_tokens_used: number;
  daily_limit: number | null;
}

export interface RouteStats {
  route: string;
  requests: number;
  tokens: number;
}

export interface QuotaConfig {
  default_daily_token_limit: number | null;
  cost_per_1k_tokens: number;
  hard_limit: boolean;
  reset_hour_utc: number;
  last_reset_at: string | null;
}

export interface QuotaConfigUpdate {
  default_daily_token_limit?: number | null;
  cost_per_1k_tokens?: number;
  hard_limit?: boolean;
  reset_hour_utc?: number;
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

export interface WebhookItem {
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

export interface WebhookListResponse {
  object: "list";
  data: WebhookItem[];
  count: number;
}

export interface WebhookAddRequest {
  url: string;
  events: string[];
  secret?: string;
  format?: string;
}

// ── Health & Queue ───────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version: string;
  api_version: string;
  components: Record<string, { status: string; [key: string]: unknown }>;
  timestamp: string;
}

export interface QueueStatus {
  depth: number;
  max_size: number;
  total_processed: number;
  config: {
    max_queue_size: number;
    default_priority: number;
    priority_levels: { value: number; name: string; description: string }[];
  };
}
