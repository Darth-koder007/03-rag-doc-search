# Project 3 — RAG Component Doc Search

## Purpose

Natural-language Q&A over Project 0's design-system documentation, with citations back to the exact doc/component. Smallest scope of the four — build it if time remains after 0 and 1; it earns the least differentiation on its own, so pair it with at least Project 1 in the portfolio, don't let it stand alone.

## Tech decisions

- **Ingestion source:** Project 0's Storybook MDX docs + component prop-type comments — real content, not synthetic.
- **Embeddings and generation:** same provider abstraction as Projects 1 and 2 (see M3.2) — Ollama by default (e.g. `nomic-embed-text` for embeddings, `llama3.1` for generation), with OpenAI/Voyage for embeddings and Anthropic for generation as the optional published-baseline path. The interesting engineering is in chunking and eval, not embedding-model choice, so don't over-invest in the provider question beyond making it swappable.
- **Vector store:** something self-hostable/local with zero infra cost (e.g. `sqlite-vec` or a local FAISS index) — no hosted vector-DB dependency for anyone trying the demo, and no separate container needed alongside Ollama's.
- **Generation:** prompt instructs citation of the source chunk; answers without a supporting chunk say so rather than guessing.

## Milestones

### M3.1 — Doc ingestion pipeline — done

- [x] Parse component source into semantically meaningful chunks (per component, per prop table, per usage example — not fixed-size text windows that split a prop table mid-row)
- [x] Attach metadata to each chunk: component name, doc section, source file path
- [x] Re-runnable ingestion (re-reads source fresh each run; nothing cached that could go stale — re-embedding happens in M3.3's store build)
- **Deliberate deviation from the plan's wording, disclosed rather than silent:** the plan's tech-decisions section says "MDX/Storybook docs." Project 0 never wrote MDX docs — it only has component `.tsx` source and `.stories.tsx` files (confirmed by listing the actual directory before writing any parser). The ingestion source is the real `.tsx` prop types + JSDoc comments (`parse-component.ts`, via `ts-morph`) and real `.stories.tsx` usage examples (`parse-story.ts`) instead — still genuine, non-synthetic content, just not in MDX format. Two chunks per component: an "api" chunk (type aliases, the props interface with each member's type and JSDoc, including `@deprecated` notes) and a "usage" chunk (Storybook meta title + each story's `args` or custom `render` source).
- **Acceptance:** 12 fixture-based unit tests (`parse-component.test.ts`, `parse-story.test.ts`, `ingest.test.ts`) against two small hand-written fixture components (one with stories, one without, to cover both branches) — deterministic regardless of Project 0 changing. Real integration check: `pnpm ingest ../00-design-system/packages/components/src` against Project 0's actual 14 components produced exactly 28 chunks (api + usage for every one), verified by listing per-component chunk counts. Spot-checking the generic-heavy `Table.tsx` output caught one real gap — `TableColumn<T>`'s type parameter was silently dropped from the printed interface header even though the body referenced `T` — fixed by reading `getTypeParameters()` and re-verified against the real file.

### M3.2 — LLM/embedding client abstraction — done

- [x] Reuse the interface shape from Projects 1 and 2: a provider-agnostic `embed(text) -> vector` and `generate(prompt) -> result`, with Ollama (local, default) and cloud (OpenAI for embeddings — chosen over Voyage to avoid a second new SDK dependency for one endpoint, called via plain `fetch` rather than pulling in the `openai` SDK at all; Anthropic for generation) implementations, selected via env var
- [x] Local dev runs entirely against the Dockerized Ollama instance (host port **11437** — distinct from Project 1's 11435, Project 2's 11436, and the OS default 11434) for both embedding and generation — no key, no cost
- **Deliberate design choice beyond the plan's literal wording:** embeddings and generation are two _separate_ provider switches (`EMBEDDING_PROVIDER`, `LLM_PROVIDER`), not one shared switch, because Anthropic has no embeddings endpoint — the plan's own tech-decisions section already anticipates this split ("OpenAI/Voyage for embeddings and Anthropic for generation").
- **Acceptance:** `createLlmClient`/`createEmbeddingClient` construction verified unit-tested (7 tests: defaults with no env, clear error with no API key rather than failing inside a network call, correct provider selection, and that the two switches are independent of each other). Full cross-provider retrieval parity (same query, same answer shape, provider swapped via env var alone) is verified at M3.3 once retrieval exists to run end-to-end.

### M3.3 — Retrieval + citation-backed generation — done

- [x] Embed the query, retrieve top-k chunks (brute-force cosine similarity, `vector-store.ts` — a real ANN index would be solving a scale problem this ~28-chunk corpus doesn't have), pass only those chunks to the LLM as context
- [x] Answer includes which component(s) and doc section the answer is grounded in (`citations` on `AnswerResult`, one per retrieved chunk)
- [x] Explicit "I don't have documentation for that" path when retrieval confidence is low, rather than the LLM improvising — and this path returns before any LLM call is made at all, same shape as Project 1's deterministic rule-engine fallback
- **Threshold tuning, done against real data, not guessed:** built the real vector store from Project 0's actual 14 components via live `nomic-embed-text` (Ollama), then ran 11 real queries — 8 genuinely in-scope ("how do I disable a dropdown item", "what's the deprecated prop on Button", ...) and 3 genuinely out-of-scope ("how do I file my taxes", "what's the capital of France", "how do I configure a kubernetes ingress"). In-scope top-1 cosine similarity ranged **0.586–0.737**; out-of-scope top-1 ranged **0.366–0.450** — a real, comfortable gap. `DEFAULT_CONFIDENCE_THRESHOLD = 0.5` sits in the middle of it and correctly classified all 11. Also confirmed embeddings are deterministic (identical vector for the same query run twice) — unlike generation, this part of the pipeline has zero run-to-run sampling noise, so the threshold itself won't need the kind of tolerance band Projects 1/2's evals needed.
- **Acceptance:** 5 unit tests (`retrieve.test.ts`) with a fake embedding client covering confident/not-confident/empty-store cases; 2 unit tests (`answer.test.ts`) asserting the LLM is never called on the honesty path and that citations are correctly attached on the grounded path. Live end-to-end check against real Ollama (embedding + generation together): "How do I disable a dropdown item?" returned a grounded, correct answer citing `Dropdown`'s real `disabled?: boolean` prop and a real usage example; "How do I file my taxes?" returned the honesty message with zero LLM calls. Cross-provider parity against OpenAI/Anthropic is structurally supported (same interfaces, env-var-selected) but not live-verified — blocked on API keys, same disclosed status as every other cloud-optional path in this portfolio.

### M3.4 — Eval harness

- [ ] 20-30 real questions an engineer would actually ask ("how do I show a destructive confirm dialog", "what's the prop for disabling this input"), each with a known-correct component/answer — pulled from genuinely plausible questions, not the same clean cases used elsewhere
- [ ] Retrieval accuracy measured as: correct component's chunk appears in top-k for what fraction of questions
- [ ] Run routine iteration against Ollama; record the published baseline against the cloud provider, noting which embedding/generation models produced each number
- [ ] Track this number in a checked-in `evals/results.md`, regenerated by script, as chunking/retrieval changes over time — see `CLAUDE.md`'s Evals section for the shared policy this follows
- **Acceptance:** eval script reproduces the checked-in accuracy number and a per-question pass/fail breakdown, runnable in CI, for the provider recorded alongside it.

### M3.5 — Minimal UI or CLI

- [ ] A simple chat-style interface (CLI is fine, a one-page web UI is nicer for a recorded demo) — question in, cited answer out
- **Acceptance:** a cold demo viewer can ask a question and see both the answer and which doc it came from.

### M3.6 — Regression-checked test suite

- [ ] The M3.4 eval set runs in CI against Ollama; a PR that drops retrieval accuracy below a set threshold fails
- [ ] Unit tests for chunking (does a prop table stay intact, does metadata attach correctly) independent of any LLM call
- **Acceptance:** deliberately breaking the chunker (e.g. reverting to fixed-size windows) causes the eval accuracy check to fail in CI.

### M3.7 — README + demo

- [ ] Lead with the eval number, not just "it works" — a measured accuracy is a credibility signal recruiters and interviewers actually notice
- [ ] Architecture diagram: docs → chunk → embed → store; query → embed → retrieve → cite → answer
- [ ] Recorded demo including at least one "no documentation found" case to show the honesty path isn't decorative
- [ ] "Design decisions" section: chunking strategy and why, confidence threshold choice and how it was tuned, why the tool works with no API key via Ollama

### M3.8 — Flip repo to public

- [ ] Public, linked from `projects/04-portfolio-site`

## Testing strategy (summary)

The eval set (M3.4/M3.6) is the actual test suite here, not an afterthought — retrieval-augmented systems fail silently (plausible-sounding wrong answers), so the differentiator is having a number that would catch a regression, checked in CI like any other test. The provider abstraction (M3.2) means this eval loop runs for free, as often as needed, without touching a cloud API.
