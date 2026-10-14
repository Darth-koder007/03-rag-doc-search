import type { Pool } from "pg";
import type { Chunk, ChunkSection } from "../types.js";
import type { SearchResult, VectorIndex, VectorStore } from "./vector-store.js";

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/**
 * Replaces the whole index in one transaction. A failed publish rolls back and leaves the
 * previous index serving queries; the API process never calls this.
 */
export async function publishVectorStore(pool: Pool, store: VectorStore): Promise<void> {
  const dimensions = store.entries[0]?.vector.length;
  if (dimensions === undefined) {
    throw new Error("Refusing to publish an empty vector store.");
  }
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new Error(`Invalid embedding dimensions: ${dimensions}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query("DROP TABLE IF EXISTS chunks");
    await client.query("DROP TABLE IF EXISTS index_meta");
    await client.query(
      `CREATE TABLE index_meta (
         id int PRIMARY KEY CHECK (id = 1),
         provider text NOT NULL,
         model text NOT NULL,
         dimensions int NOT NULL
       )`
    );
    // dimensions is validated as an integer above, so interpolating it is safe; DDL can't be parameterized.
    await client.query(
      `CREATE TABLE chunks (
         id text PRIMARY KEY,
         component_name text NOT NULL,
         section text NOT NULL,
         source_file text NOT NULL,
         text text NOT NULL,
         embedding vector(${dimensions}) NOT NULL
       )`
    );
    await client.query(
      "INSERT INTO index_meta (id, provider, model, dimensions) VALUES (1, $1, $2, $3)",
      [store.provider, store.model, dimensions]
    );
    for (const { chunk, vector } of store.entries) {
      await client.query(
        `INSERT INTO chunks (id, component_name, section, source_file, text, embedding)
         VALUES ($1, $2, $3, $4, $5, $6::vector)`,
        [
          chunk.id,
          chunk.componentName,
          chunk.section,
          chunk.sourceFile,
          chunk.text,
          toVectorLiteral(vector),
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

interface ChunkRow {
  id: string;
  component_name: string;
  section: ChunkSection;
  source_file: string;
  text: string;
  score: number;
}

/**
 * Exact (sequential) cosine scan, not an HNSW index: at this corpus size an approximate index
 * would only add the chance of returning a different top-k than the in-memory store the evals
 * were measured against.
 */
export async function connectPgVectorIndex(pool: Pool): Promise<VectorIndex> {
  const meta = await pool.query<{ provider: string; model: string }>(
    "SELECT provider, model FROM index_meta WHERE id = 1"
  );
  const row = meta.rows[0];
  if (!row) {
    throw new Error("No published index found. Run `docsearch publish` first.");
  }
  const count = await pool.query<{ n: string }>("SELECT count(*) AS n FROM chunks");

  return {
    provider: row.provider,
    model: row.model,
    size: Number(count.rows[0]!.n),
    async search(queryVector, k): Promise<SearchResult[]> {
      const literal = toVectorLiteral(queryVector);
      const result = await pool.query<ChunkRow>(
        `SELECT id, component_name, section, source_file, text,
                1 - (embedding <=> $1::vector) AS score
           FROM chunks
          ORDER BY embedding <=> $1::vector
          LIMIT $2`,
        [literal, k]
      );
      return result.rows.map((r) => {
        const chunk: Chunk = {
          id: r.id,
          componentName: r.component_name,
          section: r.section,
          sourceFile: r.source_file,
          text: r.text,
        };
        return { chunk, score: Number(r.score) };
      });
    },
  };
}
