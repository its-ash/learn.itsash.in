---
title: "07 — Output Formatting & Structured Data"
description: "Reliable JSON, XML, and structured output for downstream automation — prompted vs. API-enforced schemas, function calling as structured output, common failure modes, and production parsing patterns. Code-first reference for mid-to-senior engineers."
---

# 07 — Output Formatting & Structured Data

## Why Structured Output Matters

When output is consumed by *code* rather than a human, format stops being cosmetic and becomes a correctness requirement. A summary that's "close enough" is fine; a JSON response that's "almost valid" breaks your parser.

## Prompted JSON with Explicit Schema

::code-wrapper{language="markdown" filename="prompted_json.md"}
```markdown
Extract the following fields from the job posting below and return them as
a JSON object with exactly these keys: "title" (string), "company" (string),
"salary_min" (number or null if not stated), "salary_max" (number or null
if not stated), "remote" (boolean), "required_skills" (array of strings).

Return only the JSON object. Do not include any explanation, markdown code
fences, or additional text before or after it.

Job posting:
"Senior Backend Engineer at Fintech Startup Co. Fully remote. $140k-$180k
DOE. Must have 5+ years with distributed systems, Kafka, and PostgreSQL."
```
::

::code-wrapper{language="json" filename="expected_output.json"}
```json
{
  "title": "Senior Backend Engineer",
  "company": "Fintech Startup Co.",
  "salary_min": 140000,
  "salary_max": 180000,
  "remote": true,
  "required_skills": ["distributed systems", "Kafka", "PostgreSQL"]
}
```
::

## Prompted vs. API-Enforced: The Critical Distinction

::code-wrapper{language="python" filename="schema_enforced.py"}
```python
import json
from anthropic import Anthropic

client = Anthropic()

# PROMPTED JSON: you ask nicely with a schema description in prompt text.
# No hard guarantee — model can produce invalid JSON, add prose, wrong types.
# Reliable MOST of the time, but "most of the time" breaks unattended production.

# API-ENFORCED JSON: the API constrains token sampling so only valid JSON
# matching your schema CAN be generated. Guarantee by construction, not by
# the model "choosing" to comply.

JOB_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "company": {"type": "string"},
        "salary_min": {"type": ["number", "null"]},
        "salary_max": {"type": ["number", "null"]},
        "remote": {"type": "boolean"},
        "required_skills": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "company", "salary_min", "salary_max", "remote", "required_skills"],
    "additionalProperties": False,  # ← prevents the model from inventing extra keys
}

response = client.messages.create(
    model="claude-opus-5",
    max_tokens=1024,
    output_config={"format": {"type": "json_schema", "schema": JOB_SCHEMA}},
    messages=[{"role": "user", "content":
        "Extract fields from: Senior Backend Engineer at Fintech Startup Co. "
        "Fully remote. $140k-$180k DOE."
    }],
)

data = json.loads(response.content[0].text)  # ← GUARANTEED valid; no try/except needed
# The exact API surface (output_config.format, response_format, etc.) differs by
# provider and changes over time — always check current docs for your specific model.
```
::

::code-wrapper{language="python" filename="prompted_vs_enforced.py"}
```python
# ANTI-PATTERN: relying on prompted JSON for production parsing
def parse_prompted_json_naive(response_text: str) -> dict:
    """This WILL fail in production — the model adds prose, code fences, etc."""
    return json.loads(response_text)  # crashes on "Sure! Here's the JSON:\n```json\n{...}\n```"

# PRODUCTION: layered defense — try clean parse, fall back to extraction, then validate
import re

def parse_model_json_robust(response_text: str, schema: dict) -> dict:
    """Extract JSON from model output with multiple fallback strategies."""
    # Strategy 1: direct parse (works if API-enforced or model was clean)
    try:
        return validate_schema(json.loads(response_text), schema)
    except json.JSONDecodeError:
        pass

    # Strategy 2: extract from code fence
    fence_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
    if fence_match:
        try:
            return validate_schema(json.loads(fence_match.group(1)), schema)
        except (json.JSONDecodeError, SchemaError):
            pass

    # Strategy 3: find first { ... } in the text
    brace_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text, re.DOTALL)
    if brace_match:
        try:
            return validate_schema(json.loads(brace_match.group(0)), schema)
        except (json.JSONDecodeError, SchemaError):
            pass

    raise JSONExtractionError(f"Could not extract valid JSON from response: {response_text[:200]}")

def validate_schema(data: dict, schema: dict) -> dict:
    """Lightweight schema validation — check required fields and types."""
    for field in schema.get("required", []):
        if field not in data:
            raise SchemaError(f"Missing required field: {field}")
    return data

# BUT: if your provider offers API-enforced structured output, USE THAT INSTEAD.
# The robust parser is a fallback for when enforcement isn't available, not a
# replacement for it. Prompted JSON is "most of the time"; API-enforced is "always."
```
::

## XML Output for Mixed Structured-and-Prose Content

::code-wrapper{language="markdown" filename="xml_output.md"}
```markdown
Analyze the following customer feedback. Respond using this exact XML
structure:

<analysis>
  <sentiment>positive|negative|mixed</sentiment>
  <key_themes>
    <theme>...</theme>
    <!-- one <theme> element per distinct theme identified, at most 5 -->
  </key_themes>
  <recommended_action>...</recommended_action>
</analysis>

Do not include anything outside the <analysis> tags.

Feedback: "The app is fast and the design is beautiful, but I've lost work
twice now because it doesn't autosave. Please fix this before I recommend
it to my team."
```
::

XML is often better than JSON when the structure includes variable-length lists of rich content, mixed prose and structure, or nested sections that would require awkward escaping in JSON strings.

## Function Calling / Tool Use as Structured Output

::code-wrapper{language="json" filename="tool_definition.json"}
```json
{
  "name": "extract_job_posting",
  "description": "Extract structured fields from a job posting.",
  "input_schema": {
    "type": "object",
    "properties": {
      "title": {"type": "string"},
      "company": {"type": "string"},
      "salary_min": {"type": ["number", "null"]},
      "salary_max": {"type": ["number", "null"]},
      "remote": {"type": "boolean"},
      "required_skills": {"type": "array", "items": {"type": "string"}}
    },
    "required": ["title", "company", "salary_min", "salary_max", "remote", "required_skills"]
  }
}
```
::

::code-wrapper{language="python" filename="tool_vs_schema.py"}
```python
# Tool use and structured-output extraction are the SAME underlying mechanism,
# applied to two framings:
#   - Schema-constrained extraction: "here's a schema for the object you should return"
#   - Tool use: "here's a schema for the function you should call"
#
# The JSON is identical. The difference is SEMANTIC:
#   - Extraction: the task is "produce this data shape"
#   - Tool use: the task is "decide WHETHER and HOW to invoke an external capability"
#
# When the task is genuinely "extract this data" → use schema-constrained output.
# When the task is "the model needs to decide to search/query/send" → use tool use,
# because it also carries semantics (name + description) that help the model reason
# about WHEN to invoke, not just what shape to produce.
```
::

## Common Failure Modes

### The Unwanted Preamble

::code-wrapper{language="markdown" filename="unwanted_preamble.md"}
```markdown
<!-- ANTI-PATTERN: what the model produces without explicit suppression -->
Sure! Here's the JSON object you requested:

```json
{"title": "Senior Backend Engineer", ...}
```

Let me know if you need anything else!
```
::

::code-wrapper{language="markdown" filename="preamble_fix.md"}
```markdown
<!-- PRODUCTION: explicit suppression + API enforcement -->
Return only the JSON object, no other text, no code fences, no preamble,
no postamble. Begin your response with { and end it with }.
```
::

### Overly Rigid Format Causing Truncation

::code-wrapper{language="python" filename="truncation_anti_pattern.py"}
```python
# ANTI-PATTERN: a format spec so verbose it consumes the output budget
BAD_FORMAT_SPEC = """
Respond with a JSON object containing exactly 15 keys: title, subtitle,
introduction (minimum 200 words), background (minimum 300 words), methodology
(minimum 250 words), findings (minimum 400 words, must include at least 3
numbered sub-points each with its own citation), implications (minimum 200 words)...
[continues for 15 total sections with individually specified minimum lengths]
"""

# The format spec itself is so demanding that the actual CONTENT gets cut short
# to fit the mandated structure — especially with a tight max_tokens limit.
# The model spends its budget complying with the format, not producing substance.

# PRODUCTION: bound the format complexity to the output budget
GOOD_FORMAT_SPEC = """
Respond with a JSON object: {"summary": string, "key_points": array of
strings (max 5), "recommendation": string}. Keep "summary" under 100 words.
"""
# Simple enough that the model can produce real content within the budget.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="python" filename="tips.py"}
```python
# [Performance] Prefer API-enforced structured output over prompted JSON
# whenever available. The enforced-shape guarantee transfers better across
# model swaps (Chapter 16) and eliminates the entire class of "model added
# prose around my JSON" failures.

# [Idiom] For human-readable structured output, Markdown is the right tool.
# Specify exact heading level, exact labels, exact ordering:
# "## [Database name]\n**Best for:** one sentence\n**Watch out for:** one sentence"

# [Debug] If JSON parsing fails in production, log the RAW response text before
# attempting to parse. "The model returned invalid JSON" is less useful than
# "the model returned 'Sure! Here's the JSON:\n```json\n{...}\n```' — add
# 'return only the JSON object, no code fences' to the prompt."

# [Idiom] When mixing reasoning and structured output, separate them:
# <reasoning> ...free-form reasoning... </reasoning>
# <answer> ...JSON only... </answer>
# Then parse only the <answer> block. See Chapter 5 for the two-call pipeline
# alternative, which cleanly avoids mixing the two concerns in one response.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python" filename="edge_cases.py"}
```python
# [Gotcha] API-enforced JSON guarantees SYNTACTIC validity but not SEMANTIC
# correctness. The JSON will parse, but the model can still put the wrong value
# in a field — salary_min as a string of digits, or "remote": "yes" instead of
# true if the schema allows strings. The schema enforces shape, not truth.

# [Gotcha] "Additional properties: false" in a JSON schema prevents extra keys,
# but doesn't prevent the model from putting the RIGHT key with the WRONG value.
# Always validate semantic content, not just structural validity.

# [Gotcha] Schema-constrained output can still truncate at max_tokens. A valid
# JSON object that's cut off mid-generation is invalid JSON. Ensure max_tokens
# is large enough for the LARGEST expected valid response, not just the average.

# [Gotcha] JSON-mode guarantees differ across providers. Some enforce schema
# validation; others only guarantee JSON syntax validity (valid JSON, but
# any structure); others are best-effort. Check what "structured output" actually
# means for YOUR provider before relying on it for production parsing.

# [Safety] Function-calling / tool-use output containing untrusted external content
# is a direct injection vector (Chapter 18). A tool result that looks like a
# function call instruction can manipulate the model — validate tool calls against
# your registered tool list before execution.
```
::

## 🧠 Spot the Bug

A team extracts structured data using prompted JSON (no API enforcement). The prompt says "return a JSON object." In production, ~2% of responses fail to parse. Investigation shows the model sometimes wraps the JSON in a code fence or adds a one-line preamble like "Here are the extracted fields:". What's the fix?

<details>
<summary>Answer</summary>

Prompted JSON has no hard guarantee — the model *usually* complies but can add prose, code fences, or conversational framing any time. The 2% failure rate is the exact failure mode API-enforced structured output exists to eliminate. Two fixes, in order of preference:

1. **Use the provider's native structured-output feature** (schema-constrained generation). The output is valid JSON by construction — the 2% failure rate drops to 0% because the API constrains which tokens can be generated.
2. If API enforcement isn't available for your model, add an explicit suppression instruction ("Return only the JSON object, no code fences, no preamble, no explanation. Begin with { and end with }.") AND implement a robust parser with fallback extraction strategies (see `prompted_vs_enforced.py`).

The deeper lesson: "most of the time" is not good enough for unattended production parsing. Always prefer enforced guarantees over prompted requests when the feature is available.

</details>

## Key Takeaways

::code-wrapper{language="python" filename="key_takeaways.py"}
```python
"""
Output formatting & structured data — reliability for downstream code.
"""

# 1. The moment output is consumed by CODE, format is a correctness requirement,
#    not a cosmetic preference. "Almost valid JSON" breaks your parser.

# 2. Prompted JSON = "most of the time." API-enforced JSON = "always."
#    Prefer API-level schema-constrained output for anything parsed programmatically.
#    prompted: "return a JSON object with these keys..." → ~98% reliable
#    enforced:  output_config={"format": {"type": "json_schema", ...}} → 100% valid

# 3. Tool use / function calling IS structured output, with semantic framing.
#    Extraction: "produce this data shape" → schema-constrained output
#    Tool use: "decide whether/how to invoke a capability" → tool definition
#    Same JSON schema; different purpose. Match the mechanism to the task.

# 4. XML is better than JSON for mixed prose-and-structure, variable-length
#    content, and nested sections needing no escaping. Tag boundaries are
#    visually obvious even in malformed output, aiding partial recovery.

# 5. Common failure modes: unwanted preamble (fix with explicit suppression +
#    API enforcement), truncation from rigid format specs (fix by bounding
#    format complexity to the output budget), and semantic-vs-syntactic errors
#    (API enforces valid JSON; it doesn't enforce correct VALUES — validate both).
```
::
