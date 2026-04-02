import OpenAI from 'openai';

// ─── Provider Configuration ────────────────────────────
export type LLMProvider = 'kimi' | 'ollama' | 'anthropic';

interface ProviderConfig {
  apiKey: string;
  baseURL: string;
  defaultModel: string;
}

function getProviderConfig(provider: LLMProvider): ProviderConfig {
  switch (provider) {
    case 'kimi':
      return {
        apiKey: process.env.KIMI_API_KEY || '',
        baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
        defaultModel: process.env.KIMI_MODEL || 'moonshot-v1-128k',
      };
    case 'ollama':
      return {
        apiKey: 'ollama', // Ollama doesn't need a real key
        baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
        defaultModel: process.env.OLLAMA_MODEL || 'llama3.1',
      };
    case 'anthropic':
      return {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        baseURL: 'https://api.anthropic.com/v1',
        defaultModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      };
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

// ─── LLM Client ────────────────────────────────────────

const activeProvider = (process.env.LLM_PROVIDER as LLMProvider) || 'kimi';
const config = getProviderConfig(activeProvider);

// All three providers (Kimi, Ollama, Anthropic via proxy) support OpenAI-compatible API
const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
});

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMResponse {
  content: string | null;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  hasToolCalls: boolean;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: LLMProvider;
}

// ─── Chat Completion ───────────────────────────────────

export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    tools?: ToolDefinition[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<LLMResponse> {
  const model = options?.model || config.defaultModel;

  const params: OpenAI.ChatCompletionCreateParams = {
    model,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
  };

  if (options?.tools && options.tools.length > 0) {
    params.tools = options.tools as OpenAI.ChatCompletionTool[];
    params.tool_choice = 'auto';
  }

  const response = await client.chat.completions.create(params);
  const choice = response.choices[0];
  const message = choice.message;

  const toolCalls = (message.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));

  return {
    content: message.content,
    toolCalls,
    hasToolCalls: toolCalls.length > 0,
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    model,
    provider: activeProvider,
  };
}

// ─── Streaming Chat Completion ─────────────────────────

export async function* chatCompletionStream(
  messages: ChatMessage[],
  options?: {
    tools?: ToolDefinition[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): AsyncGenerator<string> {
  const model = options?.model || config.defaultModel;

  const params: OpenAI.ChatCompletionCreateParams = {
    model,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
    stream: true,
  };

  const stream = await client.chat.completions.create(params) as AsyncIterable<OpenAI.ChatCompletionChunk>;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

// ─── Get current provider info ─────────────────────────

export function getCurrentProvider(): { provider: LLMProvider; model: string } {
  return {
    provider: activeProvider,
    model: config.defaultModel,
  };
}

export { client as llmClient, activeProvider, config as llmConfig };
