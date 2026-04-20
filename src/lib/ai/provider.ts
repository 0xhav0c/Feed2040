import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  getAppSetting,
  getSecretKey,
  resolveSecretKey,
  getUserOllamaUrl,
  SETTING_KEYS,
} from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export interface ChatOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  jsonMode?: boolean;
}

export interface AIProvider {
  chat(options: ChatOptions): Promise<string | null>;
}

class OpenAIProvider implements AIProvider {
  constructor(private client: OpenAI) {}

  async chat(options: ChatOptions): Promise<string | null> {
    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
      max_tokens: options.maxTokens,
      ...(options.jsonMode && { response_format: { type: "json_object" } }),
    });
    return response.choices[0]?.message?.content?.trim() || null;
  }
}

class OllamaProvider implements AIProvider {
  constructor(private baseURL: string) {}

  async chat(options: ChatOptions): Promise<string | null> {
    const ollamaRoot = this.baseURL.replace(/\/v1\/?$/, "");
    const timeout = Math.max(180_000, options.maxTokens * 50);
    const numPredict = Math.max(options.maxTokens, 4096);

    const startMs = Date.now();
    console.log(`[Ollama] Sending to ${options.model} (max_tokens=${numPredict}, timeout=${Math.round(timeout / 1000)}s)`);

    try {
      const response = await fetch(`${ollamaRoot}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: "system", content: options.systemPrompt },
            { role: "user", content: options.userPrompt },
          ],
          stream: false,
          think: false,
          options: {
            num_predict: numPredict,
            temperature: 0.3,
            top_p: 0.9,
          },
        }),
        signal: AbortSignal.timeout(timeout),
      });

      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[Ollama] HTTP ${response.status} after ${elapsed}s: ${errText.slice(0, 200)}`);
        return null;
      }

      const data = await response.json();
      const content = data?.message?.content?.trim();
      console.log(`[Ollama] Response in ${elapsed}s, ${content?.length || 0} chars`);
      return content || null;
    } catch (err) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[Ollama] Failed after ${elapsed}s: ${msg}`);
      return null;
    }
  }
}

class AnthropicProvider implements AIProvider {
  constructor(private client: Anthropic) {}

  async chat(options: ChatOptions): Promise<string | null> {
    const response = await this.client.messages.create({
      model: options.model,
      system: options.systemPrompt,
      messages: [{ role: "user", content: options.userPrompt }],
      max_tokens: options.maxTokens,
    });
    const block = response.content[0];
    if (block.type === "text") return block.text.trim() || null;
    return null;
  }
}

export interface AIConfig {
  provider: string;
  model: string;
  digestModel: string;
  language: string;
}

const DEFAULT_CONFIG: AIConfig = {
  provider: "openai",
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  digestModel: "gpt-4o",
  language: "tr",
};

export async function getAIConfig(userId?: string): Promise<AIConfig> {
  if (!userId) return DEFAULT_CONFIG;

  try {
    const settings = await prisma.aISettings.findUnique({ where: { userId } });
    if (!settings) return DEFAULT_CONFIG;

    return {
      provider: settings.provider || DEFAULT_CONFIG.provider,
      model: settings.model || DEFAULT_CONFIG.model,
      digestModel: settings.digestModel || DEFAULT_CONFIG.digestModel,
      language: settings.language || DEFAULT_CONFIG.language,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function createProvider(
  providerName?: string,
  userId?: string
): Promise<AIProvider | null> {
  const name = providerName || "openai";

  if (name === "ollama") {
    let baseURL: string | null = null;
    if (userId) baseURL = await getUserOllamaUrl(userId);
    if (!baseURL) baseURL = await getAppSetting("ollama_base_url");
    if (!baseURL) baseURL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
    return new OllamaProvider(baseURL);
  }

  if (name === "anthropic") {
    const apiKey = userId
      ? await resolveSecretKey(userId, "anthropicApiKey", "ANTHROPIC_API_KEY")
      : await getSecretKey(SETTING_KEYS.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY");
    if (!apiKey) return null;
    return new AnthropicProvider(new Anthropic({ apiKey, timeout: 60_000 }));
  }

  const apiKey = userId
    ? await resolveSecretKey(userId, "openaiApiKey", "OPENAI_API_KEY")
    : await getSecretKey(SETTING_KEYS.OPENAI_API_KEY, "OPENAI_API_KEY");
  if (!apiKey) return null;
  return new OpenAIProvider(new OpenAI({ apiKey, timeout: 60_000 }));
}

export const PROVIDER_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Fast & Economical)" },
    { value: "gpt-4o", label: "GPT-4o (Powerful)" },
    { value: "gpt-4.1", label: "GPT-4.1 (Latest)" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini (New & Economical)" },
    { value: "gpt-4.1-nano", label: "GPT-4.1 Nano (Ultra Economical)" },
  ],
  anthropic: [
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Fast & Economical)" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Balanced)" },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6 (Most Powerful)" },
  ],
  ollama: [],
};
