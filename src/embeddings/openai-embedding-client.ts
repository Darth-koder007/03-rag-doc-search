import type { EmbeddingClient } from "./types.js";

export interface OpenAiEmbeddingClientOptions {
  model: string;
  apiKey: string;
}

interface OpenAiEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

/**
 * Plain `fetch` against OpenAI's REST API rather than the `openai` SDK — this is the only
 * cloud embedding call in the project, and pulling in a full SDK dependency for one endpoint
 * isn't worth it (same reasoning as PLAN.md's "don't over-invest in the provider question").
 */
export function createOpenAiEmbeddingClient(
  options: OpenAiEmbeddingClientOptions
): EmbeddingClient {
  return {
    provider: "openai",
    model: options.model,
    async embed(text: string): Promise<number[]> {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({ model: options.model, input: text }),
      });

      if (!response.ok) {
        throw new Error(
          `OpenAI embeddings request failed: ${response.status} ${await response.text()}`
        );
      }

      const body = (await response.json()) as OpenAiEmbeddingResponse;
      const embedding = body.data[0]?.embedding;
      if (!embedding) {
        throw new Error("OpenAI embeddings response had no data.");
      }
      return embedding;
    },
  };
}
