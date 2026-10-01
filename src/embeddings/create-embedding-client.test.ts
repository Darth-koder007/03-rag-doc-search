import { describe, expect, it } from "vitest";
import { createEmbeddingClient } from "./create-embedding-client.js";

describe("createEmbeddingClient", () => {
  it("defaults to Ollama with no environment configured, so it works with no API key", () => {
    expect(() => createEmbeddingClient({ env: {} })).not.toThrow();
  });

  it("throws a clear error for the OpenAI provider with no API key, rather than failing inside a network call", () => {
    expect(() => createEmbeddingClient({ env: { EMBEDDING_PROVIDER: "openai" } })).toThrow(
      /OPENAI_API_KEY/
    );
  });

  it("selects OpenAI when both the provider and an API key are configured", () => {
    expect(() =>
      createEmbeddingClient({ env: { EMBEDDING_PROVIDER: "openai", OPENAI_API_KEY: "test-key" } })
    ).not.toThrow();
  });

  it("selects a provider independently of LLM_PROVIDER, since Anthropic has no embeddings API", () => {
    expect(() =>
      createEmbeddingClient({ env: { LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key" } })
    ).not.toThrow();
  });
});
