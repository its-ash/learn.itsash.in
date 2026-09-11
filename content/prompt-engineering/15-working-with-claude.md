---
title: "15 — Working with Claude"
description: "Claude-specific conventions — system prompt structure, XML tags for input delimiting, extended thinking mode, literal instruction-following, and pushback encouragement. Code-first reference for mid-to-senior engineers."
---

# 15 — Working with Claude

## System Prompt Structure

::code-wrapper{language="markdown" filename="claude_system_prompt.md"}
```markdown
You are a technical support assistant for a home networking equipment
company.

## Your role
Help customers diagnose and resolve connectivity issues with their
routers and mesh systems. You have access to a knowledge base search
tool and a device-diagnostics tool.

## Tone
Patient, plain-language, no jargon unless the customer uses it first.
Assume the customer is not technical unless they demonstrate otherwise.

## Constraints
- Never ask for or record a customer's Wi-Fi password.
- If a fix requires a factory reset, warn the customer this erases their
  saved settings before proceeding.
- If the issue appears to be a hardware fault, direct the customer to
  the returns process rather than attempting further troubleshooting.
```
::

::code-wrapper{language="python" filename="claude_system_structure.py"}
```python
# Claude models treat the system prompt as a DISTINCT, HIGH-PRIORITY channel.
# Instructions there are weighted more heavily and held more consistently across
# a long conversation than the same instruction placed in the first user turn.

# Anthropic's own guidance: structure a Claude system prompt with clearly
# delineated sections (headers) rather than one undifferentiated paragraph.
# This is Chapter 2's anatomy-of-a-prompt (role, context, task, constraints)
# rendered as explicit headers — Claude responds well to visibly segmented structure.

# The segmentation also makes the system prompt easier for a HUMAN to review and
# maintain, which matters as much in practice as the model-facing effect.
```
::

## XML Tags for Structuring Input

::code-wrapper{language="markdown" filename="claude_xml_tags.md"}
```markdown
<document>
{{full text of the contract}}
</document>

<instructions>
Review the document above for any clause that obligates the company to
exclusive dealing with a single supplier. Quote the exact clause text if
found.
</instructions>

<output_format>
Respond with either "No exclusivity clause found" or a direct quote of
the relevant clause, followed by its section number.
</output_format>
```
::

::code-wrapper{language="python" filename="xml_tags_explained.py"}
```python
# The SINGLE most distinctive Claude-specific convention: heavy use of XML tags
# to delimit sections — document content, examples, instructions, expected output.

# Claude was extensively trained on XML-tagged data of this shape, making it
# UNUSUALLY RELIABLE at respecting tag boundaries. Referring back to "the document"
# later in a long prompt reliably resolves to the content inside <document> tags,
# rather than getting confused with instruction text nearby.

# This matters MOST where Chapter 8's context-management concerns are sharpest:
# long prompts mixing reference material, instructions, and examples benefit
# disproportionately from tags that make the boundary between "content to act on"
# and "instructions about how to act" unambiguous.

# Tag names are NOT a fixed vocabulary. <document>, <instructions>, <examples>,
# <output_format>, <thinking> are common, but a well-named custom tag works as
# well: <customer_email>, <previous_turn_summary>, <untrusted_content>

# ANTI-PATTERN: over-tagging a short prompt
# A two-sentence request wrapped in five nested XML tags is harder for a human
# to review and doesn't help the model, which handles short unambiguous prompts
# fine without scaffolding. Reserve heavy tagging for long/complex prompts.
```
::

## Extended Thinking

::code-wrapper{language="python" filename="claude_extended_thinking.py"}
```python
from anthropic import Anthropic

client = Anthropic()

# Extended thinking is a DEDICATED reasoning phase with its own token budget,
# distinct from prompted CoT (Chapter 5). The model reasons in a separate channel
# BEFORE producing its user-facing answer.

response = client.messages.create(
    model="claude-opus-5",
    max_tokens=4096,
    thinking={
        "type": "enabled",
        "budget_tokens": 2048,  # the model uses up to 2048 tokens for reasoning
    },
    messages=[{
        "role": "user",
        "content": "Given these three vendor contracts, which has the most "
                   "unfavorable termination clause, and why?",
    }],
)

# Response contains SEPARATE blocks:
thinking_block = next(b for b in response.content if b.type == "thinking")
answer_block = next(b for b in response.content if b.type == "text")

# Practical difference from prompted CoT:
# - Extended thinking has its OWN allocated budget, not "more tokens in the same response"
# - More effective for genuinely hard multi-step problems without hand-crafted "think step by step"
# - The model was specifically TRAINED to use this budget well
# - Does NOT replace earlier techniques wholesale: for tasks needing a SPECIFIC reasoning
#   structure (Chapter 5's worked examples, Chapter 11's verification), explicitly prompt
#   that structure — even alongside extended thinking
# - Extended thinking raises the CEILING on unaided reasoning; it doesn't substitute for
#   telling the model HOW to reason when you know a specific approach works better
```
::

## Literal Instruction-Following

::code-wrapper{language="python" filename="claude_literalness.py"}
```python
# Claude tends to follow instructions quite LITERALLY — including instructions a
# human would read as implicitly negotiable. This cuts both ways:

# ADVANTAGE: a precisely-worded constraint is unusually reliable
GOOD_CONSTRAINT = """
Never include a call-to-action, sign-off, or closing pleasantry in your
response. End immediately after the last substantive sentence.
"""
# Claude follows this exactly. A vaguer instruction ("keep it brief") leaves
# more room for the model's own judgment about what counts as "brief."

# DANGER: an overly narrow or poorly-scoped instruction produces exactly the
# narrow, poorly-scoped behavior you asked for, not what you intended
BAD_CONSTRAINT = "Never use the word 'error'"
# Taken literally → awkward circumlocutions: "the operation did not complete as expected"
# State the INTENT behind the constraint, not just the constraint itself.

# WHEN A LITERAL READING COULD GO SOMEWHERE YOU DON'T WANT:
# Instead of: "Never use the word 'error'"
# Use: "Describe failures in user-friendly terms. Instead of 'error', use phrases
# like 'something went wrong' or 'this action couldn't be completed.'"
```
::

## Encouraging Pushback

::code-wrapper{language="markdown" filename="claude_pushback.md"}
```markdown
If any part of this task seems ambiguous, based on a mistaken premise,
or likely to produce a worse outcome than an alternative approach, say
so explicitly before proceeding rather than making a silent assumption
and continuing.
```
::

::code-wrapper{language="python" filename="pushback_rationale.py"}
```python
# Claude models are trained to be willing to disagree, flag concerns, or decline
# a request outright when something in the prompt seems mistaken, harmful, or
# underspecified. Prompting that EXPLICITLY INVITES this surfaces more of it.

# A system prompt that only asks for compliance ("complete the following task")
# implicitly DISCOURAGES the model from raising a concern, even when it has one —
# raising it wasn't modeled as an acceptable response shape.

# Explicitly authorizing pushback measurably changes how often a model exercises it.
# This connects directly to Chapter 11's honest uncertainty reporting.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="python" filename="tips.py"}
```python
# [Idiom] Use closing tags that echo the opening tag name exactly
# (<document>...</document>, NOT <document>...</end>). Mismatched or vague
# closing tags are more likely to be misread as content rather than structure.

# [Structure] When a prompt needs the model to reference multiple distinct pieces
# of content, give each its own uniquely-named tag (<document_1>, <document_2>)
# rather than repeating a generic tag. This lets you unambiguously ask
# "compare <document_1> and <document_2>" later in the same prompt.

# [Debug] If a Claude response ignores a constraint you're sure you wrote clearly,
# check whether it's buried in the middle of a long undifferentiated system prompt
# rather than its own clearly labeled section. Literalness doesn't help if the
# instruction gets lost in unstructured prose first.

# [Performance] For genuinely hard reasoning tasks, try extended thinking with a
# meaningful token budget BEFORE reaching for an elaborate hand-crafted CoT prompt.
# It's often the lower-effort first attempt; reserve hand-crafted reasoning
# scaffolds for cases where you know a specific structure outperforms.

# [Idiom] Explicitly inviting pushback ("tell me if this seems wrong") costs one
# sentence and measurably increases how often a real problem gets surfaced.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python" filename="edge_cases.py"}
```python
# [Gotcha] Over-tagging a short prompt adds structure with no benefit and some
# cost. A two-sentence request in five nested tags is harder for a human to
# review and doesn't help the model. Reserve heavy tagging for long/complex prompts.

# [Gotcha] A system prompt section that CONTRADICTS itself across headers gets
# applied inconsistently. "## Tone: always be concise" + "## Constraints: always
# include a lengthy mandatory disclaimer" are in tension. Which wins varies by turn.
# Resolve contradictions EXPLICITLY rather than trusting the model to prioritize.

# [Gotcha] Extended thinking budget is NOT a substitute for a well-scoped task.
# Giving a large thinking budget to an underspecified prompt (Chapter 4) produces
# more elaborate reasoning toward the WRONG goal, not a correct answer.

# [Gotcha] Claude's literalness can produce a technically-compliant but absurd
# result on a badly-scoped constraint. "never use the word 'error'" → "the operation
# did not complete as expected." State the intent, not just the prohibition.

# [Gotcha] Prefilled or tag-anchored output can silently fail if the model's
# response doesn't close the tag you expected — particularly under a strict
# max_tokens cutoff. A response truncated mid-tag will fail naive parsing.
```
::

## 🧠 Spot the Bug

::code-wrapper{language="markdown" filename="spot_the_bug.md"}
```markdown
You are a helpful assistant.

Be concise. Also, always provide a thorough, detailed explanation of
your reasoning before giving the final answer, covering all
considerations exhaustively.

<document>
{{50-page policy manual}}
</document>

Summarize the key points.
```
::

<details>
<summary>Answer</summary>

Two compounding problems:

1. **Self-contradicting instructions**: "be concise" and "always provide a thorough, detailed explanation covering all considerations exhaustively" ask for opposite response shapes with no resolution rule. Which instruction the model leans on is inconsistent per call.

2. **No structural separation between instructions and document content**: "be concise," the reasoning instruction, and "summarize the key points" are flat prose sitting directly next to a 50-page document with no tags or headers distinguishing "things to do" from "content to act on." This is exactly the long, undifferentiated-context scenario where Claude's XML-tagging convention earns its keep — and it's conspicuously absent here.

The fix: resolve the contradiction explicitly (decide: concise or exhaustive, or specify which applies to which part — e.g., "exhaustive reasoning, then a concise 3-bullet summary") and wrap the document and instructions in separate named tags so a 50-page reference document isn't competing with instructions for the same undifferentiated attention.

</details>

## Key Takeaways

::code-wrapper{language="python" filename="key_takeaways.py"}
```python
"""
Working with Claude — model-specific conventions.
"""

# 1. Model-specific conventions are a LAYER on top of model-agnostic fundamentals
#    (clarity, structure, decomposition). A Claude-optimized prompt that's vague
#    or contradictory still fails for the same reasons any vague prompt fails.

# 2. Claude system prompts respond well to explicit, clearly-labeled sections
#    (role, tone, constraints) rather than one undifferentiated paragraph.

# 3. XML tags are Claude's most distinctive convention — reliably delimit content
#    from instructions, especially in long prompts. Enable clean prefill/parsing
#    boundaries. Don't over-tag short prompts.

# 4. Extended thinking is a dedicated reasoning phase with its own token budget,
#    distinct from prompted CoT. Raises the ceiling on unaided reasoning but
#    doesn't replace a specific reasoning structure you know works better.

# 5. Claude follows instructions LITERALLY — precise constraints are unusually
#    reliable, but poorly-scoped constraints fail in exactly the narrow way written.
#    Explicitly inviting pushback measurably increases how often a real problem
#    surfaces rather than being silently worked around.
```
::
