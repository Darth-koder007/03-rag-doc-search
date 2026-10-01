import { createOllamaEmbeddingClient } from "./ollama-embedding-client.js";
import { createOpenAiEmbeddingClient } from "./openai-embedding-client.js";
import type { EmbeddingClient, EmbeddingProvider } from "./types.js";

const DEFAULT_MODEL: Record<EmbeddingProvider, string> = {
  ollama: "nomic-embed-text",
  openai: "text-embedding-3-small",
};

export interface CreateEmbeddingClientOptions {
  provider?: EmbeddingProvider;
  model?: string;
  env?: Record<string, string | undefined>;
}

/**
 * Separate from `createLlmClient`: Anthropic (this project's cloud generation option) has no
 * embeddings API, so embedding provider and generation provider are selected independently
 * rather than forced to share one `LLM_PROVIDER` switch.
 */
export function createEmbeddingClient(options: CreateEmbeddingClientOptions = {}): EmbeddingClient {
  const env = options.env ?? process.env;
  const provider =
    options.provider ?? (env.EMBEDDING_PROVIDER as EmbeddingProvider | undefined) ?? "ollama";
  const model = options.model ?? env.EMBEDDING_MODEL ?? DEFAULT_MODEL[provider];

  if (provider === "openai") {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY to be set. Use EMBEDDING_PROVIDER=ollama (the default) for local development without an API key."
      );
    }
    return createOpenAiEmbeddingClient({ model, apiKey });
  }

  return createOllamaEmbeddingClient({
    model,
    ...(env.OLLAMA_BASE_URL ? { baseUrl: env.OLLAMA_BASE_URL } : {}),
  });
}
