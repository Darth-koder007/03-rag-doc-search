import { describe, expect, it } from "vitest";
import { answerQuestion } from "./answer.js";
import { buildVectorStore } from "./store/vector-store.js";
import type { Chunk } from "./types.js";
import type { EmbeddingClient } from "./embeddings/types.js";
import type { GenerateRequest, GenerateResult, LlmClient } from "./llm/types.js";

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

function fakeLlmClient(response: string): LlmClient & { calls: GenerateRequest[] } {
  const calls: GenerateRequest[] = [];
  return {
    calls,
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      calls.push(request);
      return { text: response, provider: "fake", model: "fake-model" };
    },
  };
}

describe("answerQuestion", () => {
  it("never calls the LLM when retrieval isn't confident, returning the fixed honesty message", async () => {
    const chunks = [fakeChunk("Button", "button text")];
    const client = fakeEmbeddingClient({ "button text": [1, 0], "unrelated question": [0, 1] });
    const store = await buildVectorStore(chunks, client);
    const llm = fakeLlmClient("should never see this");

    const result = await answerQuestion("unrelated question", store, client, llm, 3, 0.5);

    expect(result.grounded).toBe(false);
    expect(result.citations).toHaveLength(0);
    expect(result.answer).toMatch(/don't have documentation/i);
    expect(llm.calls).toHaveLength(0);
  });

  it("calls the LLM with the retrieved context and returns citations when confident", async () => {
    const chunks = [fakeChunk("Button", "button text")];
    const client = fakeEmbeddingClient({ "button text": [1, 0], "how do I click": [1, 0] });
    const store = await buildVectorStore(chunks, client);
    const llm = fakeLlmClient("Use the Button component.");

    const result = await answerQuestion("how do I click", store, client, llm, 3, 0.5);

    expect(result.grounded).toBe(true);
    expect(result.answer).toBe("Use the Button component.");
    expect(result.citations).toEqual([
      { componentName: "Button", section: "api", sourceFile: "x.tsx" },
    ]);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.prompt).toContain("button text");
  });
});
