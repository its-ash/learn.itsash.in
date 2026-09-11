---
title: "05 — Chain-of-Thought Prompting"
description: "CoT as self-generated context narrowing — zero-shot, few-shot, extended thinking, reasoning-answer separation, and the fluent-but-wrong failure mode. Production patterns for bounded reasoning and high-stakes verification. Code-first reference for mid-to-senior engineers."
---

# 05 — Chain-of-Thought Prompting

## The Mechanism: CoT as Self-Generated Context

::code-wrapper{language="python" filename="cot_mechanism.py"}
```python
# WHY CoT WORKS — the autoregressive mechanism:
#
# WITHOUT CoT: the model must arrive at the correct answer in ONE shot,
# with no intermediate "scratch space." The final answer token is conditioned
# only on the prompt + whatever implicit internal computation happens in a
# single forward pass.
#
# WITH CoT: the model writes intermediate steps. Those steps become PART OF
# the context that later tokens condition on. Each step narrows the space
# of plausible next steps. The model is using its OWN GENERATED TEXT as
# working memory.
#
# CoT doesn't make the model "think harder" in some abstract sense — it
# gives the model more tokens of relevant, self-generated context to
# condition the final answer on.

# Pseudocode of the difference:
def without_cot(prompt):
    # Answer token conditioned on prompt only
    answer = model.generate(prompt + "Answer:")
    return answer  # one-shot — no scratch space

def with_cot(prompt):
    # Reasoning tokens become context for the answer
    reasoning = model.generate(prompt + "Think step by step:")
    answer = model.generate(prompt + reasoning + "Answer:")
    return answer  # reasoning tokens are now load-bearing context for the answer

# Each intermediate line is a CHECKPOINT the model can verify against:
# if the running total is nonsensical (negative, absurdly large), that's
# visible in the token stream and can influence correction — a single
# hidden mental step cannot.
```
::

## Zero-Shot CoT: The One-Line Trigger

::code-wrapper{language="markdown" filename="zero_shot_cot.md"}
```markdown
A store had 142 units of a product. They sold 37% of their stock on Monday,
then received a shipment of 60 more units. On Tuesday they sold 28 units.
How many units are left?

Think through this step by step before giving your final answer.
```
::

::code-wrapper{language="markdown" filename="zero_shot_cot_output.md"}
```markdown
Starting stock: 142 units
Sold 37% on Monday: 142 × 0.37 = 52.54, round to 53 units sold
Remaining after Monday: 142 - 53 = 89 units
Received shipment: 89 + 60 = 149 units
Sold on Tuesday: 149 - 28 = 121 units

Final answer: 121 units remain.
```
::

## Few-Shot CoT: Demonstrating the Reasoning Pattern

::code-wrapper{language="markdown" filename="few_shot_cot.md"}
```markdown
Q: A cafe sells cups of coffee for $4 and pastries for $3. On a day they
sold 45 coffees and 20 pastries, but 3 pastries were returned for a refund,
what was their net revenue?

A: Coffee revenue: 45 × $4 = $180
Pastry revenue before returns: 20 × $3 = $60
Refunds for returned pastries: 3 × $3 = $9
Net pastry revenue: $60 - $9 = $51
Total net revenue: $180 + $51 = $231
The answer is $231.

Q: A parking garage charges $5 for the first hour and $2 for each
additional hour. A customer parked for 6 hours but has a coupon for 25%
off the total. What did they pay?

A:
```
::

## Extended Thinking / Reasoning Mode

::code-wrapper{language="python" filename="extended_thinking.py"}
```python
from anthropic import Anthropic

client = Anthropic()

# Extended thinking is a DEDICATED reasoning phase with its own token budget,
# distinct from prompted CoT. The model reasons in a separate channel BEFORE
# producing its user-facing answer. The thinking content is typically presented
# separately (collapsed/summarized or not exposed at all), not interleaved.

response = client.messages.create(
    model="claude-opus-5",
    max_tokens=4096,
    thinking={                  # ← dedicated reasoning budget, not prompt text
        "type": "enabled",
        "budget_tokens": 2048,  # the model can use up to 2048 tokens for reasoning
    },
    messages=[{
        "role": "user",
        "content": "Given these three vendor contracts, which has the most "
                   "unfavorable termination clause, and why?",
    }],
)

# The response contains separate blocks:
thinking_block = next(b for b in response.content if b.type == "thinking")
answer_block = next(b for b in response.content if b.type == "text")

# KEY DISTINCTION from prompted CoT:
# - Prompted CoT: "think step by step" in the prompt → reasoning is VISIBLE
#   in the response text, every time, even on trivial inputs
# - Extended thinking: API-level setting → the model ADAPTIVELY decides how
#   much reasoning a problem needs, reducing "wasted CoT on easy tasks"
#
# PRACTICAL RULE: on a model with genuine extended-thinking support, use the
# dedicated setting/parameter rather than simulating it with a prompt instruction.
# The dedicated mechanism is trained and optimized for deep reasoning.
#
# But: for tasks needing a SPECIFIC reasoning structure (Chapter 5's worked
# examples, Chapter 11's verification checks), explicitly prompt that structure
# — even alongside extended thinking. Extended thinking raises the CEILING on
# unaided reasoning; it doesn't replace a scaffold you know works better.
```
::

## Anti-Pattern: CoT on Simple Tasks

::code-wrapper{language="python" filename="anti_patterns.py"}
```python
# ANTI-PATTERN: reflexively adding "think step by step" to EVERY prompt

# BAD — CoT on a simple classification adds latency + cost for zero benefit:
BAD_PROMPT = """
Classify the sentiment of this review as POSITIVE, NEGATIVE, or MIXED.

Review: "Works great, arrived on time."

Think through this step by step before giving your final answer.
"""
# The model might overthink a simple case into an incorrect, more nuanced-sounding
# but wrong answer — talking itself out of the obviously correct response.

# FINE — direct answer on a simple task:
GOOD_PROMPT = """
Classify the sentiment of this review as POSITIVE, NEGATIVE, or MIXED.
Reply with only the label.

Review: "Works great, arrived on time."
"""

# ANTI-PATTERN: reasoning AFTER the answer
BAD_ORDERING = """
What is the final price? Answer first, then explain your reasoning.
"""
# Because generation is autoregressive, reasoning that appears AFTER a stated
# answer CANNOT have influenced that answer — the answer was already committed
# before the reasoning tokens were generated. This is post-hoc justification,
# not reasoning that informs the answer.

# CORRECT: reasoning BEFORE the answer
GOOD_ORDERING = """
Think through this step by step, then give your final answer.
"""
# The reasoning tokens become context that the answer token conditions on.
```
::

## CoT + Output Format: The Separation Pattern

::code-wrapper{language="markdown" filename="cot_with_format.md"}
```markdown
First, reason through the problem step by step inside <reasoning> tags.
Then, after your reasoning, output your final answer inside <answer> tags
as a JSON object matching this schema: {"category": string, "confidence":
"low" | "medium" | "high"}. Nothing should appear after the closing
</answer> tag.
```
::

::code-wrapper{language="python" filename="two_call_pipeline.py"}
```python
import re, json

# PRODUCTION PATTERN: two-call pipeline cleanly separates reasoning from
# structured output, avoiding the format conflict entirely.

def reasoning_then_extraction(question: str, context: str) -> dict:
    # Call 1: reason freely (no format constraint competing for attention)
    reasoning_response = client.messages.create(
        model="claude-opus-5",
        max_tokens=2048,
        messages=[{"role": "user", "content": f"""
            Reason through this problem step by step.
            Context: {context}
            Question: {question}
            Show your work. Do not produce a final structured answer yet.
        """}],
    )
    reasoning = reasoning_response.content[0].text

    # Call 2: extract structured answer from the reasoning (format-only, no reasoning)
    extraction_response = client.messages.create(
        model="claude-opus-5",
        max_tokens=256,
        output_config={"format": {"type": "json_schema", "schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string"},
                "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            },
            "required": ["category", "confidence"],
        }}},
        messages=[{"role": "user", "content": f"""
            Based on this reasoning, extract the final answer as JSON.
            Reasoning: {reasoning}
        """}],
    )
    return json.loads(extraction_response.content[0].text)

# Benefits: reasoning is free-form (no format tension), structured output is
# enforced by the API (no parsing failures), and you can LOG the reasoning
# separately for debugging without it polluting the parsed result.
```
::

## The "Fluent But Wrong" Failure

::code-wrapper{language="markdown" filename="fluent_but_wrong.md"}
```markdown
Determine whether this applicant qualifies for pre-approval. Think step
by step, and make sure your final answer is APPROVED or DENIED.

Applicant: credit score 710, annual income $58,000, requested loan
amount $340,000, existing monthly debt payments $1,200.

Approval requires: credit score >= 680, debt-to-income ratio (existing
monthly debt / monthly income) below 36%, and loan amount no more than
5x annual income.
```
::

::code-wrapper{language="python" filename="fluent_but_wrong_diagnosis.py"}
```python
# The model produces a lengthy, confident chain of reasoning and concludes APPROVED.
# A loan officer catches: $340,000 / $58,000 = 5.86x — FAILS the "no more than 5x" rule.
# Yet the model's reasoning trace CLAIMED to check this criterion and stated it passed.
#
# WHAT HAPPENED: the reasoning trace LOOKED like it verified the constraint, but
# the underlying multiplication (5 × $58,000 = $290,000, then $340K vs $290K) either
# wasn't performed correctly or was misreported in the restated conclusion.
#
# THE DEEPER LESSON: a visible reasoning trace is NOT a verification mechanism.
# It's a debugging aid and an accuracy improvement ON AVERAGE, but any individual
# trace can be wrong while looking entirely legitimate. Fluency ≠ correctness.
#
# PRODUCTION FIX for high-stakes numeric/rule-based decisions:
# Externalize the actual arithmetic and threshold checks into DETERMINISTIC code.

def evaluate_loan(credit_score, annual_income, loan_amount, monthly_debt):
    """Deterministic evaluation — the model does NOT compute these."""
    # Rule 1: credit score >= 680
    credit_ok = credit_score >= 680

    # Rule 2: DTI < 36% (existing monthly debt / monthly income)
    monthly_income = annual_income / 12
    dti = monthly_debt / monthly_income
    dti_ok = dti < 0.36

    # Rule 3: loan amount <= 5x annual income
    loan_ratio_ok = loan_amount <= 5 * annual_income

    return {
        "approved": credit_ok and dti_ok and loan_ratio_ok,
        "checks": {
            "credit_score": {"value": credit_score, "pass": credit_ok},
            "dti_ratio": {"value": round(dti, 4), "pass": dti_ok},
            "loan_to_income": {"value": round(loan_amount / annual_income, 2), "pass": loan_ratio_ok},
        }
    }

result = evaluate_loan(710, 58_000, 340_000, 1_200)
# {"approved": False, "checks": {
#   "credit_score": {"value": 710, "pass": True},
#   "dti_ratio": {"value": 0.0248, "pass": True},
#   "loan_to_income": {"value": 5.86, "pass": False}  ← deterministic, no hallucination
# }}

# Use the MODEL for judgment (is the application suspicious? is there context?),
# use DETERMINISTIC CODE for the numbers. CoT is a nice-to-have explanation
# layer on top of verified numbers, NOT the source of truth for the numbers.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="python" filename="tips.py"}
```python
# [Idiom] "Think step by step" is a floor, not a ceiling. Specify WHAT KIND
# of steps: "list the relevant constraints first, then check each option
# against them, then state your conclusion" gives a specific reasoning scaffold.

# [Debug] Ask for reasoning BEFORE the answer, never after. Autoregressive
# generation means reasoning after the answer is post-hoc justification that
# couldn't have influenced the answer.

# [Debug] Use CoT to debug prompts even if you don't ship it. When a zero-shot
# prompt fails mysteriously, add "think step by step" and inspect the trace.
# It often reveals which assumption or ambiguity is causing the failure (Chapter 4).
# Then fix the instruction — sometimes letting you remove the CoT entirely.

# [Performance] Cap reasoning length for cost-sensitive paths. "reason in at
# most 4 short steps" controls both cost and the risk of wandering into
# unhelpful tangents. Open-ended CoT + tight max_tokens can truncate before
# the final answer is produced — bound the reasoning or raise the budget.

# [Idiom] CoT + self-consistency (Chapter 11) is a strong combo for high-stakes
# decisions: generate several independent CoT traces, check if they converge.
# More robust than trusting a single trace, especially for anything with consequences.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python" filename="edge_cases.py"}
```python
# [Gotcha] Reasoning can be fluent AND wrong simultaneously. A model can produce
# a chain that reads as completely coherent and confident while containing a
# subtle error partway through. Because each step conditions the next, one
# early error propagates and gets "confirmed" by everything that follows — the
# model reasons consistently FROM the mistake rather than toward truth.
# Fluency of the trace is NOT evidence of correctness. Verify against ground truth.

# [Gotcha] Forcing a reasoning format can truncate the answer at the token limit.
# If your prompt requests lengthy step-by-step reasoning AND you have a
# max_tokens limit, the reasoning can consume the whole budget, cutting off
# before the final answer is ever produced. Either bound the reasoning length,
# request the answer first (if reasoning is for post-hoc explanation only),
# or allocate a generous budget with a cheap final-answer format.

# [Gotcha] "Think step by step" doesn't guarantee the model uses YOUR intended
# steps. In zero-shot CoT, the model chooses its own reasoning structure, which
# may not match yours (it might reason about the wrong sub-problem first).
# If the SPECIFIC SEQUENCE matters, use few-shot CoT with examples showing
# that exact sequence.

# [Gotcha] CoT doesn't fix tasks that are about missing information, not missing
# reasoning. If a prompt asks the model to determine something genuinely
# un-derivable from the given information, CoT produces confident-looking
# reasoning that arrives at a number anyway — the scaffold doesn't prevent
# confabulation of missing premises. See Chapter 17.

# [Gotcha] Extended thinking + prompted CoT can conflict or double up. Enabling
# a dedicated extended-thinking parameter AND including "think step by step"
# can be redundant (paying for reasoning twice) or interact in undocumented ways.
# Check current provider docs before combining.
```
::

## 🧠 Spot the Bug

A developer building a loan pre-approval assistant writes the prompt shown in `fluent_but_wrong.md` above. The model concludes APPROVED, but the loan-to-income ratio is 5.86x, failing the 5x rule. The model's own reasoning trace claimed to have checked this and stated it passed. What does this reveal?

<details>
<summary>Answer</summary>

The reasoning trace *looked* like it verified the constraint, but the underlying multiplication either wasn't performed correctly or was misreported. This is the "fluent and wrong" failure: a chain that reads as if it checked something can still get that specific check wrong, especially for multi-digit arithmetic (Chapter 1's tokenization problem). 

The deeper lesson: **a visible reasoning trace is not a verification mechanism**. For high-stakes decisions like loan approval, the fix is not "add more CoT instructions" but to **externalize the arithmetic and threshold checks into deterministic code** (see `fluent_but_wrong_diagnosis.py`) and use the model only for parts that genuinely require judgment — with CoT as an explanation layer on top of verified numbers, not as the source of truth for the numbers themselves.

</details>

## Key Takeaways

::code-wrapper{language="python" filename="key_takeaways.py"}
```python
"""
Chain-of-thought — mechanism, application, and limits.
"""

# 1. CoT works because autoregressive generation lets earlier reasoning tokens
#    condition and improve later ones. It's self-generated context, not "thinking
#    harder." The model uses its own output as working memory.
#    without_cot: answer = model(prompt + "Answer:")
#    with_cot:    answer = model(prompt + reasoning + "Answer:")  # reasoning is context

# 2. Zero-shot CoT ("think step by step") is a cheap default for multi-step tasks.
#    Few-shot CoT (demonstrating the reasoning pattern) gives control over the
#    specific STRUCTURE of the reasoning.

# 3. CoT helps most on derivation-based tasks (arithmetic, logic, planning).
#    It hurts on simple lookups, classifications, and creative tasks — adds
#    latency and cost with no accuracy gain, can cause overthinking.

# 4. A fluent, confident reasoning trace is NOT proof of correctness. Reasoning
#    can be internally consistent and still wrong, especially on arithmetic.
#    → High-stakes numeric decisions: use deterministic code, not CoT, for the numbers.

# 5. Extended thinking ≠ prompted CoT. Dedicated reasoning modes (API-level
#    settings) are trained and optimized for deep reasoning. Use the dedicated
#    mechanism when available; reserve prompted CoT for when you need a SPECIFIC
#    reasoning structure the model wouldn't produce on its own.
```
::
