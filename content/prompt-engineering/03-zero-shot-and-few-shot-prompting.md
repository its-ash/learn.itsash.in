---
title: "03 — Zero-Shot & Few-Shot Prompting"
description: "Zero-shot classification, few-shot via text vs conversation structure, example selection, ordering effects, diminishing returns, and production patterns — code-first reference for mid-to-senior engineers."
---

# 03 — Zero-Shot & Few-Shot Prompting

No hand-holding. Zero-shot = instructions only, model infers the task from pretraining. Few-shot = demonstrate the task with input/output pairs, model in-fills the pattern. The engineering question is never "which is better" — it's "what does *this* task require, and what will it cost at scale." This chapter shows both, the failure modes that kill production prompts, and the selection/ordering strategy that separates a working few-shot set from a silent misclassifier.

## Zero-Shot Classification with Exact Output Contract

Zero-shot works when the task is common enough that the model has generalized it from pretraining. The only engineering discipline required: an **exact output contract** — the set of valid labels, the format, and the constraint that nothing else is emitted.

::code-wrapper{language="markdown"}
```markdown
Classify the sentiment of this product review.
Valid labels: POSITIVE | NEGATIVE | MIXED
Respond with exactly one label. No explanation, no punctuation, no prose.

Review: "The build quality is fantastic and it feels premium, but the
battery life is genuinely disappointing for the price point."
Label:
```
::

The contract has three parts: (1) a closed enum of labels, (2) "exactly one," (3) "no explanation." Without all three, the model may emit "MIXED — because…" and downstream regex/JSON parsing breaks. The instruction *is* the prompt — zero example tokens spent.

### Production wrapper: system message + structured output

::code-wrapper{language="json"}
```json
{
  "model": "claude-opus-5",
  "max_tokens": 10,
  "system": "You are a sentiment classifier. Valid labels: POSITIVE, NEGATIVE, MIXED. Respond with exactly one label. No other text.",
  "messages": [
    {"role": "user", "content": "The build quality is fantastic but battery life is disappointing."}
  ]
}
```
::

`max_tokens: 10` is a **hard guardrail** — even if the model ignores the instruction and starts explaining, it's truncated before it can pollute a downstream parser. Set token limits to match the output contract, not to some generous default.

## Few-Shot: Text Examples vs Conversation Structure

Two equivalent ways to deliver few-shot examples — same model behavior, different ergonomics.

### Text-based few-shot (single message)

::code-wrapper{language="markdown"}
```markdown
Classify the sentiment of each product review.
Valid labels: POSITIVE | NEGATIVE | MIXED
Respond with exactly one label per review.

Review: "Arrived on time, works exactly as described."
Label: POSITIVE

Review: "Stopped working after two days, and support never responded."
Label: NEGATIVE

Review: "Great screen but the keyboard has dead keys after a month."
Label: MIXED

Review: "The build quality is fantastic and it feels premium, but the
battery life is genuinely disappointing for the price point."
Label:
```
::

All examples and the real input live in one user message. The model sees the pattern as text and in-fills the final `Label:`. Simplest to template, easiest to log as a single string.

### Conversation-structured few-shot (JSON API)

::code-wrapper{language="json"}
```json
{
  "model": "claude-opus-5",
  "max_tokens": 10,
  "system": "Classify sentiment. Valid labels: POSITIVE, NEGATIVE, MIXED. Respond with exactly one label only.",
  "messages": [
    {"role": "user",      "content": "Arrived on time, works exactly as described."},
    {"role": "assistant", "content": "POSITIVE"},
    {"role": "user",      "content": "Stopped working after two days, and support never responded."},
    {"role": "assistant", "content": "NEGATIVE"},
    {"role": "user",      "content": "Great screen but the keyboard has dead keys after a month."},
    {"role": "assistant", "content": "MIXED"},
    {"role": "user",      "content": "The build quality is fantastic and it feels premium, but the battery life is genuinely disappointing for the price point."}
  ]
}
```
::

Each example is a genuine `user`/`assistant` turn. The model sees prior classification *decisions* it made, not just reference text. Use this when: (a) your framework natively speaks messages (LangChain, the SDK), (b) you want the examples to feel like "prior turns in this conversation" rather than "reference material," or (c) you're using a model that weights assistant turns more heavily as behavioral demonstrations.

## The Accidental-Pattern Trap

The most counterintuitive failure in few-shot: **your examples teach a narrower rule than the one you wanted**, because all examples share an *irrelevant* surface feature that the model can't distinguish from the *relevant* pattern.

### Homogeneous examples → wrong generalization

::code-wrapper{language="markdown"}
```markdown
Extract the customer's name and issue from the email.
Respond as JSON: {"name": "...", "issue": "..."}

Email: "Hi, this is John Carter, my order hasn't arrived."
Output: {"name": "John Carter", "issue": "order hasn't arrived"}

Email: "Hello, I'm Priya Nair and my account got locked."
Output: {"name": "Priya Nair", "issue": "account locked"}

Email: "Hey there, my name's Wei Zhang, billing charged me twice."
Output: {"name": "Wei Zhang", "issue": "billed twice"}

Email: "So I've been a customer for 3 years and never had this problem —
the app crashes every time I try to upload a photo. Frustrated,
Alex Kim"
Output:
```
::

**Why it fails:** Every example has the name at the *start* of the email. The model extracts the pattern "name = first thing in the text." The real input puts the name at the *end* (a sign-off — completely realistic in customer emails). A model that over-indexed on the surface pattern has a higher chance of failing here than a *zero-shot* prompt would, because the few-shot set actively taught "name is always first." The examples narrowed the generalization.

**The fix:** Vary the *irrelevant* surface features (where the name appears, sentence length, tone, greeting style) while keeping the *relevant* task (find the name wherever it is) constant.

## Example Selection: Production Example Selector

A production few-shot system doesn't hand-pick examples — it samples from a pool, prioritizing **diversity** across the features that *shouldn't* matter, so the model can't latch onto a spurious correlation.

::code-wrapper{language="python"}
```python
import random
from dataclasses import dataclass

@dataclass
class Example:
    text: str
    output: str
    label: str          # the TRUE classification signal
    surface_tags: list  # irrelevant features: tone, length, position, etc.

# A diverse pool: varies label AND surface features independently
EXAMPLE_POOL = [
    Example("Hi, this is John Carter, my order hasn't arrived.", '{"name":"John Carter","issue":"order not arrived"}', "name_at_start", ["polite", "short"]),
    Example("Frustrated, Alex Kim — app crashes on photo upload.", '{"name":"Alex Kim","issue":"app crash on upload"}',     "name_at_end",   ["frustrated", "medium"]),
    Example("This is Maria Lopez from Acme. Invoice 4421 is wrong.", '{"name":"Maria Lopez","issue":"invoice 4421 incorrect"}', "name_at_start", ["formal", "medium"]),
    Example("Just wanted to say — thanks, but login is broken. — Sam", '{"name":"Sam","issue":"login broken"}', "name_at_end",   ["casual", "short"]),
    Example("I'm David Okafor. Two charges on my card for one order.", '{"name":"David Okafor","issue":"duplicate charge"}',  "name_at_start", ["neutral", "medium"]),
    Example("Order #9912 never came. I'm Yuki Tanaka, a long-time customer.", '{"name":"Yuki Tanaka","issue":"order #9912 not delivered"}', "name_at_end", ["neutral", "long"]),
]

def select_diverse_examples(pool: list[Example], k: int = 3) -> list[Example]:
    """Greedy max-coverage: pick examples that maximize surface-feature diversity.
    Ensures the model sees name_at_start AND name_at_end, polite AND frustrated,
    short AND long — so no single surface feature correlates with the task."""
    selected: list[Example] = []
    covered_tags: set = set()
    # First pass: guarantee label coverage (at least one of each structural type)
    seen_labels: set = set()
    for ex in pool:
        if ex.label not in seen_labels:
            selected.append(ex)
            seen_labels.add(ex.label)
            covered_tags.update(ex.surface_tags)
    # Remaining picks: greedily maximize NEW surface tags
    remaining = [e for e in pool if e not in selected]
    while len(selected) < k and remaining:
        remaining.sort(key=lambda e: len(set(e.surface_tags) - covered_tags), reverse=True)
        best = remaining.pop(0)
        selected.append(best)
        covered_tags.update(best.surface_tags)
    return selected[:k]

def build_few_shot_prompt(task_input: str, examples: list[Example]) -> str:
    """Assemble the prompt with selected examples + real input."""
    header = 'Extract the customer\'s name and issue. Respond as JSON: {"name":"...","issue":"..."}\n'
    body = ""
    for ex in examples:
        body += f'\nEmail: "{ex.text}"\nOutput: {ex.output}\n'
    body += f'\nEmail: "{task_input}"\nOutput:'
    return header + body

# Usage: fresh diverse selection per request (or cache per session)
selected = select_diverse_examples(EXAMPLE_POOL, k=3)
prompt = build_few_shot_prompt("The dashboard won't load. Regards, Fatima", selected)
print(prompt)
```
::

The selector guarantees **label coverage** (at least one `name_at_start` and one `name_at_end`) then greedily maximizes **surface-feature diversity** (tone, length, formality). The model now sees that the name can appear *anywhere* — the spurious "name is always first" pattern is impossible to form.

## Example Ordering: Shuffling to Avoid Positional Bias

The example **closest to the real input** has outsized influence (recency effect). If examples are sorted or patterned, the model can pick up on *positional* patterns instead of *content* patterns.

::code-wrapper{language="python"}
```python
import random

def order_examples(examples: list[Example], strategy: str = "shuffle_hard_last") -> list[Example]:
    """Order examples to avoid positional bias.
    
    Strategies:
      'shuffle'           — random order; no positional correlation with labels
      'shuffle_hard_last' — shuffle, but place the trickiest example last
                            (closest to real input → maximum recency influence)
      'interleave'        — alternate labels so no two adjacent share a label
    """
    if strategy == "shuffle":
        shuffled = examples[:]
        random.shuffle(shuffled)
        return shuffled
    
    if strategy == "shuffle_hard_last":
        # Hardest = most surface features that could mislead (most surface_tags)
        ranked = sorted(examples, key=lambda e: len(e.surface_tags))
        hardest = ranked[-1]
        rest = [e for e in examples if e is not hardest]
        random.shuffle(rest)
        return rest + [hardest]
    
    if strategy == "interleave":
        # Sort by label, then deal into alternating slots
        by_label: dict = {}
        for ex in examples:
            by_label.setdefault(ex.label, []).append(ex)
        interleaved: list = []
        max_len = max(len(v) for v in by_label.values())
        for i in range(max_len):
            for label in by_label:
                if i < len(by_label[label]):
                    interleaved.append(by_label[label][i])
        return interleaved
    
    return examples

# Production: re-shuffle per request so a fixed order can't become a pattern
ordered = order_examples(selected, strategy="shuffle_hard_last")
prompt = build_few_shot_prompt("Dashboard won't load. Regards, Fatima", ordered)
```
::

**Why `shuffle_hard_last`:** The recency effect means the last example is weighted heaviest. Placing the *hardest* (most surface-feature-rich, most likely to mislead) example last ensures the model's freshest reference is the one that best demonstrates "ignore surface features, focus on the task." Placing the *easiest* example last teaches the model that inputs are always easy.

## Diminishing Returns: Example Count vs Effect

The jump from 0→2 examples is steep. Past ~5, returns flatten — and can *decline* if added examples are homogeneous or introduce noise.

| Examples | Typical Effect | When to Use |
|---|---|---|
| 0 | Baseline. Sufficient for common, well-specified tasks (sentiment, summarization, translation). | Default starting point. Always test here first. |
| 1 | Meaningful jump — establishes format + register. **Risk:** with one example, the model can't distinguish "general rule" from "incidental detail." | Only if the task is dead simple (format-only). |
| 2–5 | Sweet spot for most classification/extraction/formatting. Enough variation to show the pattern without bloating tokens. | Majority of production few-shot prompts. |
| 5–20 | Helpful for many-category tasks or tasks with many distinct edge cases. Diminishing returns per example. | Multi-label classification, complex extraction schemas. |
| 20+ | Rarely worth it in-context. Token cost dominates. If you need this many, consider retrieval (RAG), a lookup table, or fine-tuning. | Almost never in-context. Move to RAG or fine-tune. |

**The steepest jump is always 0 → 1–2.** Past five well-chosen diverse examples, spend effort improving *which* examples you include, not adding more.

## Anti-Pattern: Homogeneous Examples Failing on Low Input

A team classifies support tickets by urgency (LOW, MEDIUM, HIGH). All three examples are from a single outage — all HIGH, all contain "urgent":

::code-wrapper{language="markdown"}
```markdown
Classify the urgency of the ticket as LOW, MEDIUM, or HIGH.

Ticket: "URGENT — the entire dashboard is down for our whole team, please help ASAP"
Urgency: HIGH

Ticket: "This is urgent, we can't process any orders right now"
Urgency: HIGH

Ticket: "Urgent!! Nothing is loading, this is a total outage on our end"
Urgency: HIGH

Ticket: "Not sure if this matters, but the export button seems to download
a file with the wrong date format — not blocking us, just noticed it"
Urgency:
```
::

**What goes wrong:** Zero label diversity — the model has never seen a LOW or MEDIUM example. It can only infer urgency by matching lexical surface features ("urgent," exclamation marks, emphatic tone) that co-occurred with HIGH in this sample. The real ticket is a textbook LOW (non-blocking, minor, polite) — but because the model learned "emphatic = HIGH" and has no concept of what LOW looks like, it classifies LOW inputs as MEDIUM or HIGH.

**The fix:** Cover the output space (at least one LOW, one MEDIUM, one HIGH) and decouple surface features from labels (a polite ticket that's HIGH, an emphatic ticket that's LOW):

::code-wrapper{language="markdown"}
```markdown
Classify the urgency of the ticket as LOW, MEDIUM, or HIGH.
Consider business impact and blocking scope, not tone or punctuation.

Ticket: "URGENT — the entire dashboard is down for our whole team, please help ASAP"
Urgency: HIGH

Ticket: "Not sure if this matters, but the export button downloads a file
with the wrong date format — not blocking us, just noticed it"
Urgency: LOW

Ticket: "We can't process any orders right now, this is costing us revenue"
Urgency: MEDIUM

Ticket: "Hey folks, just a heads up — the export button seems to download
a file with the wrong date format — not blocking us, just noticed it"
Urgency:
```
::

Now the model sees: HIGH can be emphatic, LOW can be polite, MEDIUM is about revenue impact. The real input (polite, non-blocking) maps clearly to LOW because the examples decoupled tone from urgency.

## Production Few-Shot: Email Extraction with Varied Examples

A complete, production-grade few-shot prompt for extracting structured data from customer emails — varied across name position, tone, length, issue type, and includes an out-of-scope example:

::code-wrapper{language="markdown"}
```markdown
Extract the customer's name and issue from the email.
Respond as JSON: {"name": "...", "issue": "..."}
If no name is present, use null. If the email is not a support request, respond: {"name": null, "issue": null}

Email: "Hi, this is John Carter, my order #1234 hasn't arrived."
Output: {"name": "John Carter", "issue": "order #1234 not arrived"}

Email: "So I've been a customer for 3 years and never had this problem —
the app crashes every time I try to upload a photo. Frustrated, Alex Kim"
Output: {"name": "Alex Kim", "issue": "app crashes on photo upload"}

Email: "Just wanted to say thanks for the quick refund! — Sam Patel"
Output: {"name": null, "issue": null}

Email: "This is Maria Lopez from Acme Corp. Invoice 4421 has the wrong
billing address — we need it corrected before our monthly close."
Output: {"name": "Maria Lopez", "issue": "invoice 4421 wrong billing address"}

Email: "login is broken. — yuki"
Output: {"name": "yuki", "issue": "login broken"}

Email: "Hey team, quick question — is there a way to export our team's
usage data to CSV? Not urgent, just exploring. Thanks!"
Output:
```
::

Variation coverage in this set:
- **Name position**: start (John, Maria), end (Alex, Yuki), absent (Sam's thank-you, the CSV question)
- **Tone**: polite (John), frustrated (Alex), formal (Maria), terse (Yuki), casual (CSV question)
- **Length**: short (Yuki), medium (John), long (Alex, Maria)
- **Issue type**: delivery (John), bug (Alex), billing (Maria), auth (Yuki)
- **Out-of-scope**: thank-you (Sam) and feature request (CSV question) → both return `null`, teaching the model to reject non-support emails rather than force-fitting

## 💡 Tips & Tricks

::code-wrapper{language="python"}
```python
# **Debug**: Log the exact prompt (system + examples + input) for EVERY request.
# When output is wrong, you can't fix what you can't reproduce.
import json, hashlib

def log_prompt(system: str, examples: list, user_input: str, output: str) -> str:
    """Hash-stable prompt log for debugging few-shot failures."""
    entry = {
        "system": system,
        "examples": [e.output for e in examples],   # just the outputs for compactness
        "example_order": [e.label for e in examples], # track WHICH examples + order
        "input": user_input,
        "output": output,
        "prompt_hash": hashlib.sha256(
            (system + str(examples) + user_input).encode()
        ).hexdigest()[:12],
    }
    # In production: write to structured log (JSONL), queryable by prompt_hash
    return json.dumps(entry, indent=2)
```
::

::code-wrapper{language="python"}
```python
# **Cost**: Few-shot examples cost tokens on EVERY request — they scale with volume.
# A system prompt improvement is a one-time cost. Always tighten instructions first.
# 
# Example: 5 examples × 120 tokens = 600 tokens/request.
# At 10K requests/day: 6M tokens/day spent on examples alone.
# If a tighter zero-shot instruction achieves the same accuracy: 0 tokens/day on examples.
#
# Measure: log (prompt_tokens, completion_tokens) per request, aggregate by task type.
# If example tokens > 40% of prompt_tokens, audit whether examples are earning their cost.
```
::

::code-wrapper{language="python"}
```python
# **Idiom**: Start at zero-shot. ALWAYS. Even if you're "sure" you need few-shot.
# Write the zero-shot version, test on 50+ real inputs, measure failure rate.
# Only add examples for SPECIFIC observed failures — not hypothetical ones.
# This is the single highest-leverage discipline in prompt engineering.

ZERO_SHOT_SYSTEM = (
    "Extract the customer's name and issue from the email. "
    'Respond as JSON: {"name": "...", "issue": "..."}. '
    "If no name is present, use null. "
    "If the email is not a support request, respond: "
    '{"name": null, "issue": null}'
)
# Test this FIRST. If accuracy > 95% on your eval set, you're done. No examples needed.
```
::

::code-wrapper{language="python"}
```python
# **Maintenance**: Stale examples silently rot. If your product adds a new category
# or edge case and your few-shot set doesn't reflect it, the prompt steers the model
# toward outdated behavior. Version your prompt + example set together.
# 
# Production pattern: store examples in a versioned config, not hardcoded in the prompt:
EXAMPLE_SET_VERSION = "2026-09-10-v3"  # bump when examples change
# Log this with every request → when accuracy drops, you can correlate to a version change.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python"}
```python
# **Safety**: A single example can be worse than zero examples.
# With N=1, the model can't distinguish "general rule" from "incidental detail."
# Every surface feature of that one example (tone, length, phrasing) is
# indistinguishable from the task pattern.
# 
# If you can only afford one example: make it maximally representative (average
# length, neutral tone, common case) — or skip it and use a clearer zero-shot
# instruction instead. N=1 is the most dangerous few-shot configuration.
```
::

::code-wrapper{language="python"}
```python
# **Safety**: Few-shot doesn't reliably teach counting or exact quantities.
# Showing 3 examples of "extract the top 2 keywords" doesn't teach "always exactly 2."
# The model extracts "produce a short list" not "produce the integer 2."
# 
# Fix: state the number explicitly in the instruction, don't rely on examples to imply it.
INSTRUCTION = "Extract exactly 2 keywords from the text. Respond as a JSON array of exactly 2 strings."
# The examples reinforce format; the instruction enforces the count.
```
::

::code-wrapper{language="python"}
```python
# **Portability**: Fake assistant-turn examples must not contain meta-text.
# If you copy-pasted a real model response as your example, it may contain
# conversational wrappers: "Sure, here's the answer:" or "Let me classify that for you:"
# The model learns to reproduce the WRAPPER as part of the desired output.
# 
# BAD assistant turn:
#   {"role": "assistant", "content": "Sure! Here's the classification: POSITIVE"}
# GOOD assistant turn:
#   {"role": "assistant", "content": "POSITIVE"}
# 
# Always strip artifacts of HOW you produced the example. The assistant turn
# should contain ONLY the desired output, nothing else.
```
::

::code-wrapper{language="python"}
```python
# **Portability**: Very long individual examples dominate attention by length,
# not by relevance. If one example includes a lengthy input document, it consumes
# a disproportionate fraction of the prompt's effective attention budget.
# 
# Rule of thumb: keep example input lengths within 2x of each other.
# If you need a long-document example, consider retrieval (RAG) instead of in-context few-shot.
```
::

::code-wrapper{language="python"}
```python
# **Safety**: Few-shot examples that are all correct hide boundary behavior.
# If none of your examples show what an INVALID or out-of-scope input produces,
# the model has no guidance for rejecting non-matching inputs — it force-fits
# to the closest category instead of flagging the mismatch.
# 
# Fix: include at least one out-of-scope example that demonstrates rejection:
#   Email: "Thanks for the great service!" -> Output: {"name": null, "issue": null}
# This teaches: "not every input is a valid input — return null when it doesn't fit."
```
::

## 🧠 Spot the Bug

A team builds this few-shot prompt for ticket classification:

::code-wrapper{language="markdown"}
```markdown
Classify the urgency of the ticket as LOW, MEDIUM, or HIGH.

Ticket: "URGENT — the entire dashboard is down for our whole team, please help ASAP"
Urgency: HIGH

Ticket: "This is urgent, we can't process any orders right now"
Urgency: HIGH

Ticket: "Urgent!! Nothing is loading, this is a total outage on our end"
Urgency: HIGH

Ticket: "Not sure if this matters, but the export button seems to download
a file with the wrong date format — not blocking us, just noticed it"
Urgency:
```
::

In production, the model reliably classifies clearly low-urgency tickets as MEDIUM or HIGH — especially if the ticket text includes emphatic punctuation or the word "please." What went wrong?

<details>
<summary>Answer</summary>

Two compounding problems:

1. **Zero label diversity.** All three examples are HIGH. The model has never seen what LOW or MEDIUM looks like — it can only infer urgency by pattern-matching lexical surface features ("urgent," exclamation marks, emphatic tone) that co-occurred with HIGH in this sample. It learned "emphatic = HIGH" because tone and impact were perfectly correlated in every example.

2. **Incidental surface correlation.** All examples came from a single outage event, so they share emphatic tone, exclamation marks, and vocabulary — none of which is the *real* classification signal (business impact, blocking scope). The model has no way to learn that urgency is about *impact*, not *tone*, because tone and impact were identical in every example.

**Fix:** Include at least one LOW and one MEDIUM example. Decouple surface features from labels — a polite ticket that's HIGH, an emphatic ticket that's LOW. The real ticket (polite, non-blocking, minor) should map unambiguously to LOW because the examples teach "impact matters, tone doesn't."

</details>

## Key Takeaways

::code-wrapper{language="python"}
```python
# Zero-shot is the default. Always test here first.
# Few-shot earns its cost only when: format is hard to describe, edge cases need
# pinning, or zero-shot output is inconsistent across similar inputs.
#
# The diminishing-returns curve: 0->2 examples is the steep jump. Past ~5 diverse
# examples, spend effort on WHICH examples, not HOW MANY.
#
# Example selection > example count:
#   - Cover the output space (at least one of each label)
#   - Vary irrelevant surface features (tone, length, position) so the model
#     can't latch onto spurious correlations
#   - Include out-of-scope examples to teach rejection, not just classification
#
# Example ordering matters:
#   - The last example (closest to real input) has outsized influence (recency)
#   - Place your hardest/most representative example last
#   - Shuffle to avoid positional patterns the model could exploit
#
# Cost discipline:
#   - Examples scale with volume (tokens per request x request count)
#   - Tighten instructions first; add examples only when instruction-tuning plateaus
#   - Version your example set; stale examples silently rot and steer toward
#     outdated behavior
#
# The accidental-pattern trap:
#   - Homogeneous examples teach a NARROWER rule than the task requires
#   - N=1 is the most dangerous configuration (can't separate signal from noise)
#   - A bad few-shot set can perform WORSE than zero-shot — always benchmark both
```
::