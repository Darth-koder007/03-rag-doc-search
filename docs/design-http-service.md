# Design: HTTP service over the retrieval pipeline

## Goal

Serve `retrieve` and `answerQuestion` over HTTP from a container, backed by Postgres + pgvector instead of a JSON file on local disk, without changing the eval numbers.

## Shape

```
POST /ask, /search ──► bearer auth ──► validation ──► retrieve(index, embedder) ──► [answer: LLM]
                                                          │
                                              VectorIndex (interface)
                                              ├─ in-memory JSON store (CLI, evals, unit tests)
                                              └─ PgVectorIndex (service)
```

`retrieve` and `answerQuestion` depend on a `VectorIndex` (`provider`, `model`, `size`, async `search`). The existing in-memory `VectorStore` is wrapped by an adapter, so the eval harness and CLI keep running unmodified and `pnpm eval:check` stays a zero-tolerance gate.

## Decisions

**Exact scan, no ANN index.** `ORDER BY embedding <=> $1 LIMIT k` over 28 rows. Matches the in-memory behaviour, so retrieval order is the same; an HNSW index would return approximate results for a table that fits in one page. Revisit if the corpus grows past a few thousand chunks.

**Embedding identity lives in the database.** An `index_meta` row records provider, model and dimensions. `retrieve` keeps its existing mismatch check, so querying a Postgres index built with a different embedding model fails loudly instead of comparing vectors from different spaces.

**Index build is a separate command.** `docsearch publish` writes a built store into Postgres inside one transaction (drop, create, insert, meta). The API process never writes. A failed publish leaves the previous index in place.

**Auth is one static bearer token for now.** Compared in constant time. Real accounts are Phase 1. `/healthz` is unauthenticated and does not touch the LLM.

**Dependencies are injected into `createApp`.** The route layer takes an index, an embedder, an LLM client and a token, so unit tests use `app.request()` with in-memory fakes and the integration test uses real Postgres.

## Failure modes

| Failure                                   | Behaviour                                                             |
| ----------------------------------------- | --------------------------------------------------------------------- |
| Missing or wrong token                    | 401, no body detail                                                   |
| Empty / non-string / over-length question | 400 with the field named                                              |
| Embedding provider down                   | 502                                                                   |
| LLM provider down on `/ask`               | 502; `/search` unaffected                                             |
| Database unreachable                      | `/healthz` returns 503; queries return 502 like any failed dependency |
| Index built with another embedding model  | 500 at query time with the mismatch message, not a wrong answer       |
| Low-confidence retrieval                  | 200, `grounded: false`, fixed message, LLM never called               |

## Not in this milestone

Accounts and key rotation, rate limiting, caching, per-request cost caps. These are M5.3.
