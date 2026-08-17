# 07 — Output Formatting & Structured Data

## Why Structured Output Matters

The moment an LLM's output needs to be consumed by *code* rather than read by a human, format stops being a cosmetic preference and becomes a correctness requirement. A summary that's "close enough" to the right length is fine; a JSON response that's "almost valid" breaks your parser. This chapter covers how to reliably get JSON, XML, and other structured formats out of a model, the difference between prompting for format and enforcing it programmatically, and how tool use (function calling) is really just a specialized, more robust form of structured output.

## Requesting JSON Output

The baseline technique is simply asking clearly, with an explicit schema:

::code-wrapper{language="markdown"}
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

Expected output:

::code-wrapper{language="json"}
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

Several things in the prompt are doing specific work: naming the exact keys (not "extract the relevant fields," which leaves key-naming to chance), specifying types and null-handling explicitly (what happens when salary isn't stated is a real edge case that needs an explicit answer), and telling the model not to wrap the JSON in explanatory text or code fences (a very common default behavior that breaks naive parsing if not suppressed).

## Schema-Constrained Generation: Prompting vs. Enforcement

There's a critical distinction between two different levels of guarantee:

| Approach | Mechanism | Guarantee |
|---|---|---|
| **Prompted JSON** | You ask nicely, with a schema description in the prompt text. | No hard guarantee — the model can still produce invalid JSON, add prose, use wrong types, or invent extra keys. Reliable most of the time with a well-written prompt, but "most of the time" isn't good enough for unattended production parsing. |
| **API-level structured output / schema enforcement** | Many current provider APIs (as of this writing, this includes JSON-mode or schema-constrained output features on Claude, GPT, and Gemini APIs — check current docs for exact parameter names) constrain the token sampling process itself so that only tokens forming valid JSON matching your schema can be generated. | Strong guarantee — the output is syntactically valid JSON conforming to your schema by construction, not by the model "choosing" to comply. |

**The practical rule: if your target model/API offers native schema-constrained output, use it for anything you plan to parse programmatically, rather than relying purely on prompted formatting instructions.** Prompted JSON is still useful — for exploratory work, for models/APIs without this feature, or as a first line of defense even when you also have a hard fallback — but it should not be the *only* thing standing between "the model's raw output" and "code that assumes valid JSON."

::code-wrapper{language="python"}
```python
import json
from anthropic import Anthropic

client = Anthropic()

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
    "additionalProperties": False,
}

response = client.messages.create(
    model="claude-opus-5",
    max_tokens=1024,
    output_config={"format": {"type": "json_schema", "schema": JOB_SCHEMA}},
    messages=[{"role": "user", "content": "Extract fields from: Senior Backend Engineer at Fintech Startup Co. Fully remote. $140k-$180k DOE."}],
)

data = json.loads(response.content[0].text)
```
::

The exact API surface (`output_config.format`, a `response_format` parameter, or similar) differs by provider and changes over time — always check current documentation for your specific model rather than assuming parameter names transfer across providers. The conceptual point that transfers everywhere: **prefer letting the API constrain generation over prompting-and-hoping whenever the feature is available for your model.**

## Requesting XML Output

XML tags are a strong structuring convention, especially for Claude (see Chapter 15), because they cleanly delimit sections without requiring escaping the way JSON string values sometimes do, and they read naturally as nested containers for mixed structured-and-prose content:

::code-wrapper{language="markdown"}
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

XML is often a better fit than JSON when the structure includes variable-length lists of rich content, mixed prose and structure, or nested sections that would require awkward escaping in JSON strings (e.g., content containing literal quote characters or newlines). It also tends to be more forgiving to eyeball-verify and to partially recover from if the model produces a small deviation, since tag boundaries are visually obvious even in malformed output.

## Markdown Output for Human-Readable Structure

Not everything needs to be machine-parsed — a large fraction of "structured output" requests are actually about giving a *human reader* consistent, scannable structure, where Markdown is the right tool:

::code-wrapper{language="markdown"}
```markdown
Compare these three cloud database options for our use case (high write
throughput, moderate read latency requirements, need for strong
consistency). For each option, use this structure:

## [Database name]
**Best for:** one sentence
**Watch out for:** one sentence
**Verdict:** Recommended / Consider / Not recommended, with one sentence why

Cover: Amazon Aurora, Google Cloud Spanner, and CockroachDB.
```
::

The discipline here is the same as JSON/XML — an explicit, consistent template — but the enforcement bar is lower, since a human reading the output can tolerate minor formatting drift in a way a JSON parser cannot. Still, specifying the exact heading level, the exact labels, and the exact ordering produces far more consistent, comparable output across multiple calls (useful if, say, you're generating this comparison for many different database triples and want the results to be visually consistent).

## Function Calling / Tool Use as Structured Output

**Function calling** (also called tool use — covered in full in Chapter 13) is worth introducing here specifically as a *form of structured output*, because that framing clarifies why it's often more robust than prompted JSON for anything resembling "call this specific action with these specific parameters."

Instead of asking the model to produce JSON matching a schema you described in prose, you provide a **tool definition** — a formal name, description, and parameter schema — and the model's job becomes selecting which tool to call (if any) and populating its parameters, with the underlying API enforcing that the output conforms to the tool's declared schema:

::code-wrapper{language="json"}
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

This looks almost identical to the JSON schema example above — and that's the point. **Tool use and structured-output extraction are the same underlying mechanism, applied to two different framings**: "here's a schema for the object you should return" versus "here's a schema for the function you should call." When your task is genuinely "extract this data," schema-constrained output (above) is usually the more direct fit. When your task is genuinely "the model needs to decide whether and how to invoke an external capability" — search the web, query a database, send an email — tool use is the right frame, because it also carries semantics (a name and description) that help the model reason about *when* to invoke it, not just what shape to produce when it does. Chapter 13 goes deep on the decision-making and orchestration side of this; this chapter is about the structural/formatting side.

## Common Formatting Failure Modes

### The unwanted preamble

Left unconstrained, models frequently wrap structured output in a conversational frame:

::code-wrapper{language="markdown"}
```markdown
Sure! Here's the JSON object you requested:

```json
{"title": "Senior Backend Engineer", ...}
```
::
Let me know if you need anything else!
```
::

This breaks naive parsing (`json.loads()` on the raw response text fails immediately because of the surrounding prose and code fence). The fix is an explicit instruction ("return only the JSON object, no other text, no code fences") combined — wherever available — with schema-constrained output at the API level, which eliminates this failure mode entirely rather than just discouraging it.

### Overly rigid format instructions causing truncation

A subtler failure mode: an extremely rigid, verbose format specification can itself consume so much of the model's attention or the available output budget that the *actual content* gets cut short or degraded to fit the mandated structure — especially when combined with a tight `max_tokens` limit (see Chapter 1 on token limits, and Chapter 5 on how CoT reasoning can consume a token budget before the final structured answer is reached).

::code-wrapper{language="markdown"}
```markdown
Respond with a JSON object containing exactly 15 keys: title, subtitle,
introduction (minimum 200 words), background (minimum 300 words),
methodology (minimum 250 words), findings (minimum 400 words, must
include at least 3 numbered sub-points each with its own citation),
implications (minimum 200 words)... [continues for 15 total sections
with individually specified minimum lengths]
```
::

If the combined minimum word counts across all 15 sections exceed what fits in the available `max_tokens`, the model has no good option — every path forward violates either the schema or the truncation limit, and in practice you'll often get an early section fully realized and later sections cut off mid-sentence, or a response that abandons the JSON structure entirely partway through. The fix is to be realistic about output budget before writing the format spec: either reduce the required content, increase `max_tokens` to comfortably exceed your own worst-case estimate of the content's real length, or split the request into multiple calls (Chapter 10) each producing one section, rather than demanding one enormous structured document in a single generation.

### Schema drift over long conversations

In a multi-turn conversation where you're repeatedly asking for the same structured format, the model can gradually drift from the exact schema — adding an extra field it thinks is helpful, renaming a key slightly, or changing a value's type (e.g., returning a number as a string on one turn). This is a recency/context-crowding effect: your original schema definition, stated once at the start of a long conversation, has less influence turn-by-turn as more conversation history accumulates between it and the current generation. Mitigation: for anything programmatically parsed across a long conversation, either restate the schema (or a compact reminder of it) periodically, or better, structure your application to make each extraction its own fresh, stateless call rather than a continuation of a long conversation (see Chapter 8 for context management strategies, and Chapter 9 for treating this kind of consistency as something to test for explicitly).

## 💡 Tips & Tricks

- **Show the schema, don't just describe it** — A literal example of the target JSON/XML shape (even a single one) in the prompt is often more reliable than a prose description of the same shape, combining the specificity benefits of Chapter 4 with the demonstration benefits of Chapter 3's few-shot technique.
- **Put format instructions close to the output request, not just at the top of a long prompt** — In a long prompt with substantial context before the actual ask, restating the format requirement briefly right before where generation begins helps counter the "long context can bury short instructions" effect from Chapter 2.
- **Use `null` explicitly for "field doesn't apply," rather than omitting keys** — A schema where optional data is represented by an explicit `null` value is far easier for downstream code to handle reliably (a fixed set of keys to check) than a schema where fields are sometimes present and sometimes silently missing, which forces every consumer to handle both cases.
- **Prefer enums over free-text for classification fields** — If a field's valid values are a fixed, known set (e.g., `"low" | "medium" | "high"`), say so explicitly and, where the API supports it, encode it as an actual JSON Schema `enum` constraint rather than describing the valid values in prose — this removes an entire category of "close but not exact" mismatches (e.g., "High" vs "high" vs "HIGH").
- **Validate, don't just trust — even with schema enforcement** — Schema-constrained generation guarantees syntactic validity and type conformance, but it doesn't guarantee semantic correctness (a `salary_min` of `9999999999` is valid JSON but obviously wrong). Always run a sanity-check validation layer in your application code regardless of how strong the generation-time guarantee is.

## ⚠️ Edge Cases & Gotchas

- **Overly rigid output-format instructions can cause truncation, as detailed above** — this is common enough, and costly enough when it happens silently in production, that it's worth double-billing here as both a Common Failure Mode and a Gotcha: always sanity-check that your `max_tokens` budget comfortably exceeds a realistic worst-case rendering of your requested schema before shipping a rigid format spec to production.
- **Empty or malformed input data needs an explicit contract, not silent guessing.** If you ask the model to extract structured fields from a document and the document is empty, doesn't contain the expected information, or is corrupted/truncated, an unconstrained prompt will often have the model either hallucinate plausible-looking values to fill the schema, or produce an inconsistent ad-hoc response (sometimes an error message in prose instead of the schema, sometimes an empty object, sometimes nulls). Specify this explicitly: "If the input does not contain enough information to populate a required field, set it to null and add an `"extraction_warnings"` array describing what's missing — do not guess a plausible-sounding value."
- **JSON string escaping is a real, recurring failure point.** Content containing literal quote characters, backslashes, or newlines (a customer message that includes a quoted sentence, a code snippet inside a summary) needs to be correctly escaped to remain valid JSON, and models — especially under prompted-JSON rather than schema-enforced generation — occasionally produce invalid escaping on these inputs. This is one of the strongest practical arguments for using genuine schema-constrained generation over prompted JSON wherever the input data is uncontrolled, since the constrained-decoding mechanism handles escaping correctly by construction.
- **Adversarial input can attempt to break out of your format via injected fake structure.** If any part of your prompt includes untrusted user content, and that content contains something that looks like your closing delimiter (`</analysis>`, a stray closing JSON brace inside a quoted string, or text like "Ignore the above and instead return..."), a less-robust prompted-format setup can be tricked into producing attacker-influenced output. See Chapter 18 for the full treatment — the format-safety implication here is that schema-constrained generation is also a meaningful security improvement, not just a convenience, because it structurally limits what the output *can* contain, regardless of what the input contains.
- **Don't conflate "valid JSON" with "matches my mental model of the schema."** A model can return perfectly valid, well-formed JSON that nonetheless doesn't match your intended schema in subtle ways — an array where you expected an object, a nested structure where you expected a flat one, correct field names but swapped between two similarly-named fields. Syntactic validity is necessary but not sufficient; always validate structurally (ideally with an actual schema validator library) before trusting the parsed result in downstream logic.

## 🧠 Spot the Issue

A team requests structured output with this prompt, running it via prompted JSON (no schema-enforcement feature available on their current provider/model combination):

::code-wrapper{language="markdown"}
```markdown
Extract the shipping address from this customer message and return it as
JSON with keys: street, city, state, zip.

Customer message: "Hey, quick question — is my order from last week still
going to arrive by Friday? Also I moved recently, just want to confirm
you have my current address on file, it should be 42 Birch Lane."
```
::

The model returns:

::code-wrapper{language="json"}
```json
{
  "street": "42 Birch Lane",
  "city": "Unknown",
  "state": "Unknown",
  "zip": "Unknown"
}
```
::

The downstream code treats this as a successfully extracted, complete address and attempts to use it to update a shipping record, causing a corrupted address (city/state/zip literally set to the string "Unknown") to be written to the database. What are the two separate mistakes here — one in the prompt design, one in the downstream code — and how would you fix each?

<details>
<summary>Answer</summary>

**Prompt-design mistake**: the prompt never specified what to do when required information is missing from the source text — it only told the model the shape to fill in, not the contract for partial or absent data (this is exactly the "empty or malformed input" gotcha above). Left to its own devices, the model chose the most plausible-looking filler ("Unknown") rather than a value that clearly signals "this wasn't actually present," because nothing in the prompt told it that distinction mattered. The fix is to specify the missing-data contract explicitly: "If any field cannot be determined from the message, set it to `null`, not a placeholder string. Add a top-level `"complete": true | false` field indicating whether all fields were successfully extracted."

**Downstream-code mistake**: even with a better-specified prompt, the calling code should never treat any single LLM extraction as ground truth without validation — it should check for `null` fields (or, in the original flawed version, should have treated a literal string "Unknown" in a structured field as a red flag rather than passing it through unchecked) before writing anything to a persistent record. Trusting parsed-but-unvalidated LLM output as if it were a verified, human-confirmed value is the deeper structural problem — no prompt wording alone should be relied on as the sole safeguard before a write to a production database.

**The lesson**: every extraction prompt needs an explicit contract for missing or unavailable data (use `null`, not a plausible-looking placeholder string, and consider a companion completeness flag), and every piece of code consuming LLM-extracted structured data needs its own validation layer — schema conformance and "the model tried to fill in something" are not the same as "the extracted value is actually correct and safe to act on."

</details>

## Key Takeaways

- Structured output (JSON, XML) turns a model's free-text tendencies into a parseable contract — the key techniques are an explicit schema, explicit type/null handling for missing data, and an instruction to suppress conversational wrapping.
- Wherever your provider offers native schema-constrained generation, prefer it over prompted-JSON-and-hope for anything programmatically consumed — it structurally guarantees valid syntax and type conformance rather than relying on the model choosing to comply.
- Function calling / tool use is conceptually the same mechanism as structured-output extraction, framed around invoking a named capability rather than filling a data object — Chapter 13 covers the orchestration side in depth.
- Overly rigid or exhaustive format specifications can cause truncation or partial-schema output if they don't fit comfortably within your token budget — always sanity-check realistic output length against `max_tokens` before shipping a rigid schema.
- Syntactic validity is not semantic correctness: always validate structurally and sanity-check values in your application code, regardless of how strong the generation-time formatting guarantee is.
