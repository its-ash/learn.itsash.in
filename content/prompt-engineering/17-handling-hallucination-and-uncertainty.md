---
title: "17 — Handling Hallucination & Uncertainty"
description: "The mechanism of hallucination, calibrated uncertainty prompting, grounding with citations, explicit I-don't-know permission, self-review for risky claims, and domain-specific risk patterns. Code-first reference for mid-to-senior engineers."
---

# 17 — Handling Hallucination & Uncertainty

## What Hallucination Mechanistically Is

::code-wrapper{language="python" filename="hallucination_mechanism.py"}
```python
# Hallucination = fluent, confident, plausible-sounding output that is factually wrong.
# A fabricated citation, a nonexistent API method, a legal case that doesn't exist.
#
# The model has NO built-in mechanism separating "things I'm recalling with high
# confidence" from "things I'm generating because they're a plausible continuation."
# Both produce the same kind of fluent, confident-sounding token stream.
#
# Fluency and confidence-sounding are properties of HOW text is generated,
# not signals the model separately tracks about WHETHER the content is true.

# Hallucination is NOT a bug — it's an expected consequence of the mechanism.
# Most likely to surface where training data was thin, contradictory, or absent:
HALLUCINATION_RISK_ZONES = {
    "obscure_facts": "training data was thin or inconsistent",
    "recent_events": "past training cutoff — info may not exist in training at all",
    "exact_citations": "high-precision, low-redundancy facts — hard to reproduce reliably",
    "precise_numbers": "exact statistics are rarely memorized precisely",
    "version_specific_apis": "training data mixes many versions; model blends across them",
}
```
::

## The Naive Fix (And Why It's Weak)

::code-wrapper{language="markdown" filename="naive_anti_hallucination.md"}
```markdown
<!-- ANTI-PATTERN: close to useless -->
Don't hallucinate. Only tell me true things.
```
::

::code-wrapper{language="python" filename="why_naive_fails.py"}
```python
# WHY THIS FAILS: the model doesn't have a labeled internal flag for "this specific
# claim is a hallucination" that this instruction could suppress. Asking it not to
# hallucinate is asking it to distinguish confident-recall from plausible-generation
# at the moment of production — when both processes look identical from the inside.
#
# It's like telling someone "don't misremember things" — well-intentioned but gives
# no new capability to act on.
#
# What ACTUALLY helps:
# 1. Give the model an explicit, low-cost way to express PARTIAL confidence
# 2. Force it to ground claims in provided material rather than parametric memory
# 3. Structure the task so fabrication has a clear, nameable ALTERNATIVE
```
::

## Prompting for Calibrated Uncertainty

::code-wrapper{language="markdown" filename="calibrated_uncertainty.md"}
```markdown
For each claim in your answer, tag it with your confidence:
[HIGH] — you're confident this is accurate based on well-established
  information.
[MEDIUM] — you believe this is likely correct but it's the kind of
  detail (exact date, exact figure, niche fact) where you could be wrong.
[LOW] — you're genuinely unsure and are providing your best guess; flag
  it clearly as such rather than stating it plainly.

If you cannot support a claim at even LOW confidence, state that you
don't know rather than guessing.
```
::

::code-wrapper{language="markdown" filename="calibrated_output_example.md"}
```markdown
The company was founded in 2014 [HIGH]. Its headquarters moved to Austin
sometime around 2019 [MEDIUM] — I recall this but am not fully certain
of the exact year. I don't have reliable information on its current
employee count [LOW/UNKNOWN] and would recommend checking a current
source rather than relying on my answer for that figure.
```
::

::code-wrapper{language="python" filename="calibration_principle.py"}
```python
# This works because it changes the RESPONSE SHAPE the model is optimizing toward.
# A flat, uniformly confident answer is no longer the only available shape.
# The explicit tagging format gives the model a concrete, low-friction way to
# express graded confidence instead of forcing an all-or-nothing choice.
#
# This is the same principle as Chapter 7: the model produces what the format
# makes EASY to produce. A format with no slot for "I'm not sure" tends to
# produce full confidence even when unwarranted, purely because there's nowhere
# else for the uncertainty to go.
```
::

## Grounding: Requiring Citations to Provided Material

::code-wrapper{language="markdown" filename="grounding_prompt.md"}
```markdown
Answer the question using only the information in the <sources>
provided below. For every factual claim in your answer, include a
citation in the form [source N] pointing to the specific source it came
from. If the sources don't contain enough information to answer fully,
say so explicitly rather than filling the gap from general knowledge.

<sources>
[source 1] {{retrieved document 1}}
[source 2] {{retrieved document 2}}
</sources>

Question: {{user question}}
```
::

::code-wrapper{language="python" filename="grounding_principle.py"}
```python
# This is Chapter 12's RAG pattern, restated as a hallucination mitigation.
# A model asked to FIND AND CITE SUPPORT for each claim behaves very differently
# from one asked to RECALL AND STATE a fact from parametric memory.
#
# The former has a natural check: a claim that can't be traced to a citation is,
# by the task's own rules, out of scope.
# The latter has no equivalent built-in check.
#
# The citation requirement also gives YOU a cheap verification mechanism:
# a human (or automated check) can spot-verify that a cited claim actually
# appears in the referenced source — impossible against an uncited parametric claim.

# GROUNDING IS NOT AIRTIGHT:
# The model can still MISREAD or OVER-GENERALIZE from a real source — citing
# source 2 for a claim source 2 doesn't quite support. A distinct failure mode
# from pure fabrication, worth checking separately. "It cited something" ≠
# "the citation is accurate."
```
::

## Explicitly Permitting "I Don't Know"

::code-wrapper{language="markdown" filename="i_dont_know_permission.md"}
```markdown
It's fine, and expected, for you to not know the answer to some
questions — especially ones about recent events, niche technical
details, or exact figures. Saying "I don't know" or "I'm not sure, but
here's my best guess" is a better answer than a confident-sounding guess
presented as fact. You will not be penalized for expressing uncertainty
or declining to answer.
```
::

::code-wrapper{language="python" filename="why_permission_matters.py"}
```python
# WHY THIS MATTERS: a model's default behavior, absent this permission, skews
# toward attempting a complete, confident-sounding answer. Plausibly because
# training data consists mostly of people writing confidently (Q&A content,
# reference material, technical docs rarely model someone saying "I don't know"
# mid-explanation). A fluent complete-sounding answer is a more statistically
# typical continuation than an honest hedge.
#
# Explicitly telling the model that hedging/declining is acceptable and rewarded
# counteracts that default directly — same way confidence-tagging gives uncertainty
# a concrete place to go rather than a flat "answer or don't" binary.
```
::

## Self-Review for Risky Claims

::code-wrapper{language="markdown" filename="self_review_prompt.md"}
```markdown
Review the answer you just gave. Identify any specific factual claims —
names, dates, statistics, exact quotations, citations — that you are
not highly confident are accurate. List them separately, and for each,
state whether you'd recommend the reader independently verify it before
relying on it.
```
::

::code-wrapper{language="python" filename="self_review_limits.py"}
```python
# This is Chapter 11's self-verification applied specifically to hallucination.
# It inherits the SAME limitation: a model reviewing its own output uses the same
# underlying judgment that produced the (possibly wrong) claim.
#
# It catches genuinely useful cases (the model has latent signal that a particular
# claim was shakier) without being a reliable universal detector.
# Treat "no risky claims found" as WEAK EVIDENCE, not proof of accuracy.
# Especially for claims your eval process (Chapter 19) considers high-stakes.
```
::

## Domain-Specific Risk Table

::code-wrapper{language="markdown" filename="risk_table.md"}
```markdown
| Task type                    | Why risk is elevated                              | Mitigation                                      |
|------------------------------|---------------------------------------------------|-------------------------------------------------|
| Citations / bibliographic    | Exact titles, authors, years are high-precision   | Require retrieval/grounding; never trust        |
|                              | low-redundancy facts                              | unverified generated citations                  |
| Legal case names / statutes  | Same precision problem, high real-world stakes    | Ground in actual legal database; treat any      |
|                              |                                                   | unverified citation as provisional              |
| Version-specific APIs        | Training data mixes library versions; model can   | Ground in current, version-specific docs        |
|                              | blend details across versions that never coexisted| rather than memory                              |
| Numerical statistics         | Exact numbers rarely memorized precisely;         | Require cited source for any number that        |
|                              | plausible-sounding wrong number is common         | matters, or compute via tool (Chapter 13)       |
| Recent events past cutoff    | Information may not exist in training data at all | Explicit "if after your knowledge cutoff, say   |
|                              |                                                   | so" instruction, or retrieval                   |
```
::

## 💡 Tips & Tricks

::code-wrapper{language="python" filename="tips.py"}
```python
# [Debug] When you suspect a hallucinated fact, ask the model directly in a fresh
# turn: "how confident are you in that specific claim, and why?" Sometimes surfaces
# a hedge the original answer didn't include — but not reliably.

# [Idiom] Pair uncertainty-tagging with a short explanation of WHY a claim is
# tagged at a given level, not just the tag alone. The explanation is a useful
# signal to a human reviewer and tends to make the tagging itself more careful.

# [Performance] For any task where factual precision matters, grounding (Chapter 12)
# is a far higher-leverage investment than prompt wording alone. A well-grounded
# prompt with mediocre wording beats a beautifully-worded ungrounded prompt.

# [Idiom] Explicitly separate "creative" and "factual" sections when a task mixes
# both: "write a product description, but the specifications must exactly match
# the provided spec sheet." An unmarked mix is a common source of creative-writing-
# style embellishment applied to the factual part.

# [Safety] Log which claims were grounded (cited) vs ungrounded (parametric) for
# any hallucination-sensitive production feature. Cheap to compute at generation
# time, expensive to reconstruct after the fact if a claim causes a problem.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python" filename="edge_cases.py"}
```python
# [Gotcha] A confidently-worded REFUSAL is not the same as accurate uncertainty
# signal. A model can hedge on a CORRECT answer just as easily as confidently
# state a wrong one. Over-cautious hedging is miscalibrated in the opposite
# direction, with real costs (user ignores a correct answer because it was
# needlessly hedged).

# [Gotcha] Grounding fails silently when retrieved sources themselves are wrong,
# outdated, or irrelevant. A model faithfully citing a real but incorrect source
# produces an answer that looks maximally trustworthy while still being wrong.
# Citation presence ≠ citation quality.

# [Gotcha] Asking "are you sure?" REPEATEDLY can degrade a correct answer into an
# incorrect hedge or reversal. A model pressed hard enough on a genuinely correct
# claim can flip to a wrong one to satisfy apparent pressure. A single clearly-
# scoped self-review is more reliable than repeated adversarial pressure.

# [Gotcha] A model can hallucinate the CITATION FORMAT itself, not just the fact.
# Producing a citation that looks structurally correct (plausible journal name,
# year, page numbers) but points to a source that doesn't exist — more dangerous
# than an obviously-fabricated fact because the surface plausibility invites less
# scrutiny, not more.

# [Gotcha] Uncertainty tags can become a ROTE FORMATTING EXERCISE rather than
# genuine calibration. Watch for a suspiciously uniform distribution (everything
# MEDIUM) as a sign tagging has become habit rather than judgment.
```
::

## 🧠 Spot the Bug

::code-wrapper{language="markdown" filename="spot_the_bug.md"}
```markdown
Answer the user's question. Be accurate and don't make anything up. If
you're not sure, use your best judgment to give the most likely correct
answer anyway, since an incomplete answer is not helpful to the user.

Question: What was the exact vote count in the {{obscure 1970s local
election}}?
```
::

<details>
<summary>Answer</summary>

The instruction directly undermines its own stated goal. "Don't make anything up" is immediately followed by "if you're not sure, give the most likely correct answer anyway" — which is an explicit instruction to **fabricate a plausible-sounding guess** rather than disclose uncertainty, for exactly the category of fact (obscure, low-redundancy, highly specific historical statistic) most likely to be outside reliable parametric memory.

This is the naive "don't hallucinate" instruction made actively WORSE by then explicitly authorizing a confident guess as the fallback. The fix removes the contradiction and replaces "guess anyway" with explicit permission to express uncertainty: "Saying 'I don't have reliable information on this and would be guessing if I gave you a specific number' is a better answer than a confident guess." If precision matters, ground the question in an actual source (archived election record, retrieval tool).

The lesson: an instruction that says "don't hallucinate" but then tells the model to answer confidently anyway when uncertain is not a hallucination mitigation — it's an explicit request for one, dressed up in language that sounds like the opposite.

</details>

## Key Takeaways

::code-wrapper{language="python" filename="key_takeaways.py"}
```python
"""
Handling hallucination & uncertainty.
"""

# 1. Hallucination is an EXPECTED consequence of how LLMs generate text, not a
#    malfunction. Fluency and confidence-sounding are properties of generation,
#    not signals the model tracks about truthfulness. "Just don't hallucinate"
#    is weak — the model can't distinguish confident-recall from plausible-generation.

# 2. Prompting can change BEHAVIOR at the boundary of knowledge (hedging, citing,
#    declining) but CANNOT make parametric knowledge more accurate. Grounding in
#    retrieved sources (Chapter 12) is the strongest lever, not clever wording.

# 3. Give uncertainty a concrete place to go: confidence tagging, citation
#    requirements, plain permission to say "I don't know." A format with no slot
#    for uncertainty tends to produce full confidence even when unwarranted.

# 4. Grounding requires claims traceable to provided sources → checkable by humans
#    and automated groundedness checks. But a faithfully-cited WRONG source still
#    produces a wrong answer. Citation presence ≠ citation quality.

# 5. Precision-heavy, low-redundancy tasks (citations, exact statistics, version-
#    specific APIs, recent events) carry structurally elevated risk regardless of
#    prompt quality. Default to retrieval or tool-based grounding, not parametric recall.
```
::
