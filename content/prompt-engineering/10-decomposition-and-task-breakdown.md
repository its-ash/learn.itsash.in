---
title: "10 — Decomposition & Task Breakdown"
description: "Splitting complex tasks into pipelines of focused single-purpose prompts — sequential vs parallel decomposition, structured handoffs, conditional branching, and error compounding. Code-first reference for mid-to-senior engineers."
---

# 10 — Decomposition & Task Breakdown

## One Giant Prompt vs. Several Focused Ones

::code-wrapper{language="python" filename="monolithic_vs_decomposed.py"}
```python
# ANTI-PATTERN: one monolithic prompt doing 5 things at once
MONOLITHIC_PROMPT = """
Read this contract. Summarize it, flag risky clauses, draft a response email
addressing the risky clauses, and translate the email to Spanish.

Contract: [long legal document]
"""
# Every part is individually something the model handles well. Bundled, quality
# on each part quietly degrades — the model divides a fixed attention and output
# budget across 5 sub-tasks, each competing for the same context, with no ability
# to fully "finish" one before starting the next.

# PRODUCTION: decompose into a pipeline, each step with one job
DECOMPOSED_PIPELINE = [
    {"step": 1, "job": "summarize", "input": "contract_text", "output": "summary"},
    {"step": 2, "job": "risk_analysis", "input": "summary + contract", "output": "risk_list"},
    {"step": 3, "job": "draft_email", "input": "risk_list", "output": "email_draft"},
    {"step": 4, "job": "translate", "input": "email_draft", "output": "spanish_email"},
]
# Each step: one job, independently testable, can use different techniques/models,
# and produces an intermediate artifact a human can inspect/correct BEFORE it feeds
# into the next step — rather than only reviewing a single opaque final output.
```
::

## Sequential vs. Parallel Decomposition

::code-wrapper{language="python" filename="parallel_decomposition.py"}
```python
import asyncio

async def call_model(prompt: str) -> str:
    """Simulated model call."""
    await asyncio.sleep(0.5)  # simulate latency
    return f"result for: {prompt[:50]}"

async def analyze_document(doc: str) -> dict:
    """Three independent views of the same document — run concurrently."""
    # These don't depend on each other's outputs → parallel, not sequential.
    # Cost: ~latency of the SLOWEST single call, not the SUM of all three.
    summary_task = call_model(f"Summarize: {doc}")
    entities_task = call_model(f"Extract all named entities as JSON: {doc}")
    sentiment_task = call_model(f"Classify sentiment (positive/negative/neutral): {doc}")

    summary, entities, sentiment = await asyncio.gather(
        summary_task, entities_task, sentiment_task
    )
    return {"summary": summary, "entities": entities, "sentiment": sentiment}

# PRINCIPLE: decompose along GENUINE dependencies. Only serialize steps that are
# actually sequential. A common mistake: chaining steps sequentially out of habit
# when nothing in step 2 needs step 1's output — paying sequential latency for a
# dependency that doesn't exist.
```
::

## Structured Handoffs Between Stages

::code-wrapper{language="python" filename="structured_handoff.py"}
```python
import json

# The quality of a decomposed pipeline lives or dies on what gets passed between
# steps. Passing raw prose is brittle — the next step must parse meaning from free
# text. Passing STRUCTURED output is far more robust.

RISK_SCHEMA = {
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

async def risk_pipeline(contract_text: str) -> str:
    # Step 1: extract risks with enforced schema
    risks = extract_with_schema(contract_text, RISK_SCHEMA)

    # Step 2: application code filters — no model call needed for this logic
    high_severity = [r for r in risks["risks"] if r["severity"] == "high"]

    # Step 3: draft email using only high-severity risks (structured input)
    email_draft = await call_model(
        f"Draft a firm-but-collaborative email raising these specific concerns: "
        f"{json.dumps(high_severity)}"
    )
    return email_draft

# Structured handoffs let ordinary application code validate, filter, and branch
# on intermediate results — cheaper and more reliable than asking a later prompt
# to re-derive "only mention the important ones" from unstructured prior output.
```
::

## Conditional Branching

::code-wrapper{language="python" filename="conditional_branching.py"}
```python
# A step's output can determine which step runs next — a flowchart, not a line.

async def triage_pipeline(ticket: str) -> str:
    # Step 1: classify (always runs)
    category = await call_model(f"Classify as BILLING, BUG_REPORT, or OTHER: {ticket}")
    category = category.strip()

    # Branch in APPLICATION CODE, not in a single "handle all three cases" prompt.
    # This makes behavior explicit, testable per-branch (Chapter 9), and easy to
    # extend with a new category without touching other branches' prompts.
    if category == "BILLING":
        result = await call_model(f"Extract invoice number and disputed amount, then draft billing response: {ticket}")
    elif category == "BUG_REPORT":
        result = await call_model(f"Extract reproduction steps and severity, then draft engineering triage: {ticket}")
    else:
        result = await call_model(f"Draft general response: {ticket}")

    return result

# Each branch can have its own prompt, its own model, its own tool set.
# Adding a new category = adding a new branch — existing branches are untouched.
```
::

## Error Compounding Across Stages

::code-wrapper{language="python" filename="error_compounding.py"}
```python
# CRITICAL: errors compound MULTIPLICATIVELY across chained stages.
# A pipeline with four 95%-reliable stages has a combined success rate of:
#   0.95^4 ≈ 0.815 → 81.5%, NOT 95%

stage_reliability = 0.95
num_stages = 4
combined = stage_reliability ** num_stages
print(f"Pipeline reliability: {combined:.1%}")  # 81.5%

# This means "each step usually works" does NOT add up to "the pipeline usually works."
# Mitigations:
# 1. VALIDATE at each stage — catch broken intermediate results before they propagate
# 2. RETRY or fall back at each stage individually
# 3. Don't assume step reliability compounds linearly — measure end-to-end

def pipeline_with_validation(stages: list, input_data):
    """Each stage validates its input before processing and output before returning."""
    data = input_data
    for i, stage in enumerate(stages):
        # Validate input to this stage
        if not stage.validate_input(data):
            raise PipelineError(f"Stage {i} received invalid input from stage {i-1}")

        data = stage.process(data)

        # Validate output from this stage before passing forward
        if not stage.validate_output(data):
            raise PipelineError(f"Stage {i} produced invalid output")

    return data
```
::

## CoT vs. Decomposition

::code-wrapper{language="python" filename="cot_vs_decomposition.py"}
```python
# CoT and decomposition solve related but DISTINCT problems:

# CHAIN-OF-THOUGHT (Chapter 5):
# - ONE model call reasons through multiple steps internally
# - Single context, single generation
# - Cheaper (one call), keeps reasoning within the model's working context
# - No inspection points between steps

# DECOMPOSITION (this chapter):
# - MULTIPLE separate calls, each with its own context
# - Human or program can inspect between steps
# - More expensive but: inspectable intermediate results, different techniques/
#   models per step, resilience to any single stage's context/output overload

# FREQUENT EFFECTIVE PATTERN: combine both.
# Decompose a task into major stages, and use CoT WITHIN any individual stage
# that benefits from step-by-step reasoning.

async def combined_approach(document: str) -> dict:
    # Stage 1: decomposed — extract entities (structured, no CoT needed)
    entities = extract_with_schema(document, ENTITY_SCHEMA)

    # Stage 2: decomposed + CoT — analyze risk (needs reasoning, structured output)
    risk_analysis = await call_model(f"""
        Think step by step about the risks in this document.
        Document: {document}
        Entities found: {json.dumps(entities)}
        Then output risks as JSON matching this schema: {RISK_SCHEMA}
    """)

    # Stage 3: decomposed — draft response (generation, no CoT)
    response = await call_model(f"Draft a response addressing these risks: {risk_analysis}")
    return {"entities": entities, "risks": risk_analysis, "response": response}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="python" filename="tips.py"}
```python
# [Idiom] Name each stage by its SINGLE responsibility. If you can't name it
# in one clause, it's two stages. "extract-and-summarize" → split into "extract"
# and "summarize" — even if you merge them for latency, the naming surfaces
# hidden multi-tasking before it becomes a debugging problem.

# [Debug] Log EVERY intermediate step's input and output, not just the final
# result. When a multi-step pipeline produces a bad answer, having the full
# trace of intermediates is what makes it possible to localize the failure in
# minutes instead of hours.

# [Idiom] Put validation BETWEEN stages, not just at the end. A cheap structural
# check (does the JSON have required fields? is severity a valid enum value?)
# run after each stage catches a broken intermediate before it propagates
# downstream and corrupts an otherwise-fine final output.

# [Performance] Use a cheaper/faster model for simple well-defined stages and
# reserve your strongest model for the stage that actually needs deep reasoning.
# A pipeline's total cost/latency is the sum of its stages — not every stage
# needs your most expensive model.

# [Idiom] Parallelize aggressively wherever dependencies genuinely allow it.
# Before finalizing a design, explicitly draw the dependency graph between steps
# (which steps need which prior outputs). Independent branches should run
# concurrently — don't default to a sequential chain.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python" filename="edge_cases.py"}
```python
# [Gotcha] Errors compound across stages if not handled explicitly. Four 95%
# stages → 81.5% combined. Validate and retry/fall back at each stage, don't
# assume "each step usually works" → "the pipeline usually works."

# [Gotcha] A later stage can't recover context that an earlier stage DISCARDED.
# If extraction pulls only 3 fields and a later drafting stage needs a 4th piece
# that was in the original document but never extracted, the pipeline has no way
# to go back. Either pass original source material forward alongside extracted
# summaries, or ensure the extraction schema anticipates everything downstream needs.

# [Gotcha] Sequential latency is invisible until it's in production at real user
# think-time. A 4-stage pipeline that took acceptable seconds in dev against a
# fast, lightly-loaded API can feel unacceptably slow under production latency
# and rate-limiting. Measure end-to-end under realistic conditions.

# [Gotcha] Conditional branches rarely exercised in testing can harbor silent
# bugs for months. A branch handling an uncommon category might go months without
# a real example, and when one arrives, the branch's prompt was written against a
# stale assumption about the schema flowing into it. Include at least one test
# case per branch, even for rare branches (Chapter 9).

# [Gotcha] Passing an entire prior step's raw output forward "just in case"
# reintroduces the context-bloat problem decomposition was meant to solve. If
# every stage defensively forwards everything, the final stages end up with as
# much irrelevant context as the monolithic prompt you were trying to avoid.
```
::

## 🧠 Spot the Bug

A three-stage moderation pipeline: Stage 1 classifies as SAFE/BORDERLINE/UNSAFE. Stage 2 (only runs if BORDERLINE/UNSAFE) extracts the violation category. Stage 3 (only runs if Stage 2 ran) drafts the user-facing explanation. A genuinely UNSAFE post written in heavily sarcastic, indirect style gets classified as SAFE at Stage 1. Because Stages 2 and 3 only run conditionally, the post sails through with no further checks. What's the structural flaw?

<details>
<summary>Answer</summary>

The pipeline's conditional branching means every downstream stage's *entire existence* depends on Stage 1 being correct — there's no independent check that could catch a Stage 1 error, because Stages 2 and 3 are architecturally incapable of running once Stage 1 says SAFE. This is the "errors compound across stages" risk taken to its extreme: instead of degrading a later stage's input, a single early misclassification *terminates the entire pipeline* with no downstream opportunity to catch it.

A more robust design would decouple "should this get flagged for closer review" from a single classification call — for example, running a cheap independent secondary signal in parallel (a keyword/pattern check, or a second differently-prompted classification pass) that can force escalation to Stage 2 even when Stage 1 says SAFE, or routing a random sample of SAFE-classified posts to human review as an ongoing audit on Stage 1's accuracy.

The lesson: when later stages only run conditionally on an early stage's output, that early stage becomes a **single point of failure** for the entire pipeline. High-stakes conditional gating needs an independent corroborating signal or a sampling-based audit, not sole reliance on one classification call.

</details>

## Key Takeaways

::code-wrapper{language="python" filename="key_takeaways.py"}
```python
"""
Decomposition & task breakdown — pipelines of focused prompts.
"""

# 1. One giant prompt dividing attention across N tasks → quality degrades on
#    each. Decompose into focused single-purpose stages → each gets full attention.

# 2. Decompose along GENUINE dependencies. Only serialize steps that need prior
#    outputs. Independent steps → parallel (asyncio.gather). Dependency graph
#    first, chain second.

# 3. Structured handoffs between stages (JSON schema) let application code
#    validate, filter, and branch reliably — far more robust than passing prose.

# 4. Errors compound MULTIPLICATIVELY: 0.95^4 = 0.815, not 0.95. Validate at
#    each stage, retry/fall back individually, measure end-to-end reliability.

# 5. CoT (one call, internal reasoning) and decomposition (multiple calls,
#    inspectable stages) solve different problems and COMBINE well: decompose
#    across major stages, use CoT within any stage that benefits from it.
```
::
