import { describe, expect, it } from "vitest";
import { retrieve } from "./retrieve.js";
import { buildVectorStore } from "./store/vector-store.js";
import type { Chunk } from "./types.js";
import type { EmbeddingClient } from "./embeddings/types.js";

function fakeChunk(componentName: string, text: string): Chunk {
  return { id: `${componentName}:api`, componentName, section: "api", sourceFile: "x.tsx", text };
}

function fakeEmbeddingClient(vectors: Record<string, number[]>): EmbeddingClient {
  return {
    provider: "fake",
    model: "fake-model",
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
});
