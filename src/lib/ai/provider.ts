import OpenAI from "openai";
import { resolveSecretKey, getUserBaseUrl } from "@/lib/settings";
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
  embed(model: string, input: string[]): Promise<number[][] | null>;
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

  async embed(model: string, input: string[]): Promise<number[][] | null> {
    try {
      const res = await this.client.embeddings.create({ model, input });
      return res.data.map((d) => d.embedding as number[]);
    } catch (err) {
      console.error("[AI] embeddings request failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }
}

export interface AIConfig {
  model: string;
  digestModel: string;
  embeddingModel: string;
  language: string;
}

const DEFAULT_CONFIG: AIConfig = {
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  digestModel: "gpt-4o",
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  language: "en",
};

export async function getAIConfig(userId?: string): Promise<AIConfig> {
  if (!userId) return DEFAULT_CONFIG;

  try {
    const settings = await prisma.aISettings.findUnique({ where: { userId } });
    if (!settings) return DEFAULT_CONFIG;

    return {
      model: settings.model || DEFAULT_CONFIG.model,
      digestModel: settings.digestModel || DEFAULT_CONFIG.digestModel,
      embeddingModel: settings.embeddingModel || DEFAULT_CONFIG.embeddingModel,
      language: settings.language || DEFAULT_CONFIG.language,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function createProvider(
  userId?: string
): Promise<AIProvider | null> {
  const apiKey = userId
    ? await resolveSecretKey(userId, "openaiApiKey", "OPENAI_API_KEY")
    : process.env.OPENAI_API_KEY || null;

  let baseURL = userId ? await getUserBaseUrl(userId, "openaiBaseUrl") : null;
  if (!baseURL) baseURL = process.env.OPENAI_BASE_URL || null;

  // Ollama without API key — use dummy key (OpenAI SDK requires one)
  const effectiveKey = apiKey || "ollama";

  if (!apiKey && !baseURL) return null;

  return new OpenAIProvider(
    new OpenAI({
      apiKey: effectiveKey,
      timeout: 120_000,
      ...(baseURL && { baseURL }),
    })
  );
}
