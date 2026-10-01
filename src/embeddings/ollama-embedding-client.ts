import type { EmbeddingClient } from "./types.js";

export interface OllamaEmbeddingClientOptions {
  model: string;
  baseUrl?: string;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export function createOllamaEmbeddingClient(
  options: OllamaEmbeddingClientOptions
): EmbeddingClient {
  const baseUrl = options.baseUrl ?? "http://localhost:11437";

  return {
    provider: "ollama",
    model: options.model,
    async embed(text: string): Promise<number[]> {
      const response = await fetch(`${baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: options.model, prompt: text }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama embeddings request failed: ${response.status} ${await response.text()}`
        );
      }

      const body = (await response.json()) as OllamaEmbeddingResponse;
      return body.embedding;
    },
  };
}
