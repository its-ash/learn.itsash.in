---
title: "11 — Self-Consistency & Verification"
description: "Sampling multiple independent reasoning paths and voting — naive self-verification vs structured verification, self-consistency, external ground-truth checks, and multi-model cross-checking. Code-first reference for mid-to-senior engineers."
---

# 11 — Self-Consistency & Verification

## Why Naive Self-Verification Fails

::code-wrapper{language="python" filename="naive_self_verification.py"}
```python
# NAIVE: "double-check your answer" or "are you sure?"
# The same model, conditioned on the SAME reasoning, re-examines its OWN output.
# If the error came from a genuine gap in what the model learned (not a sampling
# fluke), re-examining the same reasoning reproduces the SAME error with renewed
# confidence.

# EXAMPLE: "What is the capital of Australia?"
# Model answers "Sydney" (a common misconception — Sydney is the best-known
# city but NOT the capital; it's Canberra).
# "Are you sure?" → either "Yes, I'm sure" (no re-derivation) or flips to a
# DIFFERENT wrong answer because the question implied doubt, not because new
# evidence was introduced.

# NAIVE SELF-VERIFICATION WORKS FOR:
# - Arithmetic slips visible from the output itself (re-read catches them)
# - JSON with a missing bracket
# - Answers contradicting an explicit constraint stated earlier in the same prompt
# It FAILS FOR:
# - Factual errors rooted in what the model BELIEVES to be true
# - No new signal is introduced that would change the belief on a second pass
```
::

## Structured Verification: Different Method, Not Re-Read

::code-wrapper{language="markdown" filename="structured_verification.md"}
```markdown
Step 1: Solve the following problem, showing your work.

A store offers a 20% discount, then charges 8% sales tax on the
discounted price. If the original price is $150, what is the final price?

Step 2: Now verify your Step 1 answer by solving the problem a second
time using a different method (e.g., if you multiplied discount and tax
factors together first, this time apply the discount first, get an
intermediate dollar value, then apply tax to that intermediate value
separately). State whether the two methods agree. If they disagree,
identify which step diverged and redo the calculation.
```
::

::code-wrapper{language="python" filename="verification_principle.py"}
```python
# PRINCIPLE: verification is only informative when it's STRUCTURALLY DIFFERENT
# from the original reasoning path, not just a repetition phrased as a question.

# BAD: "double-check your work" → likely re-reads the same derivation and nods
# GOOD: "solve using a different method and compare" → genuinely independent derivation

# The different method is real corroborating evidence. A re-read is not.
```
::

## Self-Consistency: Sample N Times, Vote

::code-wrapper{language="python" filename="self_consistency.py"}
```python
from collections import Counter
import re

def self_consistency(prompt: str, n: int = 5, temperature: float = 0.7) -> tuple[str, float]:
    """Generate N independent reasoning paths at nonzero temperature, take majority vote.

    Intuition: a model's reasoning errors on a hard problem are often RANDOM with
    respect to which wrong path it takes. Correct reasoning tends to converge on
    the same answer via multiple valid routes. Many ways to be wrong, usually one
    way to be right → the correct answer shows up more often than any single wrong one.
    """
    answers = []
    for _ in range(n):
        response = client.messages.create(
            model="claude-opus-5",
            max_tokens=1024,
            temperature=temperature,  # CRITICAL: must be nonzero for sampling diversity
            messages=[{"role": "user", "content": prompt}],
        )
        answer = extract_final_answer(response.content[0].text)
        answers.append(answer)

    # Majority vote
    most_common, count = Counter(answers).most_common(1)[0]
    confidence = count / n
    return most_common, confidence

def extract_final_answer(text: str) -> str:
    """Extract the final answer from a CoT response."""
    # Look for "The answer is X" or "Final answer: X" patterns
    match = re.search(r'(?:answer is|Final answer:)\s*(.+?)(?:\n|$)', text, re.IGNORECASE)
    return match.group(1).strip() if match else text.strip().split('\n')[-1]

# WHAT IT FIXES: variance — cases where the model sometimes gets it right
# WHAT IT DOESN'T FIX: bias — systematic errors the model makes EVERY time
# (the Sydney/Canberra case would show "Sydney" across ALL n samples —
#  it's not a random slip, it's a consistent misconception)
```
::

## Verification Against External Ground Truth

::code-wrapper{language="python" filename="external_verification.py"}
```python
def verified_extraction(document: str, schema: dict) -> dict:
    """Extract structured data, then verify extracted quotes against source text.
    This is a DETERMINISTIC, non-LLM check — cheaper and more reliable than asking
    the model to check itself."""
    result = extract_with_schema(document, schema)

    for field, value in result.items():
        if value is not None and isinstance(value, str):
            # Check: does this extracted value actually appear in the source?
            if value not in document:
                flag_for_review(
                    field=field,
                    value=value,
                    reason="Extracted value not found verbatim in source — likely fabricated or paraphrased"
                )

    return result

# This catches a REAL, common failure mode: a model paraphrasing or subtly
# fabricating a "quote" that doesn't appear in the source. Far more reliable than
# asking the model "is this quote accurate?" (same model checking its own output).

# GENERAL PRINCIPLE: verification is STRONGEST when checking against ground truth
# EXTERNAL to the model's generation:
#   - a database (does this customer ID exist?)
#   - a calculator (is this arithmetic result correct?)
#   - the literal source document (does this quote appear verbatim?)
#   - a schema validator (is this JSON structurally valid?)
# All of these are cheap, deterministic, and don't depend on the model grading itself.
```
::

## Multi-Model Cross-Checking

::code-wrapper{language="python" filename="multi_prompt_crosscheck.py"}
```python
# Have two differently-prompted calls independently attempt the same task.
# Agreement = stronger evidence. Disagreement = flag for human judgment.

PROMPT_A = """
What is the primary cause of this application crash, based on the attached
stack trace? State the root cause in one sentence.
"""

PROMPT_B = """
A colleague claims the primary cause of this crash is a null pointer
dereference in the request handler. Review the attached stack trace and
either confirm or refute that specific claim, citing the exact lines that
support your conclusion.
"""

async def cross_check(stack_trace: str) -> dict:
    """Two independent framings; disagreement triggers human review."""
    result_a = await call_model(PROMPT_A + f"\n\nStack trace:\n{stack_trace}")
    result_b = await call_model(PROMPT_B + f"\n\nStack trace:\n{stack_trace}")

    # Compare — if both converge on the same root cause, stronger evidence
    # If they diverge, flag for human judgment rather than picking arbitrarily
    if normalize_answer(result_a) == normalize_answer(result_b):
        return {"status": "agreement", "answer": result_a}
    else:
        return {
            "status": "disagreement",
            "answer_a": result_a,
            "answer_b": result_b,
            "action": "escalate_to_human",
        }

# CAVEAT: cross-checking catches DIVERGENT errors, not SHARED ones. If both
# prompts share the same blind spot (both rely on general knowledge about a
# fact the model is simply wrong about), agreement provides FALSE reassurance.
# Not a substitute for external grounding (Chapter 12) when the risk is a
# shared factual gap rather than a reasoning-path fluke.
```
::

## Where to Spend the Verification Budget

::code-wrapper{language="python" filename="verification_budget.py"}
```python
# Verification costs extra tokens, calls, and latency. Allocate by stakes + measurability:

VERIFICATION_PRIORITIES = {
    "early_pipeline_stages": "HIGH — an error here propagates through everything downstream",
    "numeric_factual_claims": "HIGH — external checks (calculator, source doc) are cheap and available",
    "high_stakes_low_frequency": "HIGH — medical/legal/financial with real consequences",
    "measured_high_error_rate": "HIGH — from your eval data (Chapter 9), not intuition",
    "low_stakes_high_frequency": "LOW — casual chat; cost of occasional error < cost of verification",
    "creative_generation": "LOW — no 'correct' answer to verify against",
}

# RULE: spend the verification budget where your DATA says it's needed, not where
# intuition says it MIGHT be needed. If your eval set shows 2% error on classification
# but 15% error on extraction, spend your budget on extraction verification.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="python" filename="tips.py"}
```python
# [Idiom] Ask for a different METHOD, not a re-read. "Verify using a different
# approach (work backward, check a special case, use a different formula)" —
# not "check your work" (which too easily becomes a repetition).

# [Idiom] Reserve self-consistency for problems with a CHECKABLE final answer.
# Majority voting works when answers are comparable (number, category, short fact).
# It's much harder to apply to open-ended generation (no clean "majority vote"
# over 5 different essays).

# [Debug] Log disagreement rate as a quality signal, not just a routing trigger.
# A sudden rise in disagreement across samples flags an ambiguous new input
# pattern or a prompt that's stopped matching current input characteristics.

# [Performance] Cheap external verification beats expensive model-based verification.
# Checking an extracted quote against source text costs milliseconds of deterministic
# code. Use it IN PREFERENCE to a second LLM call whenever ground truth is checkable.

# [Performance] Combine self-consistency with decomposition for the highest-stakes
# SINGLE stage, not the whole pipeline. Running every stage 5x multiplies cost
# across the entire pipeline — identify the single highest-risk stage and apply
# heavy verification only there.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python" filename="edge_cases.py"}
```python
# [Gotcha] Self-consistency at temperature 0 DOESN'T WORK. If every sample is
# deterministic, all N samples produce the same output regardless of correctness.
# Self-consistency REQUIRES actual sampling diversity (nonzero temperature).

# [Gotcha] A confident, articulate wrong answer can WIN a majority vote if the
# model has a strong, consistent (but mistaken) prior. 5/5 samples agreeing on
# "Sydney" for Australia's capital is NOT proof of correctness — it's a shared
# misconception. Self-consistency corrects VARIANCE, not BIAS.

# [Gotcha] Verification steps can THEMSELVES introduce errors. A "double-check
# this JSON is valid" pass, run as a model call rather than a deterministic
# parser, can confidently declare malformed JSON valid or "fix" valid JSON into
# a broken form. Whenever a deterministic check exists, it's strictly more reliable.

# [Gotcha] The cost multiplier is easy to underestimate at scale. 5 samples =
# 5x token spend AND 5x load on rate limits, EVERY time that code path runs.
# Reserve explicitly for the subset of requests that need it, not uniformly.

# [Gotcha] Multi-prompt cross-checking can produce two independently wrong answers
# that AGREE. If both prompts share the same underlying blind spot, agreement
# provides false reassurance. Cross-checking catches divergent errors, not shared ones.
```
::

## 🧠 Spot the Bug

A medical triage assistant adds: "You just classified this patient's symptoms as LOW urgency. Before finalizing, double-check: are you confident this is correct?" The check almost never changes the classification — the model always responds "Yes, I'm confident." The team concludes it's working well. What's the flaw?

<details>
<summary>Answer</summary>

A verification step that *always confirms* the original answer provides zero information — it can't distinguish "the classification was actually correct" from "the verification step is a rubber stamp that never meaningfully re-examines anything." This is the naive self-verification failure: asking the same model, with the same reasoning, whether it's "confident" introduces no new derivation or external signal that could catch an error.

For a high-stakes domain like medical triage, a rigorous design would use:
1. **Structured, method-different verification** — re-derive the urgency from symptoms against an explicit checklist of red-flag symptoms, independent of the first pass's reasoning.
2. **An external, non-LLM safety net** — a hard rule that any symptom matching a predefined red-flag list is escalated to at least MEDIUM urgency regardless of the model's classification.
3. **Human clinical review** as the actual safeguard for anything the system is uncertain about.

A verification step that virtually always confirms the original answer is not evidence the answer was right — it's a sign the verification step isn't introducing any new reasoning path or external check.

</details>

## Key Takeaways

::code-wrapper{language="python" filename="key_takeaways.py"}
```python
"""
Self-consistency & verification — catching errors beyond single-run.
"""

# 1. Naive self-verification ("are you sure?") catches surface-visible errors
#    (arithmetic slips, malformed structure) but NOT errors rooted in what the
#    model actually believes. Same reasoning re-examined → same conclusion.

# 2. Structured verification forcing a DIFFERENT METHOD is meaningfully stronger:
#    a different derivation arriving at the same answer is real corroboration.

# 3. Self-consistency (N samples at nonzero temp, majority vote) corrects VARIANCE
#    but NOT BIAS. 5/5 agreeing on a shared misconception ≠ proof of correctness.

# 4. Verification against EXTERNAL ground truth (source docs, calculators, schema
#    validators, databases) is more reliable than ANY form of self-checking.
#    Prefer external checks whenever ground truth is mechanically accessible.

# 5. Verification budget is finite — allocate by measured error rates and stakes.
#    Prioritize: early pipeline stages, checkable factual claims, high-stakes
#    low-frequency decisions. Don't apply uniformly — cost compounds at scale.
```
::
