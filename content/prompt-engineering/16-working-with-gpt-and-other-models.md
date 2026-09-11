---
title: "16 — Working with GPT & Other Models"
description: "Prompt portability across model families — OpenAI conventions, reasoning-optimized models, open-weight chat templates, graceful degradation patterns, and migration testing. Code-first reference for mid-to-senior engineers."
---

# 16 — Working with GPT & Other Models

## The Portability Problem

::code-wrapper{language="python" filename="portability_problem.py"}
```python
# An identical prompt string is NOT an identical instruction across model families.
# Instruction-following style, formatting conventions, and how literally a constraint
# is honored all vary meaningfully across model families.

# A prompt engineered and tuned against one model is NOT guaranteed to perform the
# same way on another, even when both are "highly capable." Treating a prompt as
# portable-by-default without re-validation is a common cause of silent degradation
# after a model swap or upgrade.

# WHAT TRANSFERS CLEANLY (model-agnostic fundamentals):
#   - clarity, specificity, explicit constraints (Chapter 4)
#   - structural decomposition (Chapter 10)
#   - role separation (Chapter 2)
#   - structured output schemas (Chapter 7)

# WHAT NEEDS RE-TUNING PER FAMILY:
#   - formatting conventions (XML tags, markdown defaults)
#   - system-message weighting / instruction hierarchy
#   - reasoning-elicitation phrasing (CoT vs. let-the-model-reason-internally)
#   - refusal/caution thresholds
#   - verbosity defaults
```
::

## OpenAI Conventions

::code-wrapper{language="python" filename="openai_conventions.py"}
```python
# MESSAGE ROLES carry different weight than Claude's system-priority model.
# OpenAI has evolved toward more granular instruction hierarchy:
#   - platform-level instructions (highest)
#   - developer-level instructions
#   - user-level instructions
# This is actively evolving — check current OpenAI docs for the specific
# role/priority model of the API version you're targeting.

# MARKDOWN is well-respected, but default formatting tendency (heavier vs lighter
# use of bullets/headers/bold) shifts across model versions. If your app parses
# or displays output in a way sensitive to formatting, specify the desired format
# explicitly rather than relying on a version's current default.

# REASONING-OPTIMIZED MODELS (o1, o3, etc.) often need LESS explicit CoT prompting
# — and sometimes actively DISCOURAGE it. The model's built-in reasoning process can
# be HINDERED by a prompt trying to over-specify reasoning steps. This is a meaningful
# contrast with standard chat models where Chapter 5's explicit CoT techniques help.

# RULE: check model-specific guidance before assuming either
# "add explicit reasoning steps" or "keep it simple and let it reason" is right.
```
::

::code-wrapper{language="markdown" filename="openai_format_control.md"}
```markdown
Respond in plain prose only. Do not use markdown formatting — no bullet
points, no headers, no bold text, no numbered lists — even if the content
would normally lend itself to a list.
```
::

## Portability Example: Structured Extraction

::code-wrapper{language="markdown" filename="portable_vs_nonportable.md"}
```markdown
<!-- Claude-optimized prompt using XML tags — works on most models but
     reliability of the JSON output specifically varies by family -->
<email>
{{raw email text}}
</email>

<task>
Extract the sender's requested action, deadline (if any), and urgency
level (low/medium/high) as JSON.
</task>
```
::

::code-wrapper{language="python" filename="portable_structured_output.py"}
```python
import json

# MORE PORTABLE: use each provider's NATIVE structured-output mechanism
# rather than relying purely on prompted formatting instructions.
# The SHAPE GUARANTEE transfers even when prose-level instruction nuances don't.

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "requested_action": {"type": "string"},
        "deadline": {"type": ["string", "null"]},
        "urgency": {"type": "string", "enum": ["low", "medium", "high"]},
    },
    "required": ["requested_action", "deadline", "urgency"],
}

# Provider-specific invocation (parameter names differ — check current docs):
# Claude: output_config={"format": {"type": "json_schema", "schema": EXTRACTION_SCHEMA}}
# OpenAI: response_format={"type": "json_schema", "json_schema": {"schema": EXTRACTION_SCHEMA}}
#
# The conceptual point that transfers everywhere: prefer letting the API constrain
# generation over prompting-and-hoping whenever the feature is available.
```
::

## Open-Weight Models and Chat Templates

::code-wrapper{language="markdown" filename="chat_template.md"}
```markdown
<!-- WRONG: informal, ignores the model's expected chat template -->
Hey, can you summarize this: {{document}}

<!-- RIGHT: matches the model's documented chat template exactly.
     In practice, this is handled by the serving framework (transformers, vLLM,
     llama.cpp) automatically. The actionable takeaway: confirm your tooling is
     applying the CORRECT template for the specific model checkpoint. -->
<s>[INST] Summarize the following document.

{{document}} [/INST]
```
::

::code-wrapper{language="python" filename="open_weight_tips.py"}
```python
# Open-weight models (Llama, Mistral, etc.) are OFTEN MORE SENSITIVE to exact
# prompt template formatting than large hosted-API models. Many were instruction-tuned
# against a VERY SPECIFIC chat template (particular special tokens or role markers).
# Deviating from that exact template — even in ways a hosted model tolerates — can
# measurably degrade output quality.

# In practice, the templating is handled by the serving framework:
#   - Hugging Face transformers: applies the correct chat template automatically
#   - vLLM: same
#   - llama.cpp: same
# The actionable takeaway: CONFIRM your tooling applies the correct template.

# Smaller models also generally benefit MORE from explicit few-shot examples (Chapter 3).
# The zero-shot instruction-following gap between a frontier model and a smaller
# open-weight one is often exactly the gap that 1-2 good examples closes.
```
::

## Graceful Degradation Across Models

::code-wrapper{language="python" filename="graceful_degradation.py"}
```python
# Full portability isn't realistic. The practical goal: degrade GRACEFULLY,
# not catastrophically, when run against a different model than tuned for.

GRACEFUL_DEGRADATION_PRINCIPLES = {
    "explicit_constraints": "State length, tone, format plainly — don't rely on a model's default tendency",
    "native_structured_output": "Prefer API-enforced schemas over prompted formatting when >1 model family",
    "separable_cot": "Keep 'think step by step' as a clearly isolated, removable block — trivial to strip for reasoning-optimized models",
    "eval_set_before_migration": "Build the eval set (Chapter 19) BEFORE you need it — the most reliable way to know if a prompt survived a swap",
}

# ANTI-PATTERN: forking the entire prompt per model
# PRODUCTION: maintain one shared "core task" block + small per-model wrapper sections
# for formatting/role conventions. Keeps the actual task logic in one place to update.

SHARED_CORE = """
Classify the support ticket into BILLING, BUG_REPORT, FEATURE_REQUEST,
ACCOUNT_ACCESS, or OTHER. Reply with only the category label.
"""

# Per-model wrapper (tiny — only what differs):
CLAUDE_WRAPPER = {"system": f"You are a ticket triage assistant.\n\n{SHARED_CORE}"}
GPT_WRAPPER = {"system": SHARED_CORE}  # GPT may not need the persona wrapper
OPEN_WEIGHT_WRAPPER = {
    "system": f"You are a ticket triage assistant. {SHARED_CORE}\n\nExamples:\nTicket: 'charged twice' → BILLING\nTicket: 'app crashes' → BUG_REPORT",
    # Open-weight benefits more from few-shot examples (Chapter 3)
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="python" filename="tips.py"}
```python
# [Portability] When a prompt runs against multiple model families (fallback,
# A/B test, multi-model router), maintain one shared "core task" block + small
# per-model wrapper sections for formatting/role conventions. Don't fork the
# entire prompt per model.

# [Debug] If a prompt that worked well suddenly degrades after a routine model
# version upgrade (even within the same family), suspect a shifted default behavior
# (verbosity, refusal threshold, formatting) before suspecting your own prompt.
# Providers change defaults between versions without it being a "breaking change."

# [Idiom] For reasoning-optimized models, try the simplest possible direct prompt
# FIRST and only add explicit reasoning scaffolding if you can show empirically
# it improves eval-set results. "More structure is always at least neutral" does
# NOT hold for this model category.

# [Performance] When working with a smaller/open-weight model, invest evaluation
# effort in confirming the chat template is applied correctly BEFORE concluding
# the model itself is the limiting factor. Many "this small model is just bad at
# instruction-following" reports trace to a template mismatch, not a capability gap.

# [Idiom] Keep a small "model assumptions" note alongside any production prompt:
# which model/version it was tuned against, what native features it relies on.
# This turns a future model migration into a checklist instead of archaeology.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python" filename="edge_cases.py"}
```python
# [Safety] A prompt relying on implicit system-prompt priority can fail silently on
# an API using a different instruction hierarchy. A security-relevant constraint
# should NEVER depend solely on message-role placement across an unverified provider.

# [Gotcha] Refusal-threshold differences can look like a regression when they're a
# policy difference. A legitimate request one model handles and another declines is
# not necessarily a prompting bug — sometimes it reflects a different safety threshold.
# The right response is adjusting the request's framing, not engineering around a guardrail.

# [Gotcha] JSON-mode guarantees differ across providers: schema-validated vs merely
# JSON-syntax-valid vs best-effort. Treating them as interchangeable without checking
# is a common source of "schema validation started failing after we switched providers."

# [Gotcha] A model swap can silently change token-counting behavior. Different
# tokenizers segment the same text differently — a prompt that fit under one model's
# context limit is NOT guaranteed to fit under a similar-sized limit on another.

# [Gotcha] "It works when I test it manually" is NOT evidence of portability. Manual
# spot-checking during a migration reliably misses the specific edge cases where
# behavior actually diverges. This is the gap the eval-set approach (Chapter 19) closes.
```
::

## 🧠 Spot the Bug

A support-ticket triage prompt tuned on one model family is ported unchanged to a second provider: "You are a ticket triage assistant. Categorize the ticket and return JSON: {\"category\": \"...\", \"priority\": \"...\"}. Think through your reasoning step by step before giving the final JSON." After the switch, responses increasingly fail to parse as JSON — the model includes reasoning text before the JSON, sometimes with the object embedded mid-paragraph. What changed?

<details>
<summary>Answer</summary>

Two portability assumptions failed at once:

1. **"Think step by step" + a request for clean isolated JSON** works on some models but is exactly the interaction the new model family may handle differently — its default behavior interleaves reasoning and answer more freely, so the reasoning text sits next to (or wrapped around) the JSON instead of cleanly preceding it.

2. **The original prompt relied on *prompted* JSON formatting** rather than any provider-native structured-output guarantee. That reliability gap was already a portability risk — switching providers is exactly the event that exposes it.

The robust fix: use the new provider's native structured-output/JSON-schema feature so the final answer's shape is enforced by the API, and if step-by-step reasoning is still wanted, request it in a clearly separate, explicitly delimited section (or via the provider's dedicated reasoning mechanism) rather than trusting "think step by step, then give JSON" parses the same way across families.

The lesson: an identical prompt string is not an identical instruction across model families — reasoning-elicitation phrasing and prompted-only formatting are the two things most likely to break silently on a model swap.

</details>

## Key Takeaways

::code-wrapper{language="python" filename="key_takeaways.py"}
```python
"""
Working with GPT & other models — portability and graceful degradation.
"""

# 1. Prompt portability is PARTIAL, not automatic. Model-agnostic fundamentals
#    (clarity, structure, decomposition) transfer well; formatting conventions,
#    system-message priority, and reasoning phrasing often do NOT.

# 2. OpenAI: evolving instruction hierarchy (beyond flat system/user), reasoning-
#    optimized models that often perform better with SIMPLER prompts, not heavier
#    CoT scaffolding. Check model-specific guidance.

# 3. Prefer provider-native structured-output mechanisms over prompted formatting
#    whenever a prompt might run against >1 model family. The enforced-shape
#    guarantee transfers far better than prompted formatting reliability.

# 4. Open-weight/smaller models: more sensitive to exact chat-template formatting,
#    benefit MORE from few-shot examples. Confirm your serving stack applies the
#    correct template before concluding a model lacks capability.

# 5. The only reliable way to know if a prompt survived a model migration is
#    eval-set regression testing (Chapter 19) built BEFORE the migration —
#    not manual spot-checking during or after it.
```
::
