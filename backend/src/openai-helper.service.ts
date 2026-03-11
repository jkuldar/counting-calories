import { Injectable, Logger } from '@nestjs/common';

/**
 * Shared helper for calling OpenAI APIs (chat completions & embeddings).
 * Centralises retry logic, rate-limit handling, and timeout behaviour.
 */
@Injectable()
export class OpenAIHelper {
  private readonly logger = new Logger(OpenAIHelper.name);
  private readonly CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini';
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY_MS = 1000;

  get apiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not configured');
    return key;
  }

  // ────────── Chat completions ──────────

  async chat(
    messages: { role: string; content: string }[],
    opts: {
      temperature?: number;
      maxTokens?: number;
      tools?: any[];
      toolChoice?: any;
      responseFormat?: any;
    } = {},
  ): Promise<any> {
    const body: any = {
      model: this.CHAT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
    };
    if (opts.tools) body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
    if (opts.responseFormat) body.response_format = opts.responseFormat;

    return this.callWithRetry('https://api.openai.com/v1/chat/completions', body);
  }

  /** Convenience: send a single user prompt and return the text response. */
  async chatText(prompt: string, systemPrompt?: string, temperature = 0.7): Promise<string> {
    const messages: { role: string; content: string }[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    const data = await this.chat(messages, { temperature });
    return data.choices?.[0]?.message?.content ?? '';
  }

  // ────────── Embeddings ──────────

  async embeddings(texts: string[]): Promise<number[][]> {
    const body = { model: this.EMBEDDING_MODEL, input: texts };
    const data = await this.callWithRetry('https://api.openai.com/v1/embeddings', body);
    return (data.data as { index: number; embedding: number[] }[])
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  async embedding(text: string): Promise<number[]> {
    const [vec] = await this.embeddings([text]);
    return vec;
  }

  // ────────── Internal retry logic ──────────

  private async callWithRetry(url: string, body: any, attempt = 1): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt <= this.MAX_RETRIES) {
          const delay = this.BASE_DELAY_MS * Math.pow(2, attempt - 1);
          this.logger.warn(`OpenAI ${res.status}, retrying in ${delay}ms (attempt ${attempt}/${this.MAX_RETRIES})`);
          await this.sleep(delay);
          return this.callWithRetry(url, body, attempt + 1);
        }
        const errText = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${errText}`);
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${errText}`);
      }

      return res.json();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        if (attempt <= this.MAX_RETRIES) {
          this.logger.warn(`OpenAI timeout, retrying (attempt ${attempt}/${this.MAX_RETRIES})`);
          return this.callWithRetry(url, body, attempt + 1);
        }
        throw new Error('OpenAI API request timed out after retries');
      }
      if (attempt <= this.MAX_RETRIES && (err.message?.includes('ECONNRESET') || err.message?.includes('fetch failed'))) {
        const delay = this.BASE_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.warn(`Network error, retrying in ${delay}ms (attempt ${attempt}/${this.MAX_RETRIES})`);
        await this.sleep(delay);
        return this.callWithRetry(url, body, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
