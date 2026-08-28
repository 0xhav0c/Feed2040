import { createProvider, getAIConfig } from "@/lib/ai/provider";

export const EMBED_DIM = 1536;
const MAX_INPUT_CHARS = 8000;

/** Build the text used to embed an article (title carries the most signal). */
export function articleEmbedInput(title: string, body?: string | null): string {
  const text = `${title}\n\n${body || ""}`.replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_INPUT_CHARS);
}

/** Format a JS number[] as a pgvector literal: [0.1,0.2,...]. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Embed a batch of texts. Returns null if embeddings are unavailable. */
export async function embedTexts(userId: string, texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const provider = await createProvider(userId);
  if (!provider) return null;
  const { embeddingModel } = await getAIConfig(userId);
  const vectors = await provider.embed(embeddingModel, texts);
  if (!vectors || vectors.length !== texts.length) return null;
  // Guard against a model returning the wrong dimensionality.
  if (vectors[0]?.length !== EMBED_DIM) {
    console.error(`[Embeddings] Model returned dim ${vectors[0]?.length}, expected ${EMBED_DIM}`);
    return null;
  }
  return vectors;
}

/** Embed a single text. Returns null if embeddings are unavailable. */
export async function embedText(userId: string, text: string): Promise<number[] | null> {
  const out = await embedTexts(userId, [text]);
  return out ? out[0] : null;
}
