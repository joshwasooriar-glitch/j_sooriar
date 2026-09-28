# COSTS

Hard ceiling: **$10.00/month**. Projected actual: **$2.03/month**.

Pricing verified September 25, 2026.

---

## Model pricing (per million tokens)

| Model | Input | Cached input | Output |
|---|---|---|---|
| GPT-6 Luna | $0.10 | $0.01 | $0.50 |
| GPT-6 Sol | $2.00 | $0.20 | $10.00 |
| text-embedding-3-small | $0.02 | — | — |

Cached input reads get a 90% discount. Both chat models have a 1.05M token
context window, which means context size is never a hard limit here. Cost is the
limit, so the context budget in `lib/ai/context.ts` exists for spend, not capacity.

**Claude Fable 5.1 is $10/$50 per million.** It is the coding agent that builds
this. It must never appear in the runtime path. Build with Fable, run on Luna.

---

## Projected monthly spend

| Feature | Volume/mo | Model | Cost |
|---|---|---|---|
| Morning brief | 30 | Luna | $0.02 |
| Evening review | 30 | Luna | $0.02 |
| Weekly launch | 4 | Luna | $0.01 |
| Chat, 25/day | 750 | Luna | $0.24 |
| Email classify | 600 | Luna | $0.08 |
| Capture and extract | 300 | Luna | $0.05 |
| Deep research | 8 jobs | Sol | $1.60 |
| Embeddings | ~200 | small | $0.01 |
| **Total** | | | **$2.03** |

### Headroom: $7.97

**Deep research is 79% of spend.** It is the only line worth guarding carefully.
Everything else is rounding error, so do not build elaborate throttling around
chat calls that cost 24 cents a month.

---

## Guard thresholds

Evaluated against a rolling `model_runs` sum for the current calendar month.

| Spend | State | Behavior |
|---|---|---|
| $7.00 | `warn` | Dashboard banner. Nothing blocked. |
| $8.50 | `restrict` | Sol requires per-call confirmation. Luna unaffected. |
| $9.50 | `luna_only` | Sol disabled entirely. |
| $10.00 | `hard_stop` | No new paid calls without explicit override. |

**Deterministic features never degrade.** At `hard_stop` the dashboard still
renders, progress still computes, the morning brief still shows priorities. Only
the English prose layer goes away, because every number comes from SQL.

**Per-job ceiling:** default 50 cents. If a job's estimate exceeds 15% of
remaining monthly budget, ask before starting.

---

## Where the savings come from

1. **Luna for 95% of calls.** Sol is 20x input and Astra-tier models are 100x.
2. **Prompt caching.** The stable system prompt goes first and never changes
   between calls, so it caches at 10% of input price.
3. **Context packets.** Never dump the database. A 3k-token packet instead of a
   60k-token history is a 20x reduction on every single call.
4. **Deterministic math.** Progress, pace, scores, and streaks cost $0 forever.
5. **Event-driven.** No polling loop calls a model to "monitor" anything.
6. **SQL before vectors.** Structural questions never touch an embedding.
7. **Rules before models.** Email classification tries regex rules first and only
   escalates to Luna on ambiguity.

---

## Tracking

Every model call writes a `model_runs` row with model, feature, input tokens,
cached input tokens, output tokens, computed cost in cents, and latency. No
exceptions, including failures.

Cost is computed by `estimateCostCents()` in `lib/ai/cost.ts` from the pricing
table above. Update that table when prices change and every historical row stays
correct, because cost is stored per row at time of call.
