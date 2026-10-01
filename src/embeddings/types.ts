export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
  provider: string;
  model: string;
}

export type EmbeddingProvider = "ollama" | "openai";
