import { describe, expect, it } from "vitest";
import { retrieve } from "./retrieve.js";
import { buildVectorStore } from "./store/vector-store.js";
import type { Chunk } from "./types.js";
import type { EmbeddingClient } from "./embeddings/types.js";

function fakeChunk(componentName: string, text: string): Chunk {
  return { id: `${componentName}:api`, componentName, section: "api", sourceFile: "x.tsx", text };
}

function fakeEmbeddingClient(
  vectors: Record<string, number[]>,
  identity: { provider: string; model: string } = { provider: "fake", model: "fake-model" }
): EmbeddingClient {
  return {
    ...identity,
    async embed(text: string) {
      const vector = vectors[text];
      if (!vector) throw new Error(`No fake vector configured for: ${text}`);
      return vector;
    },
  };
}

describe("retrieve", () => {
  it("reports confident when the top match clears the threshold", async () => {
    const chunks = [fakeChunk("Button", "button text")];
    const client = fakeEmbeddingClient({ "button text": [1, 0], "how do I click": [1, 0] });
    const store = await buildVectorStore(chunks, client);

    const result = await retrieve("how do I click", store, client, 3, 0.5);

    expect(result.confident).toBe(true);
    expect(result.matches[0]!.chunk.componentName).toBe("Button");
  });

  it("reports not confident when the best match is below the threshold", async () => {
    const chunks = [fakeChunk("Button", "button text")];
    const client = fakeEmbeddingClient({ "button text": [1, 0], "unrelated question": [0, 1] });
    const store = await buildVectorStore(chunks, client);

    const result = await retrieve("unrelated question", store, client, 3, 0.5);

    expect(result.confident).toBe(false);
  });

  it("reports not confident against an empty store rather than throwing", async () => {
    const client = fakeEmbeddingClient({ "any question": [1, 0] });
    const store = await buildVectorStore([], client);

    const result = await retrieve("any question", store, client, 3, 0.5);

    expect(result.confident).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it("throws a clear error when the query embedding client doesn't match the store's, rather than silently comparing incomparable vectors", async () => {
    const chunks = [fakeChunk("Button", "button text")];
    const buildClient = fakeEmbeddingClient(
      { "button text": [1, 0] },
      { provider: "ollama", model: "nomic-embed-text" }
    );
    const store = await buildVectorStore(chunks, buildClient);

    const queryClient = fakeEmbeddingClient(
      { "how do I click": [1, 0] },
      { provider: "openai", model: "text-embedding-3-small" }
    );

    await expect(retrieve("how do I click", store, queryClient, 3, 0.5)).rejects.toThrow(
      /was built with ollama:nomic-embed-text.*using openai:text-embedding-3-small/s
    );
  });
});
