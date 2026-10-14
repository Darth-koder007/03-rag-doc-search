import { serve } from "@hono/node-server";
import pg from "pg";
import { createEmbeddingClient } from "../embeddings/create-embedding-client.js";
import { createLlmClient } from "../llm/create-client.js";
import { connectPgVectorIndex } from "../store/pg-vector-index.js";
import { createApp } from "./app.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: requireEnv("DATABASE_URL"), max: 5 });
  const index = await connectPgVectorIndex(pool);

  const app = createApp({
    index,
    embeddingClient: createEmbeddingClient(),
    llmClient: createLlmClient(),
    apiToken: requireEnv("API_TOKEN"),
    ...(process.env.CONFIDENCE_THRESHOLD
      ? { confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD) }
      : {}),
    checkDatabase: async () => {
      await pool.query("SELECT 1");
    },
  });

  const port = Number(process.env.PORT ?? 8080);
  serve({ fetch: app.fetch, port }, () => {
    console.log(`docsearch API listening on :${port} (index ${index.provider}:${index.model})`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
