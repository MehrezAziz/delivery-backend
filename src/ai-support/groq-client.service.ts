import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}

export interface GroqToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface GroqChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: GroqToolCall[];
    };
    finish_reason: string;
  }>;
  model: string;
}

@Injectable()
export class GroqClientService {
  private readonly logger = new Logger(GroqClientService.name);
  private readonly baseUrl = 'https://api.groq.com/openai/v1';

  constructor(private readonly config: ConfigService) {}

  get apiKey(): string | undefined {
    return this.config.get<string>('GROQ_API_KEY');
  }

  get model(): string {
    return this.config.get<string>('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
  }

  /** Smaller/cheaper model when primary hits daily quota (TPD) — set in .env */
  get fallbackModel(): string | undefined {
    const v = this.config.get<string>('GROQ_MODEL_FALLBACK')?.trim();
    return v || undefined;
  }

  private defaultMaxTokens(): number {
    const n = parseInt(this.config.get<string>('GROQ_MAX_TOKENS') ?? '900', 10);
    return Number.isFinite(n) ? Math.min(4096, Math.max(256, n)) : 900;
  }

  isConfigured(): boolean {
    return !!this.apiKey?.trim();
  }

  private async sleep(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
  }

  /** Daily token limit — retrying every 2s only burns time; use fallback model instead */
  private isDailyTokenLimitBody(errorBody: string): boolean {
    return /tokens per day|\bTPD\b/i.test(errorBody);
  }

  /** Parse Groq 429 message: ms, seconds, or "18m50.976s" */
  private retryDelayMsFrom429Body(errorBody: string): number {
    try {
      const j = JSON.parse(errorBody) as { error?: { message?: string } };
      const m = j.error?.message ?? '';
      const minSec = /try again in (\d+)m([\d.]+)s/i.exec(m);
      if (minSec) {
        const totalSec = parseInt(minSec[1], 10) * 60 + parseFloat(minSec[2]);
        return Math.min(120_000, Math.ceil(totalSec * 1000) + 500);
      }
      const sec = /try again in ([\d.]+)\s*s/i.exec(m);
      if (sec) return Math.min(120_000, Math.ceil(parseFloat(sec[1]) * 1000) + 300);
      const ms = /try again in (\d+)\s*ms/i.exec(m);
      if (ms) return Math.min(120_000, parseInt(ms[1], 10) + 300);
    } catch {
      /* ignore */
    }
    return 2000;
  }

  async chatCompletion(params: {
    messages: GroqChatMessage[];
    tools?: unknown[];
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    temperature?: number;
    maxTokens?: number;
    /** Internal: use after primary hits TPD */
    modelOverride?: string;
  }): Promise<GroqChatCompletionResponse> {
    const key = this.apiKey;
    if (!key) throw new Error('GROQ_API_KEY is not set');

    const modelId = params.modelOverride ?? this.model;
    const body: Record<string, unknown> = {
      model: modelId,
      messages: params.messages,
      temperature: params.temperature ?? 0.35,
      max_tokens: params.maxTokens ?? this.defaultMaxTokens(),
    };
    if (params.tools?.length) {
      body.tools = params.tools;
      body.tool_choice = params.toolChoice ?? 'auto';
    }

    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      if (res.ok) {
        return JSON.parse(text) as GroqChatCompletionResponse;
      }
      if (res.status === 429) {
        if (this.isDailyTokenLimitBody(text)) {
          this.logger.warn(
            `Groq 429 daily token quota (TPD) for model ${modelId} — not retrying same model. ${text.slice(0, 160)}`,
          );
          const fb = this.fallbackModel;
          if (fb && fb !== modelId && !params.modelOverride) {
            this.logger.warn(`Trying GROQ_MODEL_FALLBACK: ${fb}`);
            return this.chatCompletion({ ...params, modelOverride: fb });
          }
          throw new Error('GROQ_DAILY_QUOTA');
        }
        if (attempt < maxAttempts) {
          const wait = this.retryDelayMsFrom429Body(text);
          this.logger.warn(`Groq rate limit (429), retrying in ${wait}ms (attempt ${attempt}/${maxAttempts})`);
          await this.sleep(wait);
          continue;
        }
      }
      this.logger.warn(`Groq HTTP ${res.status}: ${text.slice(0, 500)}`);
      throw new Error(`Groq request failed: ${res.status}`);
    }
    throw new Error('Groq request failed: exhausted retries');
  }

  /**
   * Stream the assistant reply (no tools). Used for the final natural-language turn after tool rounds.
   */
  async streamChatText(params: {
    messages: GroqChatMessage[];
    temperature?: number;
    maxTokens?: number;
    onToken?: (chunk: string) => void | Promise<void>;
    modelOverride?: string;
  }): Promise<string> {
    const key = this.apiKey;
    if (!key) throw new Error('GROQ_API_KEY is not set');

    const modelId = params.modelOverride ?? this.model;
    const body = {
      model: modelId,
      messages: params.messages,
      temperature: params.temperature ?? 0.35,
      max_tokens: params.maxTokens ?? this.defaultMaxTokens(),
      stream: true,
    };

    const maxAttempts = 4;
    let res: Response | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) break;
      const t = await res.text();
      if (res.status === 429) {
        if (this.isDailyTokenLimitBody(t)) {
          this.logger.warn(
            `Groq stream 429 TPD for model ${modelId}. ${t.slice(0, 160)}`,
          );
          const fb = this.fallbackModel;
          if (fb && fb !== modelId && !params.modelOverride) {
            this.logger.warn(`Streaming with GROQ_MODEL_FALLBACK: ${fb}`);
            return this.streamChatText({ ...params, modelOverride: fb });
          }
          throw new Error('GROQ_DAILY_QUOTA');
        }
        if (attempt < maxAttempts) {
          const wait = this.retryDelayMsFrom429Body(t);
          this.logger.warn(`Groq stream rate limit (429), retrying in ${wait}ms (attempt ${attempt}/${maxAttempts})`);
          await this.sleep(wait);
          continue;
        }
      }
      this.logger.warn(`Groq stream HTTP ${res.status}: ${t.slice(0, 500)}`);
      throw new Error(`Groq stream failed: ${res.status}`);
    }
    if (!res?.ok) throw new Error('Groq stream failed after retries');

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No stream body');

    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf('\n')) >= 0) {
        const rawLine = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 1);
        const line = rawLine.replace(/\r$/, '').trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const piece = json.choices?.[0]?.delta?.content;
          if (piece) {
            full += piece;
            await params.onToken?.(piece);
          }
        } catch {
          /* ignore partial JSON lines */
        }
      }
    }

    const tail = buffer.trim();
    if (tail.startsWith('data:')) {
      const data = tail.slice(5).trim();
      if (data && data !== '[DONE]') {
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const piece = json.choices?.[0]?.delta?.content;
          if (piece) {
            full += piece;
            await params.onToken?.(piece);
          }
        } catch {
          /* ignore */
        }
      }
    }

    return full.trim();
  }
}
