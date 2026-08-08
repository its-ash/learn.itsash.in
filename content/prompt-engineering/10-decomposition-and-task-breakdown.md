# 10 — Decomposition & Task Breakdown

## Why One Giant Prompt Often Loses to Several Small Ones

It's tempting to hand a model one enormous prompt that asks for everything at once: "Read this contract, summarize it, flag risky clauses, draft a response email, and translate that email to Spanish." Every part of that request is individually something a model handles well. Bundled together into a single generation, quality on each part often quietly degrades — the model is dividing a fixed amount of attention and a fixed output budget across five distinct sub-tasks, each competing for the same context and token allowance, with no ability to fully "finish" one before starting the next in the deliberate way a human would.

**Decomposition** is the practice of splitting a complex task into a sequence (or graph) of smaller, focused prompts, each with a single clear job, where the output of one step becomes part of the input to the next. This is often called **prompt chaining**. It trades one call for several, in exchange for higher reliability, easier debugging, and the ability to apply the right technique (few-shot, chain-of-thought, structured output, a different model entirely) to each sub-task independently.

## A Motivating Comparison

Consider the contract-review task above as a single monolithic prompt:

::code-wrapper{language="markdown"}
```markdown
Read this contract. Summarize it, flag risky clauses, draft a response
email addressing the risky clauses, and translate the email to Spanish.

Contract: [long legal document]
```
::

Versus the same task decomposed into a pipeline:

::code-wrapper{language="markdown"}
```markdown
Step 1 — Summarize:
Summarize the key terms of this contract in plain language, under 200 words.
Contract: [long legal document]

Step 2 — Risk analysis (using Step 1's summary + full contract):
Given this contract and its summary, identify clauses that pose meaningful
risk to the receiving party. For each, quote the clause and explain the
specific risk in one sentence.

Step 3 — Draft response (using Step 2's risk list):
Draft a professional email to the counterparty raising these specific
concerns: [Step 2 output]. Tone: firm but collaborative, not adversarial.

Step 4 — Translate (using Step 3's output):
Translate this email to formal, business-register Spanish, preserving
the professional tone: [Step 3 output]
```
::

Each step here has one job, can be independently tested (Chapter 9), can use a different technique suited to that specific job (structured extraction for Step 2, tone-controlled generation for Step 3, faithful translation for Step 4), and — importantly — produces an intermediate artifact (the risk list, the drafted email) that a human can inspect and correct *before* it feeds into the next step, rather than only being able to review a single opaque final output.

## When Decomposition Helps

- **The task has genuinely distinct sub-skills.** Summarization, risk analysis, tone-controlled drafting, and translation are different capabilities that benefit from different prompting techniques and, in some architectures, even different models (a fast, cheap model for extraction; a stronger model for the nuanced drafting step). Bundling them assumes one prompt configuration is simultaneously optimal for all four, which is rarely true.
- **An intermediate result needs human review or a programmatic check before proceeding.** If a legal team wants to approve the risk list before any email gets drafted from it, decomposition is not optional — you need a real stopping point between steps, which a single monolithic generation cannot provide.
- **The full task doesn't fit reliably in one context/output budget.** Chapter 7 covered how an overly ambitious structured-output specification can cause truncation; the same problem shows up for any single generation trying to do too much — splitting into stages naturally caps the model's per-call output length demands.
- **Failure needs to be attributable to a specific stage.** When a single mega-prompt produces a bad final answer, diagnosing *which part* went wrong (was the summary inaccurate? Was a risk missed? Was the tone off? Was the translation wrong?) requires reading through the whole output and guessing. A pipeline surfaces the failure at a specific, isolated step, which is enormously faster to debug and fix.
- **Later steps benefit from information not available (or not yet relevant) at earlier steps.** Sequential decomposition naturally supports designs where step 3 needs step 2's *output*, not just the same raw input restated — this is a fundamentally different shape than a single prompt trying to hold every stage's context simultaneously.

## When Decomposition Costs More Than It's Worth

- **Simple, well-defined tasks don't need it.** "Summarize this email in two sentences" doesn't benefit from being split into sub-steps — decomposition adds latency (multiple round trips) and cost (multiple calls) without a corresponding reliability gain for a task that's already narrow and well-scoped.
- **Latency-sensitive interactive use cases feel the cost of sequential calls directly.** A four-step pipeline run sequentially is, at minimum, four times the round-trip latency of one call — for a user waiting on a chat response, this can matter more than the reliability gain justifies, and parallelizing independent steps (see below) or falling back to a single well-crafted prompt may be the better tradeoff.
- **Excessive decomposition fragments context that later steps actually need.** If step 4 needs a nuance from the *original* input that got lost because only step 3's output (not the original document) was passed forward, over-decomposing can actually lose information rather than preserve it — each step's input needs to be deliberately designed, not just "whatever the previous step returned."

## Sequential vs. Parallel Decomposition

Not all sub-tasks depend on each other. Where they don't, running them in parallel rather than as a strict chain reduces latency without sacrificing the reliability benefits of decomposition:

::code-wrapper{language="python"}
```python
import asyncio

async def analyze_document(doc):
    summary_task = call_model(f"Summarize: {doc}")
    entities_task = call_model(f"Extract all named entities as JSON: {doc}")
    sentiment_task = call_model(f"Classify overall sentiment (positive/negative/neutral): {doc}")

    summary, entities, sentiment = await asyncio.gather(
        summary_task, entities_task, sentiment_task
    )
    return {"summary": summary, "entities": entities, "sentiment": sentiment}
```
::

Summarization, entity extraction, and sentiment classification here don't depend on each other's outputs — they're independent views of the same source document, so running them concurrently costs roughly the latency of the slowest single call, not the sum of all three. The general principle: **decompose along genuine dependencies, and only serialize the steps that are actually sequential.** A common mistake is chaining steps sequentially out of habit even when nothing in step 2 actually needs step 1's output — that's paying sequential latency for a dependency that doesn't exist.

## Designing the Handoff Between Steps

The quality of a decomposed pipeline lives or dies on what gets passed between steps. Passing raw, unstructured prose from one step into the next prompt tends to be brittle — the next step's prompt has to parse meaning out of free text rather than consuming a well-defined contract. Passing structured output (Chapter 7) between steps is far more robust:

::code-wrapper{language="python"}
```python
risk_schema = {
    "type": "object",
    "properties": {
        "risks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "clause_quote": {"type": "string"},
                    "risk_description": {"type": "string"},
                    "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                "required": ["clause_quote", "risk_description", "severity"],
            },
        }
    },
}

risks = extract_with_schema(contract_text, risk_schema)

high_severity = [r for r in risks["risks"] if r["severity"] == "high"]

email_draft = call_model(
    f"Draft a firm-but-collaborative email raising these specific concerns: {high_severity}"
)
```
::

This lets ordinary application code (not another model call) filter, validate, or branch on the intermediate result — here, only high-severity risks make it into the drafted email — which is both cheaper and more reliable than asking a later prompt to re-derive "only mention the important ones" from unstructured prior output.

## Conditional Branching in a Pipeline

Decomposed pipelines aren't limited to a straight line — a step's output can determine which step runs next, giving you something closer to a flowchart than a fixed sequence:

::code-wrapper{language="markdown"}
```markdown
Step 1 — Classify the support ticket: BILLING, BUG_REPORT, or OTHER.

If BILLING → Step 2a: extract invoice number and disputed amount, route
to billing-response prompt.
If BUG_REPORT → Step 2b: extract reproduction steps and severity, route
to engineering-triage prompt.
If OTHER → Step 2c: route to general-response prompt with no extraction.
```
::

This branching logic itself usually lives in application code, not in a single prompt asking the model to "handle all three cases" — keeping the branch decision in code makes the pipeline's behavior explicit, testable per-branch (Chapter 9), and easy to extend with a new category later without touching the other branches' prompts at all.

## Relationship to Chain-of-Thought

Decomposition and chain-of-thought (Chapter 5) solve related but distinct problems, and it's worth being precise about the difference: **CoT asks one model call to reason through multiple steps internally, within a single generation and a single context. Decomposition splits those steps across multiple separate calls, each with its own context, that a human or program can inspect between steps.** CoT is cheaper (one call) and keeps all reasoning within the model's own working context, which can help it reason coherently across steps it "remembers" without needing anything re-supplied. Decomposition is more expensive but gives you inspection points, the ability to use different techniques or models per step, and resilience to any single step's context/output getting overloaded. A frequent, effective pattern combines both: decompose a task into a small number of major stages, and use chain-of-thought *within* any individual stage that itself benefits from step-by-step reasoning.

## 💡 Tips & Tricks

- **Name each pipeline stage by its single responsibility, and if you can't name it in one clause, it's still two stages** — "extract-and-summarize" is a signal to split into "extract" and "summarize," even if you eventually decide to keep them merged for latency reasons; the naming exercise surfaces hidden multi-tasking in a step before it becomes a debugging problem.
- **Log every intermediate step's input and output**, not just the pipeline's final result — when a multi-step pipeline produces a bad final answer, having the full trace of intermediate outputs is what makes it possible to localize the failure to a specific stage in minutes instead of hours.
- **Put validation between stages, not just at the end** — a cheap structural check (does the extracted JSON have the required fields? is the severity value one of the allowed enum values?) run immediately after each stage catches a broken intermediate result before it propagates three more stages downstream and corrupts an otherwise-fine final output.
- **Use a cheaper/faster model for simple, well-defined stages and reserve your strongest model for the stage that actually needs deep reasoning or nuanced judgment** — a pipeline's total cost and latency is the sum of its stages, and not every stage needs your most capable (and most expensive) model to do its narrow job well.
- **Parallelize aggressively wherever dependencies genuinely allow it** — before finalizing a pipeline design, explicitly draw the dependency graph between steps (which steps need which prior outputs) rather than defaulting to a sequential chain; independent branches should run concurrently.

## ⚠️ Edge Cases & Gotchas

- **Errors compound across stages if not handled explicitly.** A pipeline with four 95%-reliable stages chained naively has a combined success rate closer to 0.95⁴ ≈ 81%, not 95%, because each stage's failure can silently propagate into and corrupt the next one's input. Validate and, where feasible, retry or fall back at each stage individually — don't assume that "each step usually works" adds up to "the pipeline usually works."
- **A later stage can't recover context that an earlier stage discarded.** If your extraction stage pulls only three fields out of a document and a later drafting stage turns out to need a fourth piece of information that was in the original document but never extracted, the pipeline has no way to go back — either pass the original source material forward alongside extracted summaries, or make sure the extraction schema anticipates everything downstream stages will need.
- **Sequential latency is invisible until it's in production at real user think-time.** A four-stage pipeline that took an acceptable few seconds in a development test against a fast, lightly-loaded API can feel unacceptably slow under production latency and rate-limiting conditions — measure end-to-end pipeline latency under realistic conditions before committing to a sequential design for a latency-sensitive interactive feature.
- **Conditional branches that are rarely exercised in testing can harbor silent bugs for a long time.** A branch handling an uncommon ticket category might go months without a real example, and when one finally arrives, discover the branch's prompt was written against a stale assumption about the schema flowing into it from Step 1. Include at least one test case per branch in your evaluation set (Chapter 9), even for rare branches.
- **Passing an entire prior step's raw output forward "just in case" reintroduces the context-bloat problem decomposition was meant to solve.** If every stage defensively forwards everything from every previous stage, a long pipeline's final stages end up with as much irrelevant context as the monolithic prompt you were trying to avoid — deliberately scope what each stage actually needs, rather than forwarding everything by default.

## 🧠 Spot the Issue

A team builds a three-stage content-moderation pipeline:

::code-wrapper{language="markdown"}
```markdown
Stage 1: Classify the post as SAFE, BORDERLINE, or UNSAFE.
Stage 2 (only runs if Stage 1 returns BORDERLINE or UNSAFE): Extract the
specific policy violation category.
Stage 3 (only runs if Stage 2 was reached): Draft a user-facing explanation
of why the post was flagged.
```
::

The pipeline works well until a post that is genuinely UNSAFE, but written in a heavily sarcastic, indirect style, gets classified as SAFE at Stage 1 — and because Stage 2 and Stage 3 only run conditionally on Stage 1's output, the post sails through with no further checks at all. What structural property of this pipeline made the Stage 1 error unrecoverable, and what would make the design more robust to a single-stage misclassification?

<details>
<summary>Answer</summary>

The pipeline's conditional branching means every downstream stage's *entire existence* depends on Stage 1's classification being correct — there's no independent check anywhere in the pipeline that could catch or flag a Stage 1 error, because Stages 2 and 3 are architecturally incapable of running at all once Stage 1 says SAFE. This is the "errors compound across stages" risk taken to its extreme: instead of an error merely degrading a later stage's input quality, a single early misclassification here silently terminates the entire moderation pipeline with no downstream opportunity to catch it. A more robust design would decouple "should this get flagged for closer review" from a single classification call — for example, running a cheap independent secondary signal in parallel (a keyword/pattern check, or a second, differently-prompted classification pass) that can force escalation to Stage 2 even when the primary Stage 1 classifier says SAFE, or routing a random sample of SAFE-classified posts to human review as an ongoing check on Stage 1's real-world accuracy rather than trusting it unconditionally forever.

**The lesson**: when a pipeline's later stages only run conditionally on an early stage's output, that early stage becomes a single point of failure for the entire pipeline — high-stakes conditional gating needs an independent corroborating signal or a sampling-based audit, not sole reliance on one classification call.

</details>

## Key Takeaways

- Decomposition splits a complex task into a sequence or graph of smaller, single-purpose prompts, trading extra calls (cost, latency) for higher reliability, independent testability, and inspectable intermediate results.
- Decomposition earns its cost when sub-tasks require genuinely different techniques, when a human or program needs to check an intermediate result, or when the full task doesn't reliably fit one context/output budget — not for simple, narrow tasks that a single prompt already handles well.
- Parallelize stages that don't actually depend on each other's outputs; only serialize genuine dependencies, and draw the dependency graph explicitly before defaulting to a sequential chain.
- Prefer structured (schema-based) handoffs between stages over passing raw prose forward — structured intermediate results let ordinary application code validate, filter, and branch reliably.
- Errors compound multiplicatively across chained stages unless each stage is validated individually — a pipeline of several "usually reliable" steps is less reliable overall than any single step in isolation, unless you explicitly guard against propagation.
- Chain-of-thought (single call, internal reasoning) and decomposition (multiple calls, inspectable stages) solve related but distinct problems and combine well — decompose across major stages, and use CoT within any individual stage that benefits from it.
