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

### M3.4 — Eval harness — done

- [x] 30 real questions an engineer would actually ask ("how do I show a danger-toned button", "how do I disable a specific item in a dropdown menu"), 24 in-scope spanning all 14 components (grounded in each component's actual verified prop shape, not guessed) + 6 adversarial with no real answer ("how do I file my taxes", "how do I configure a kubernetes ingress")
- [x] Retrieval accuracy measured as: correct component's chunk appears in top-3 for what fraction of in-scope questions; correct-refusal rate measured the same way over the adversarial subset
- [x] Run against Ollama (`nomic-embed-text`); cloud baseline (OpenAI embeddings) not yet recorded — blocked on an API key, same disclosed status as every other cloud-optional path in this portfolio
- [x] Tracked in checked-in `evals/results.md` + `evals/baseline.json`, regenerated by `pnpm eval`
- **A genuinely different reproducibility story than Projects 1/2:** this eval's scored path is retrieval only — embed the question, compare cosine similarity — with no LLM `generate()` call at all. Embeddings are deterministic (confirmed in M3.3). Verified by running `pnpm eval` twice with no code change: every field except the date stamp was byte-identical. `eval:check` therefore uses **zero** regression tolerance, not a 10% band like Projects 1/2 needed for generation-sampling noise — a drop here means something real changed (chunking, threshold, questions), not randomness.
- **Acceptance:** live run against the real design system and real Ollama: **100.0% retrieval accuracy** (24/24), **100.0% correct-refusal rate** (6/6). `eval:check` passes cleanly against its own freshly-written baseline. `evals/results.md` includes a per-question pass/fail breakdown (empty in this run since there were no failures to list).

### M3.5 — Minimal UI or CLI — done

- [x] CLI with two commands: `docsearch build <docsRoot>` (ingest + embed + save a vector store to disk) and `docsearch ask "<question>"` (load the store, retrieve, answer, print citations) — question in, cited answer out
- **Real gap found and fixed before this was demo-safe:** nothing originally stopped `ask` from loading a store built with one embedding provider/model and querying it with a different one — cosine similarity across two different embedding spaces is meaningless, but nothing would have surfaced that as anything other than a wrong answer. Added a check in `retrieve()` that throws a clear, specific error (naming both the store's and the query's provider/model) rather than silently returning garbage; covered by a dedicated unit test.
- **Acceptance:** live run against the real design system and real Ollama. `docsearch build ../00-design-system/packages/components/src` produced a real 28-entry store. `docsearch ask "How do I show a danger-toned button for a destructive action?"` returned a correct, grounded answer (citing `Button`'s real `tone="danger"`) with real source citations. `docsearch ask "How do I set up a Kubernetes ingress?"` returned the honesty message, not a hallucinated answer.

### M3.6 — Regression-checked test suite — done (locally verified; CI itself blocked)

- [x] The M3.4 eval set runs in CI against Ollama (`.github/workflows/ci.yml`'s `eval` job: Ollama service container, pulls both models, checks out Project 0 as a sibling directory the same way ingestion expects locally, runs `pnpm eval:check`) — written but not yet run for real, since that needs this repo pushed to GitHub (same disclosed blocker as every other project's CI-dependent milestone)
- [x] Unit tests for chunking (`parse-component.test.ts`, `parse-story.test.ts`, `ingest.test.ts` from M3.1) are independent of any LLM call — confirmed by inspection, these only invoke `ts-morph` parsing against fixture files
- **Acceptance, verified locally since real CI is blocked on GitHub push:** deliberately built a genuinely naive chunker — concatenate every component file's raw source in file order, split into fixed 400-character windows with no regard for file boundaries (the actual failure mode M3.1 names: "not fixed-size text windows that split a prop table mid-row"), label each window by whichever component it _starts_ in. This produced 142 windows (vs. the real chunker's 28) and **87.5% retrieval accuracy (21/24)** against the exact same 24 in-scope eval questions — a real 12.5-point drop from the committed 100.0% baseline, which `eval:check`'s zero-tolerance gate would correctly fail on. This is a stronger result than an earlier attempt (truncating each real chunk to 60 characters while keeping its own component-name header) which surprisingly still scored 100% — short of it, the embedding model picks up enough signal from just the component name to rank correctly, which is itself a real, disclosed limitation of this specific eval's discriminating power (see README's limitations section): it mostly proves component names are present and distinguishable, not that full prop-table content survives intact. The cross-boundary naive-window version is the one that actually stresses that.

### M3.7 — README + demo — done

- [x] Lead with the eval number, not just "it works" — a measured accuracy is a credibility signal recruiters and interviewers actually notice
- [x] Architecture diagram: docs → chunk → embed → store; query → embed → retrieve → cite → answer
- [x] Recorded demo including at least one "no documentation found" case to show the honesty path isn't decorative
- [x] "Design decisions" section: chunking strategy and why, confidence threshold choice and how it was tuned, why the tool works with no API key via Ollama
- **Acceptance:** 3 real captured CLI transcripts (not staged) — `docsearch build` against the real 14-component design system, a real question with a grounded answer and real citations, and a genuinely unanswerable question returning the honesty message. The README's limitations section states the M3.6 eval-sensitivity finding plainly (100% is "right component ranks in top-3," not "chunking degradation is always caught") rather than only reporting the clean 100%/100% headline numbers.

### M3.8 — Flip repo to public

- [ ] Public, linked from `projects/04-portfolio-site`

## Testing strategy (summary)

The eval set (M3.4/M3.6) is the actual test suite here, not an afterthought — retrieval-augmented systems fail silently (plausible-sounding wrong answers), so the differentiator is having a number that would catch a regression, checked in CI like any other test. The provider abstraction (M3.2) means this eval loop runs for free, as often as needed, without touching a cloud API.
