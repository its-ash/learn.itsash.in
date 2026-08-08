# 16 — Working With GPT and Other Models

## The Portability Problem

Chapter 15 covered Claude's specific conventions in depth. This chapter asks the harder question: what happens when you take a prompt that works well on one model and run it against another? The honest answer is that instruction-following style, formatting conventions, and even how literally a constraint is honored all vary meaningfully across model families — a prompt engineered and tuned against one model is not guaranteed to perform the same way on another, even when both are described as "highly capable" in their respective marketing. Treating a prompt as portable-by-default, without re-validation, is one of the more common causes of a prompting approach quietly degrading after a model swap or an unplanned model upgrade.

This isn't a reason to write entirely separate prompts per model from scratch. It's a reason to understand *which parts* of a prompt tend to transfer cleanly (the model-agnostic fundamentals from Parts I–III of this course) and which parts need re-tuning per family (formatting conventions, system-message weighting, reasoning-elicitation phrasing).

## OpenAI Conventions

OpenAI's models (the GPT family, and its reasoning-focused model lines) have their own set of documented and empirically-observed conventions, some overlapping with Claude's and some distinct.

**Message roles carry somewhat different weight.** OpenAI's chat-completion-style APIs use `system`, `user`, and `assistant` roles, and — as of writing — recent OpenAI guidance has introduced more granular instruction-hierarchy concepts (distinguishing platform-level, developer-level, and user-level instructions) rather than treating "system prompt" as the single highest-priority channel the way earlier conventions did. Because this hierarchy has been actively evolving, check current OpenAI documentation for the specific role/priority model of the API version you're targeting rather than assuming it matches an older mental model.

**Markdown and structured formatting are well-respected**, similarly to Claude, but some OpenAI model versions have specifically been documented as trending toward heavier or lighter use of markdown formatting (bullets, headers, bold) in default responses across different releases — if your application parses or displays model output in a way that's sensitive to formatting (rendering into a UI that expects plain prose, for instance), it's worth explicitly specifying the desired formatting rather than relying on a model version's current default tendency, which can shift between releases.

::code-wrapper{language="markdown"}
```markdown
Respond in plain prose only. Do not use markdown formatting — no bullet
points, no headers, no bold text, no numbered lists — even if the
content would normally lend itself to a list.
```
::

**Reasoning-focused models often need less explicit chain-of-thought prompting, and sometimes actively discourage it.** OpenAI's reasoning-optimized model lines are trained to perform extended internal reasoning before answering, similar in spirit to Claude's extended thinking (Chapter 15), and OpenAI's own guidance for these models has generally recommended *simpler*, more direct prompts rather than heavily hand-crafted "think step by step" scaffolding — the model's built-in reasoning process can be actively hindered by a prompt that tries to over-specify its reasoning steps, in some documented cases. This is a meaningful contrast with a standard (non-reasoning-optimized) chat model, where Chapter 5's explicit chain-of-thought techniques still reliably help. Which regime a given model falls into is not always obvious from its name alone, and shifts across releases — check the model-specific guidance before assuming either "add explicit reasoning steps" or "keep it simple and let the model reason internally" is the right default.

## A Concrete Portability Example

Consider a structured-extraction prompt (Chapter 7) tuned against one model family using heavy XML tagging:

::code-wrapper{language="markdown"}
```markdown
<email>
{{raw email text}}
</email>

<task>
Extract the sender's requested action, deadline (if any), and urgency
level (low/medium/high) as JSON.
</task>
```
::

This prompt is likely to work reasonably on most capable models — XML-as-delimiter is broadly readable — but the *reliability* of the JSON output specifically (does it always come back as valid, parseable JSON with no surrounding prose?) tends to vary by family and by whether you're using a model's dedicated structured-output or JSON-mode feature rather than prompting for JSON in free text. A more portable version of the same task leans on each provider's actual structured-output mechanism (JSON schema mode, function-calling-shaped output, or equivalent) rather than relying purely on prompted formatting instructions, precisely because the prompted version's reliability is the part most likely to vary across families and across model versions within the same family.

::code-wrapper{language="json"}
```json
{
  "type": "object",
  "properties": {
    "requested_action": {"type": "string"},
    "deadline": {"type": ["string", "null"]},
    "urgency": {"type": "string", "enum": ["low", "medium", "high"]}
  },
  "required": ["requested_action", "deadline", "urgency"]
}
```
::

Using this schema through a provider's native structured-output feature, where available, is more portable in the sense that matters practically — the *shape guarantee* transfers even when the prose-level instruction-following nuances underneath it don't transfer identically.

## Differences in Instruction-Following Style

Beyond formatting, model families differ in how they resolve ambiguity, how eagerly they add unrequested elaboration, and how they handle conflicting instructions — none of which is fully documented in any provider's guide, and all of which are best discovered empirically for your specific use case rather than assumed from general reputation.

A few patterns that show up often enough to be worth watching for when porting a prompt, stated carefully as tendencies rather than guarantees, since they shift across model versions:

- **Verbosity defaults differ.** A prompt that produces an appropriately terse answer on one model can produce a noticeably longer, more hedged, or more heavily caveated answer on another with an identical instruction — if response length matters to your application, state a length constraint explicitly (Chapter 4) rather than relying on either model's default verbosity matching what you saw during initial development.
- **Refusal and caution thresholds differ.** A request that one model handles directly can trigger a more cautious, hedged, or declining response on another, particularly around medical, legal, financial, or safety-adjacent topics — a prompt developed and tested against one model's threshold can unexpectedly start failing (or unexpectedly stop failing) after a model swap, which is a strong argument for the eval-set regression testing covered in Chapter 19 whenever you change model or model version.
- **Sensitivity to instruction position in a long prompt differs.** Chapter 8 covered position effects generally; the exact shape of that effect (how much a middle-buried instruction degrades versus one near the start or end) is not identical across model families or even necessarily stable across versions of the same family.

## Prompting Open-Weight and Smaller Models

Open-weight models (Llama, Mistral, and others) and smaller models generally are often more sensitive to exact prompt template formatting than the larger hosted-API models this course has mostly discussed — many open-weight models were instruction-tuned against a very specific chat template (particular special tokens or role markers), and deviating from that exact template, even in ways a hosted API model would tolerate gracefully, can measurably degrade output quality:

::code-wrapper{language="markdown"}
```markdown
Wrong (informal, ignores the model's expected chat template):
"Hey, can you summarize this: {{document}}"

Right (matches the model's documented chat template exactly, typically
handled by the inference library/tokenizer rather than hand-typed, but
shown here for illustration):
<s>[INST] Summarize the following document.

{{document}} [/INST]
```
::

In practice this templating is usually handled for you by the serving framework or SDK (Hugging Face's `transformers`, `vLLM`, `llama.cpp` bindings, etc.) applying the correct chat template automatically — the actionable takeaway is to confirm your tooling is applying the *correct* template for the specific model checkpoint you're using, rather than assuming a generic one works, and to expect noticeably less forgiving behavior around ambiguous or unconventional prompt phrasing than a large hosted API model exhibits. Smaller models also generally benefit more, not less, from explicit few-shot examples (Chapter 3) — the zero-shot instruction-following gap between a frontier hosted model and a smaller open-weight one is often exactly the gap that one or two good examples closes.

## Writing Prompts That Degrade Gracefully Across Models

Given that full portability isn't realistic, the practical goal is a prompt that degrades *gracefully* rather than catastrophically when run against a different model than it was tuned for:

- **State constraints explicitly rather than relying on a model's default tendency** — length, tone, and format instructions written out plainly transfer better than a prompt that omits them because "the model I tested with just does this by default."
- **Prefer native structured-output mechanisms over prompted formatting instructions** wherever more than one model family needs to consume the same prompt, since the underlying guarantee is closer to universal even when the exact API shape to invoke it differs per provider.
- **Keep chain-of-thought elicitation as a clearly separable, easily removable block** — a prompt that has "think step by step, then answer" as a distinct, isolated instruction is trivial to strip out if you later target a reasoning-optimized model that performs worse with it; a prompt where reasoning instructions are woven inextricably through the whole task description is much harder to adapt.
- **Build the eval set (Chapter 19) before you need it for a model migration, not during one** — the single most reliable way to know whether a prompt survived a model swap is a concrete before/after comparison on real test cases, not an impression from a handful of manual spot checks.

## 💡 Tips & Tricks

- **Portability** — When a prompt needs to run against multiple model families in production (a fallback provider, an A/B test, a multi-model router), maintain one shared "core task" block and small per-model wrapper sections for formatting/role conventions, rather than forking the entire prompt per model — this keeps the actual task logic in one place to update.
- **Debug** — If a prompt that worked well suddenly degrades after a routine model version upgrade (even within the same family), suspect a shifted default behavior (verbosity, refusal threshold, formatting tendency) before suspecting your own prompt — providers do change these defaults between versions without it counting as a breaking API change.
- **Idiom** — For reasoning-optimized models specifically, try the simplest possible direct prompt first and only add explicit reasoning scaffolding if you can show, empirically, that it improves your eval-set results — the "more explicit structure is always at least neutral" assumption from earlier chapters does not reliably hold for this model category.
- **Performance** — When working with a smaller or open-weight model, invest evaluation effort in confirming the chat template is applied correctly before concluding the model itself is the limiting factor — a surprising fraction of "this small model is just bad at instruction-following" reports trace back to a template mismatch, not a capability gap.
- **Idiom** — Keep a small, explicit "model assumptions" note alongside any production prompt (which model and version it was tuned against, what native features it relies on) — this turns a future model migration into a checklist instead of an archaeology project.

## ⚠️ Edge Cases & Gotchas

- **A prompt that relies on implicit system-prompt priority can fail silently on an API using a different instruction hierarchy** — an instruction placed in a system message assuming it always overrides user-turn content may not hold with the same strength across every provider's role-priority model, especially as these hierarchies (particularly OpenAI's, as of writing) continue to evolve; a security-relevant constraint should never depend solely on message-role placement across an unverified provider (see also Chapter 18).
- **Refusal-threshold differences can look like a regression when they're actually a policy difference.** A legitimate, benign request that one model handles and another declines is not necessarily a prompting bug to fix by rephrasing more aggressively — sometimes it correctly reflects a different safety threshold, and the right response is adjusting the request's framing or context, not trying to engineer around a deliberate guardrail.
- **JSON-mode-style constraints from one provider don't automatically mean valid JSON from another** — different "guaranteed structured output" features have different actual guarantees (schema-validated versus merely JSON-syntax-valid versus best-effort), and treating them as interchangeable without checking is a common source of a "the schema validation started failing after we switched providers" incident.
- **A model swap can silently change token-counting and context-window behavior** even when the numbers look similar on paper — different tokenizers segment the same text differently, so a prompt that fit comfortably under one model's context limit is not guaranteed to fit under a superficially similar-sized limit on another, since the actual token count for the same input text differs by tokenizer.
- **"It works when I test it manually" is not evidence of portability.** Manual spot-checking during a model migration reliably misses the specific edge cases (unusual formatting requests, boundary-length inputs, ambiguous phrasing) where behavior actually diverges between families — this is precisely the gap the eval-set approach in Chapter 19 exists to close, and skipping it during a model migration is a common, avoidable source of production regressions.

## 🧠 Spot the Issue

A team's support-ticket triage prompt was developed and tuned entirely against one model family. It's ported to a second provider with no changes, on the assumption that "it's just an API call, the prompt is the prompt":

::code-wrapper{language="markdown"}
```markdown
You are a ticket triage assistant. Categorize the ticket and return
JSON: {"category": "...", "priority": "..."}

Think through your reasoning step by step before giving the final JSON.

Ticket: {{ticket_text}}
```
::

After the switch, an increasing number of responses fail to parse as JSON — the model now often includes a paragraph of reasoning text before the JSON object, sometimes with the object embedded mid-paragraph rather than isolated. What changed, and what's the more robust fix?

<details>
<summary>Answer</summary>

Two portability assumptions failed at once. First, "think step by step" combined with a request for a clean, isolated JSON object works fine on some models but is exactly the kind of interaction the new model family may handle differently — its default behavior might interleave reasoning and answer more freely, or might not cleanly separate "thinking out loud" from "the actual structured answer" the way the original model did, so the visible reasoning text ends up sitting right next to (or wrapped around) the JSON instead of cleanly preceding it. Second, and more fundamentally, the original prompt was relying on *prompted* JSON formatting rather than any provider-native structured-output guarantee — that reliability gap was already a portability risk noted earlier in this chapter, and switching providers is exactly the event that exposes it, since "the model usually formats it correctly" was never actually enforced. The robust fix is twofold: use the new provider's native structured-output/JSON-schema feature so the final answer's shape is enforced by the API rather than requested in prose, and if step-by-step reasoning is still wanted, request it in a clearly separate, explicitly delimited section (or via that provider's dedicated reasoning mechanism, if it has one) rather than trusting that "think step by step, then give JSON" parses the same way it used to just because the English instruction text is identical.

**The lesson**: an identical prompt string is not an identical instruction across model families — reasoning-elicitation phrasing and prompted-only formatting are exactly the two things most likely to break silently on a model swap, and provider-native structured-output mechanisms exist specifically to remove that fragility.

</details>

## Key Takeaways

- Prompt portability across model families is partial, not automatic — the model-agnostic fundamentals (clarity, structure, decomposition) transfer well; formatting conventions, system-message priority, and reasoning-elicitation phrasing often do not.
- OpenAI's conventions include an evolving, more granular instruction-hierarchy model (beyond a flat system/user split) and reasoning-optimized models that often perform better with simpler, less heavily-scaffolded prompts than Chapter 5's chain-of-thought techniques suggest for standard models.
- Prefer a provider's native structured-output mechanism over purely prompted formatting instructions whenever a prompt might run against more than one model or model version — the enforced-shape guarantee transfers far better than prompted formatting reliability does.
- Open-weight and smaller models are typically more sensitive to exact chat-template formatting and benefit more from explicit few-shot examples — confirm your serving stack applies the correct template before concluding a model lacks the capability to do the task.
- Verbosity defaults, refusal/caution thresholds, and position-in-context sensitivity all vary across families and across versions within a family — a prompt's behavior on one model is a data point about that model, not a universal fact about the prompt.
- The only reliable way to know whether a prompt survived a model migration is eval-set regression testing (Chapter 19) built before the migration, not manual spot-checking during or after it.
