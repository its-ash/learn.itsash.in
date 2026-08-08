# 02 — Anatomy of a Prompt

## The Building Blocks

Every prompt you send to an LLM, no matter how simple it looks, is built from a small set of components. Understanding what each one is *for* — and which conversational "role" it belongs to — is the difference between a prompt that works by accident and one you can systematically improve.

The core components are:

1. **Roles** — system, user, and assistant, which determine how the model weighs and interprets a piece of text.
2. **Instructions** — what you want the model to do.
3. **Context** — background information the model needs to do it well.
4. **Input data** — the specific thing to be acted on (a document, a question, a record).
5. **Output format specification** — the shape you want the response in.

Most prompting failures trace back to conflating these — putting input data where instructions should go, or context where a role separation would work better. This chapter breaks each one down.

## System, User, and Assistant Roles

Modern LLM APIs (Claude, GPT, Gemini, and essentially every production chat-based model) structure a conversation as a list of messages, each tagged with a **role**:

| Role | Purpose | Who "writes" it |
|---|---|---|
| `system` | Sets persistent behavior, persona, constraints, and ground rules for the entire conversation. | The application developer, typically invisible to the end user. |
| `user` | The human's (or calling application's) turn — questions, requests, data to process. | The end user, or your application on their behalf. |
| `assistant` | The model's own previous responses, replayed back as part of conversation history. | The model (in prior turns) — but you can also *write* assistant-role content yourself to show the model examples of desired output (see Chapter 3). |

Here's what that looks like as an actual API request body:

::code-wrapper{language="json"}
```json
{
  "model": "claude-opus-5",
  "max_tokens": 1024,
  "system": "You are a precise, terse API documentation assistant. Never use marketing language. Always include a code example when explaining a function.",
  "messages": [
    {"role": "user", "content": "How do I paginate through a list endpoint?"},
    {"role": "assistant", "content": "Pass a `page` cursor from the previous response's `next_page` field..."},
    {"role": "user", "content": "What happens if I reuse an old cursor?"}
  ]
}
```
::

### Why roles matter mechanically

Roles aren't just labels for humans reading the transcript — they change how the model was *trained* to weight instructions. Models are fine-tuned with the expectation that `system` content sets durable ground rules, `user` content is the immediate task or request, and `assistant` content is the model's own prior output (or a demonstration of what its output should look like). This produces a rough **precedence hierarchy**: system-level instructions are generally treated as higher-authority than a conflicting instruction that shows up in user content, especially on models specifically trained to resist a user trying to override system-level constraints via clever phrasing (see Chapter 18 on prompt injection, where this hierarchy is the entire defense).

This is not an absolute, unbreakable law — it's a strong statistical tendency shaped by training, and it can be degraded by a sufficiently confusing or long prompt. But as a design principle: **put durable, non-negotiable rules in the system role; put the specific task and its data in the user role.**

### A common structural mistake

A beginner mistake is to put everything — persona, rules, the actual question, formatting requirements — into a single undifferentiated block of user-role text:

::code-wrapper{language="markdown"}
```markdown
You are a helpful assistant that only answers questions about our product,
Acme Cloud Storage. Never discuss competitors. Here is a question: what's
the difference between the Pro and Enterprise tiers? Answer in a table.
Also never make up pricing you're not sure about.
```
::

This *works*, in the sense that it will usually produce a reasonable answer. But it conflates a durable behavioral policy ("never discuss competitors," "never make up pricing") with a one-off task ("what's the difference between tiers," "answer in a table"). If this were a real product, every user question would need to re-state the policy, which is wasteful, error-prone (a developer might paste a slightly different policy each time), and — critically — weaker, because the policy is competing for attention with the specific question in the same undifferentiated block rather than being established as a standing constraint. The fix:

::code-wrapper{language="markdown" filename="system-prompt.md"}
```markdown
You are a customer-facing assistant for Acme Cloud Storage.

Rules that apply to every response:
- Only answer questions about Acme Cloud Storage's own products.
- Never discuss or compare competitor products, even if the user asks directly.
- Never state a specific price or plan limit unless it appears in the
  reference pricing table provided in this system prompt. If asked about
  something not in that table, say you don't have current pricing and
  suggest they check the pricing page.
```
::

::code-wrapper{language="markdown" filename="user-message.md"}
```markdown
What's the difference between the Pro and Enterprise tiers?
Answer in a table.
```
::

Now the policy is established once, at the system level, and every user turn is free to focus purely on the task. This also means you can change the user's question without ever re-touching (and risking breaking) the policy text.

## Instructions vs. Context vs. Input Data

Within any single message, it helps to further distinguish three things that often get mashed together:

- **Instructions**: the verb — what you want done. "Summarize," "classify," "translate," "extract the following fields."
- **Context**: background the model needs to do the task *well*, but which isn't itself the thing being acted on. Audience, tone requirements, domain background, prior decisions, relevant constraints.
- **Input data**: the actual content being acted on — the email to summarize, the code to review, the transcript to classify.

Mixing these into one undifferentiated paragraph is the single most common source of "the model did something subtly different from what I meant." Consider this real support-automation prompt, written the confusing way:

::code-wrapper{language="markdown"}
```markdown
Summarize this for the support team, keep it short, the customer is a
long-time enterprise client so be careful with tone, here's the ticket:
customer says their dashboard has been showing stale data for 3 days,
they've already tried logging out and back in, they're the VP of
Engineering at a 500-person company and this is affecting their board
presentation tomorrow, can we prioritize this
```
::

It's not *wrong*, but the instruction ("summarize," "keep it short"), the context (enterprise client, tone sensitivity), and the input data (the actual ticket text) are all run together in a single stream, which makes it easy for the model to blend them — for instance, accidentally folding the tone guidance into the summary's content rather than treating it as a meta-instruction about *how* to write the summary. Separating them clarifies both for the model and for you:

::code-wrapper{language="markdown"}
```markdown
## Instructions
Summarize the support ticket below in 2-3 sentences for an internal
Slack channel. Note any prioritization signals explicitly.

## Context
The customer is a long-time enterprise account. Maintain a respectful,
non-dismissive tone in how you characterize their request — do not
editorialize about whether their urgency is "justified."

## Ticket
Customer says their dashboard has been showing stale data for 3 days.
They've already tried logging out and back in. They are the VP of
Engineering at a 500-person company, and this is affecting a board
presentation tomorrow. They are asking for prioritization.
```
::

The labeled sections do two things: they make it unambiguous to the model which text is the *subject* of the summary (only the Ticket section) versus which text is meta-guidance about *how* to summarize (Instructions and Context), and they make the prompt trivially easy to template — you can swap in a new ticket without touching the instructions, and vice versa.

This separation becomes even more important with **untrusted or adversarial input data** — see the "wrapping input data" pattern below and Chapter 18 for why failing to visually and structurally separate instructions from data is a direct enabler of prompt injection attacks.

### Delimiting input data clearly

When the input data is substantial (a document, a transcript, pasted code), wrap it in clear delimiters so the model can't confuse where your instructions end and the data begins — and so a malicious or accidental instruction *inside* the data is less likely to be mistaken for an instruction from you:

::code-wrapper{language="markdown"}
```markdown
Extract all customer names and order numbers mentioned in the transcript
below. Return them as a JSON array of {"name": ..., "order_number": ...}
objects. Only extract information that is explicitly present in the
transcript — do not infer or guess a value that is not stated.

<transcript>
Agent: Thanks for calling, can I get your name?
Customer: Sure, it's Maria Gonzalez, order number 88213-A.
Agent: And I see a second item here...
</transcript>
```
::

XML-style tags (`<transcript>...</transcript>`), triple-backtick code fences, or clearly labeled Markdown headers all work — the point is consistent, unambiguous delimiting, not the specific syntax. (Chapter 15 covers why XML tags in particular are a strong convention for Claude specifically.)

## Output Format Specification

The final anatomical piece is telling the model exactly what shape you want the response in — and this is worth treating as a first-class part of every non-trivial prompt, not an afterthought tacked on at the end.

Compare:

::code-wrapper{language="markdown"}
```markdown
What are the risks of this contract clause?
```
::

versus:

::code-wrapper{language="markdown"}
```markdown
What are the risks of this contract clause? Respond with a numbered list
of at most 5 risks. For each risk, use this format:

N. **[Risk name]** — [one sentence explaining the risk] — Severity: [Low/Medium/High]

Do not include a summary paragraph before or after the list.
```
::

The second version doesn't just constrain formatting — it constrains the *scope* of the response (at most 5), enforces a consistent structure that's easy to parse or display, and explicitly rules out the preamble/postamble text that models often add by default ("Here are the risks I found:" ... "Let me know if you'd like more detail!"). That last instruction matters more than it looks: models are trained on a lot of conversational text where responses are wrapped in social framing, and without an explicit instruction to skip it, you'll often get it by default.

For machine-readable output, explicit format specification becomes load-bearing rather than cosmetic — see Chapter 7 for JSON/XML output, schema constraints, and why "structured output" features (where the API enforces valid JSON) are often better than prompting alone for anything you plan to parse programmatically.

## Putting It All Together: A Production Example

Here's a realistic system prompt for an internal engineering tool that triages incoming bug reports, showing all the anatomical pieces working together:

::code-wrapper{language="markdown" filename="bug-triage-system-prompt.md"}
```markdown
# Role
You are a bug triage assistant for the Platform Engineering team at a
mid-sized SaaS company. You help engineers quickly assess incoming bug
reports before they're added to the sprint backlog.

# Task
For each bug report you receive, produce a structured triage assessment.

# Context you should assume
- The product is a B2B API platform. Customers are other engineering teams.
- "Sev1" means production-down or data-loss risk for a customer.
- "Sev2" means a significant feature is broken but there's a workaround.
- "Sev3" is anything else, including cosmetic issues and edge cases.
- Only mark something Sev1 if the report describes actual customer impact,
  not just a theoretical worst case.

# Output format
Respond with only a JSON object, no other text, in this exact shape:
{
  "severity": "Sev1" | "Sev2" | "Sev3",
  "affected_area": "<one of: auth, billing, api-gateway, data-pipeline, other>",
  "reproduction_steps_present": true | false,
  "one_line_summary": "<max 15 words>"
}

# Constraints
- If the report doesn't include enough information to determine severity,
  default to Sev3 and set reproduction_steps_present to false — never guess
  upward on severity.
- Do not include any text outside the JSON object.
```
::

Notice how cleanly this maps onto the anatomy: role (persona + scope), task (the verb), context (domain knowledge the model needs — what counts as Sev1 vs Sev2), output format (exact schema), and constraints (edge-case handling, tie-breaking rules). Each piece is doing one job and would be easy to update independently — you could revise the severity definitions without touching the output schema, or vice versa.

## 💡 Tips & Tricks

- **Section headers are cheap and effective** — Using Markdown headers (`# Role`, `# Context`, `# Output format`) or XML tags to separate anatomical pieces costs almost nothing in tokens and measurably helps the model (and future-you) keep sections distinct, especially in prompts longer than a few sentences.
- **System prompts are for policy, user messages are for tasks** — As a rule of thumb: if a piece of guidance should apply identically to every request in this conversation or product surface, it belongs in the system prompt. If it's specific to this one request, it belongs in the user message. Prompts that put per-request specifics in the system role usually indicate the code is rebuilding the "system prompt" on every call, which is a sign the abstraction boundary is in the wrong place.
- **You can write fake assistant turns** — You're not limited to writing `user` and `system` content; you can include `assistant`-role messages in your request that the model never actually generated, as a way of showing desired output style directly in the conversation history (this is the mechanism behind few-shot prompting via conversation, covered in Chapter 3).
- **Say what NOT to include, when defaults are the problem** — If a model's default behavior includes something you don't want (a preamble, a trailing "let me know if you have questions," excessive hedging), it's often more reliable to name that specific default and say don't do it than to just describe the format you do want and hope the negative space is inferred.
- **Order instructions by importance, and repeat the most critical one at the end** — In longer prompts, models sometimes weight the last instruction they read most heavily (a recency effect). For your single most important constraint, consider stating it once near the top for framing and again, tersely, right before the input data — see Chapter 4 for more on primacy/recency effects.

## ⚠️ Edge Cases & Gotchas

- **System prompt is not a security boundary by itself** — Many developers assume that because the system prompt is "invisible" to the end user, its contents are safe from disclosure and its instructions are unconditionally obeyed. Neither is reliably true: users can often coax models into revealing or paraphrasing system prompt content, and a sufficiently adversarial user message can sometimes override system-level instructions, especially on older or smaller models. Treat the system prompt as *strong guidance*, not an unbreakable sandbox — see Chapter 18 for defense-in-depth patterns.
- **Some APIs don't support a distinct system role the way you expect** — A few model APIs and older model versions handle "system" content by silently prepending it to the first user message rather than treating it as a distinct, higher-authority channel. If you're porting a prompt between providers, verify how the target API actually implements the system role rather than assuming behavioral parity — see Chapter 16 for cross-provider differences.
- **Long context sections can bury short instructions** — If your prompt has a huge "Context" section (e.g., a full product manual pasted in) followed by a brief one-line instruction, the instruction can get statistically "diluted" relative to the surrounding volume. Consider repeating the core instruction after the context block, not just before it — see Chapter 8 for placement strategy in long contexts.
- **Fake assistant turns must be plausible completions, not instructions to the model** — If you write an `assistant`-role message meant to demonstrate a format, but phrase it like a command ("I will now answer in JSON") rather than an actual example answer, the model may treat it as odd meta-commentary rather than a stylistic example to match, weakening the few-shot effect. Assistant-role example turns should look exactly like the output you want, not like a description of the output you want.
- **Delimiters can be spoofed if input data isn't sanitized** — If you delimit user-supplied input with `<data>...</data>` tags but don't check whether the user's own input contains a literal `</data>` (or a fake `<system>` tag), a malicious input can potentially break out of the delimiter and inject what looks like a new instruction. This is a real, non-theoretical prompt-injection vector — see Chapter 18 for mitigation patterns (including using less-guessable delimiters and treating the model's output as still-untrusted downstream).

## 🧠 Spot the Issue

A team builds an internal tool where the system prompt is dynamically rebuilt on every request by concatenating the persona, the specific document being analyzed, and the output format instructions — in that order — into one long system-role string, with an empty user message. The resulting prompt looks like this (abbreviated):

::code-wrapper{language="markdown"}
```markdown
[system role]
You are a contract analysis assistant for a law firm.
Here is the contract to analyze: <50 pages of contract text>
Respond with a JSON object listing all indemnification clauses found.

[user role]
(empty)
```
::

The team notices that when they update just the output-format instructions (e.g., changing the JSON schema slightly) without touching anything else, they sometimes see inconsistent results — as if the model is only partially applying the new instructions, or applying an old cached version of its "understanding" of the task. Why might putting the *document* between the persona and the *actual task instructions* — all inside the system role, with an empty user turn — be contributing to this?

<details>
<summary>Answer</summary>

Two things compound here. First, burying the actual task instructions (the output schema) *after* fifty pages of document text means the instructions are maximally far from the model's "fresh attention" at generation time and have to compete with a huge volume of unrelated content for salience — this is the same "long context can bury short instructions" issue from the Edge Cases section above, made worse by putting the instructions *after* the data instead of before it, so the model has to hold onto them across the entire document before use. Second, cramming task-specific, per-request content (the document, the specific schema for this run) entirely into the system role — while leaving the user role empty — misuses the role hierarchy: the system role is meant for durable, request-independent policy, and treating it as "wherever I happen to be building the string" makes it harder to reason about what's stable versus what changes per call, which is likely why they're seeing inconsistent behavior when only one part of a monolithic blob changes.

**The lesson**: keep the system role for genuinely stable, request-independent instructions; put the per-request document and task specifics in the user role, and put your output-format instructions *before* long input data, not buried after it — plus, when only part of a prompt changes between calls, isolating that part into its own role/section makes the change's effect easier to predict and debug.

</details>

## Key Takeaways

- Every prompt is built from a small set of parts — roles (system/user/assistant), instructions, context, input data, and output format — and most prompting bugs come from conflating parts that should be kept separate.
- The system role is for durable, request-independent policy; the user role is for the specific task and its data. Models are trained to weight system-level instructions with higher authority, though this is a strong tendency, not an absolute guarantee.
- Explicitly separating instructions from input data (with headers, XML tags, or delimiters) reduces ambiguity and is a foundational defense against prompt injection, covered fully in Chapter 18.
- Output format specification is not cosmetic — it constrains scope, structure, and eliminates unwanted default behaviors like conversational preambles.
- You can author `assistant`-role messages yourself as demonstrations, not just as replayed history — this is the anatomical basis for few-shot prompting, covered next in Chapter 3.
