import type { EmbeddingClient } from "../embeddings/types.js";
import type { LlmClient } from "../llm/types.js";

const DIMENSIONS = 64;

function hash(word: string): number {
  let h = 2166136261;
  for (const ch of word) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Deterministic hashed bag-of-words embedder. Shares words → shares dimensions, so questions that
 * reuse a component's vocabulary land near its chunk without needing a model download.
 */
export function hashingEmbeddingClient(): EmbeddingClient {
  return {
    provider: "test",
    model: "hashed-bow-64",
    async embed(text: string) {
      const vector = new Array<number>(DIMENSIONS).fill(0);
      for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
        vector[hash(word) % DIMENSIONS]! += 1;
      }
      return vector;
    },
  };
}

export function recordingLlmClient(): LlmClient & { calls: number } {
  const client = {
    calls: 0,
    async generate() {
      client.calls += 1;
      return { text: "stubbed answer", provider: "test", model: "stub" };
    },
  };
  return client;
}
