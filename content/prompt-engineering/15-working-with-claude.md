# 15 — Working With Claude

## Why Model-Specific Conventions Exist at All

Everything through Chapter 14 has been model-agnostic on purpose: clarity, decomposition, chain-of-thought, tool use, and multi-agent design all work, to a first approximation, on any sufficiently capable instruction-following model. But "to a first approximation" is doing real work in that sentence. Each model family is trained with different data, different instruction-tuning recipes, and different conventions baked in through its own training examples — and a prompt that leans into a given model's specific training conventions reliably outperforms an equally clear but generically-phrased one on that model. This chapter covers Claude's documented conventions specifically; Chapter 16 covers GPT and other families, and the contrast between the two chapters is itself the more important lesson than either one alone.

None of this contradicts the earlier chapters — clarity, specificity, and good structure remain the foundation regardless of model. What follows is the layer on top: how to phrase that same clarity in the dialect a given model was most heavily trained to respond to.

## System Prompt Structure

Claude models are trained to treat the system prompt as a distinct, high-priority channel — instructions there tend to be weighted more heavily and held more consistently across a long conversation than the same instruction placed in the first user turn. Anthropic's own prompting guidance recommends structuring a Claude system prompt with clearly delineated sections rather than one undifferentiated paragraph:

::code-wrapper{language="markdown"}
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

This is a direct application of Chapter 2's anatomy-of-a-prompt breakdown (role, context, task, constraints) rendered as explicit headers rather than left implicit — Claude models respond well to this kind of visibly segmented structure, and the segmentation also makes the system prompt easier for a human to review and maintain, which matters as much in practice as the model-facing effect.

## XML Tags for Structuring Input

The single most distinctive Claude-specific convention is the heavy use of XML-style tags to delimit sections of a prompt — document content, examples, instructions, and expected output are each wrapped in a named tag rather than separated by prose or markdown headers alone:

::code-wrapper{language="markdown"}
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

Claude was extensively trained on XML-tagged data of this shape, which makes it unusually reliable at respecting tag boundaries — referring back to "the document" later in a long prompt reliably resolves to the content inside `<document>` tags specifically, rather than getting confused with instruction text that happens to be nearby. This matters most exactly where Chapter 8's context-management concerns are sharpest: long prompts mixing reference material, instructions, and examples benefit disproportionately from tags that make the boundary between "content to act on" and "instructions about how to act on it" unambiguous. Tag names are not a fixed vocabulary — `<document>`, `<instructions>`, `<examples>`, `<output_format>`, `<thinking>` are common conventions, but a well-named custom tag (`<customer_email>`, `<previous_turn_summary>`) works just as well as long as it's used consistently within the prompt.

A related, easily-missed benefit: XML tags make **prefilling and partial-output continuation** cleaner. If you want a Claude response to begin in a specific way (skipping preamble, starting directly with the requested format), asking for output inside a specific closing tag gives you a clean, machine-checkable boundary to parse against, similar in spirit to the delimiter discipline covered in Chapter 7 for structured output generally.

## Extended Thinking

Current Claude models support an **extended thinking** mode, distinct from the prompted chain-of-thought covered in Chapter 5 — rather than asking the model to write out reasoning as part of its regular response, extended thinking is a dedicated reasoning phase (with its own token budget) that runs before the model produces its final answer, and whose content is typically presented separately from the final response rather than interleaved with it.

::code-wrapper{language="python"}
```python
response = client.messages.create(
    model="claude-opus-5",
    max_tokens=4096,
    thinking={"type": "enabled", "budget_tokens": 2048},
    messages=[{"role": "user", "content": "Given these three vendor contracts, which has the most unfavorable termination clause, and why?"}],
)

thinking_block = next(b for b in response.content if b.type == "thinking")
answer_block = next(b for b in response.content if b.type == "text")
```
::

The practical difference from prompted chain-of-thought matters for prompt design: because extended thinking has its own allocated budget and isn't just "more tokens in the same response," it tends to be more effective for genuinely hard multi-step problems (complex comparison, multi-constraint reasoning, subtle bugs) without you needing to hand-craft a "think step by step" instruction — the model was specifically trained to use this budget well. It does **not** replace the earlier chapters' techniques wholesale, though: for tasks that benefit from a *specific* reasoning structure (Chapter 5's worked-example few-shot chains, Chapter 11's structured self-consistency checks), explicitly prompting that structure — even alongside extended thinking — still outperforms leaving the model's reasoning process entirely unconstrained. Extended thinking is best understood as raising the ceiling on unaided reasoning quality, not as a substitute for telling the model *how* you want it to reason when you know a specific approach works.

As of writing, extended thinking has cost and latency implications tied to the token budget you allocate, and budgets, availability, and defaults vary across model versions — treat specific numbers as something to check against current documentation rather than something to memorize from this chapter.

## Claude's Response to Direct, Literal Instructions

A recurring theme in Anthropic's own prompting documentation, and one that shows up repeatedly in practice, is that Claude models tend to follow instructions quite literally — including instructions a human would read as implicitly negotiable or contextual. This cuts both ways. It means a precisely-worded constraint is unusually reliable:

::code-wrapper{language="markdown"}
```markdown
Never include a call-to-action, sign-off, or closing pleasantry in your
response. End immediately after the last substantive sentence.
```
::

is likely to be followed exactly, where a vaguer instruction ("keep it brief and to the point") leaves more room for the model's own judgment about what counts as appropriately brief. But literalness also means an overly narrow or poorly-scoped instruction produces exactly the narrow, poorly-scoped behavior you asked for, not the behavior you actually wanted — the same specificity-cuts-both-ways point from Chapter 4, but worth re-emphasizing here because Claude's literalness makes the failure mode sharper and faster to trigger than on a model that tends to infer more charitably around an ambiguous instruction.

## Encouraging (Not Just Tolerating) Pushback

Claude models are trained to be willing to disagree, flag concerns, or decline a request outright when something in the prompt seems mistaken, harmful, or underspecified in a way that matters — and prompting that explicitly invites this tends to surface more of it than leaving it implicit:

::code-wrapper{language="markdown"}
```markdown
If any part of this task seems ambiguous, based on a mistaken premise,
or likely to produce a worse outcome than an alternative approach, say
so explicitly before proceeding rather than making a silent assumption
and continuing.
```
::

This connects directly to Chapter 11's point about honest uncertainty reporting: a system prompt that only ever asks for compliance ("complete the following task") implicitly discourages a model from raising a concern, even when it has one, simply because raising it wasn't modeled as an acceptable response shape. Explicitly authorizing pushback in the system prompt measurably changes how often a model exercises it.

## Portability Considerations

None of the conventions above are exclusive to Claude in the sense of being unusable elsewhere — XML tags are readable by any model, and a well-structured system prompt helps any instruction-following model. What's Claude-specific is the *degree* to which these particular conventions were reinforced in training, which is why they produce a larger, more consistent improvement here than on a model trained with different conventions emphasized. Chapter 16 covers what changes when porting a Claude-optimized prompt to a different model family, and it's worth reading this chapter's techniques with that portability question already in mind: a prompt that relies heavily on Claude-specific tag conventions is not "broken" on another model, but it may need re-tuning to hit the same reliability bar.

## 💡 Tips & Tricks

- **Idiom** — Use closing tags that echo the opening tag name exactly (`<document>...</document>`, not `<document>...</end>`) — mismatched or vague closing tags are more likely to be misread as content rather than structure, especially in long prompts with several nested sections.
- **Structure** — When a prompt needs the model to reference multiple distinct pieces of content (several documents, several examples), give each its own uniquely-named tag (`<document_1>`, `<document_2>`) rather than repeating a generic tag name — this lets you unambiguously ask "compare `<document_1>` and `<document_2>`" later in the same prompt.
- **Debug** — If a Claude response is ignoring a constraint you're sure you wrote clearly, check whether it's buried in the middle of a long, undifferentiated system prompt rather than its own clearly labeled section — the literalness Claude applies to instructions it registers as instructions doesn't help if the instruction gets lost in unstructured prose first.
- **Performance** — For genuinely hard reasoning tasks, try extended thinking with a meaningful token budget before reaching for an elaborate hand-crafted chain-of-thought prompt — it's often the lower-effort first attempt, with hand-crafted reasoning scaffolds reserved for cases where you know a specific reasoning structure outperforms the model's own default approach.
- **Idiom** — Explicitly inviting pushback ("tell me if this seems wrong") costs one sentence in a system prompt and measurably increases how often a real problem in the request actually gets surfaced instead of silently worked around.

## ⚠️ Edge Cases & Gotchas

- **Over-tagging a short prompt adds structure with no benefit and some cost.** A two-sentence request wrapped in five nested XML tags is harder for a human to review and doesn't help the model, which handles short, unambiguous prompts fine without extra scaffolding — reserve heavy tagging for prompts long or complex enough that boundary confusion is a real risk (Chapter 8's context-crowding concerns).
- **A system prompt section that contradicts itself across headers gets applied inconsistently**, not resolved by the model choosing "the more important" instruction — a `## Tone` section that says "always be concise" and a separately-written `## Constraints` section that requires a lengthy mandatory disclaimer on every response are in tension, and which one wins can vary by turn. Resolve contradictions explicitly yourself rather than trusting the model to prioritize consistently.
- **Extended thinking budget is not a substitute for a well-scoped task.** Giving a large thinking budget to a genuinely underspecified prompt (Chapter 4) produces more elaborate reasoning toward the wrong goal, not a correct answer — thinking budget improves reasoning quality on a well-posed problem; it doesn't compensate for an ambiguous one.
- **Claude's literalness can produce a technically-compliant but absurd result on a badly-scoped constraint** — "never use the word 'error'" taken completely literally can result in awkward circumlocutions ("the operation did not complete as expected") rather than the natural phrasing a human would understand was actually intended. When a literal reading could go somewhere you don't want, state the intent behind the constraint, not just the constraint itself.
- **Prefilled or tag-anchored output can silently fail if the model's actual response doesn't close the tag you expected**, particularly under a strict `max_tokens` cutoff — a response truncated mid-tag will fail naive parsing that assumes a well-formed closing tag always arrives; treat tag-based parsing with the same truncation-awareness Chapter 7 recommends for JSON output.

## 🧠 Spot the Issue

::code-wrapper{language="markdown"}
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

Two problems compound here. First, the system prompt directly contradicts itself: "be concise" and "always provide a thorough, detailed explanation... covering all considerations exhaustively" are asking for opposite response shapes with no resolution rule between them, so which instruction the model leans on for a given response is inconsistent rather than reliably one or the other — this is the self-contradicting-sections gotcha above, just inside a single flat paragraph instead of across headers. Second, the prompt has no structural separation between instructions and the document content — "be concise," the reasoning instruction, and "summarize the key points" are all flat prose sitting directly next to a 50-page document with no tags or headers distinguishing "things to do" from "content to act on," which is exactly the long, undifferentiated-context scenario where Claude's XML-tagging convention earns its keep and is conspicuously absent here. The fix is to resolve the contradiction explicitly (decide whether you want concise or exhaustive, or specify which applies to which part of the response — e.g., exhaustive reasoning, concise final summary) and wrap the document and the instructions in separate, named tags so a 50-page reference document isn't competing with the instructions for the same undifferentiated attention.

**The lesson**: self-contradicting instructions and unstructured mixing of long reference content with directives are both silent reliability killers — resolve the contradiction yourself and use tags to separate content from instructions before asking the model to do the hard part.

</details>

## Key Takeaways

- Model-specific conventions are a layer on top of the model-agnostic fundamentals (clarity, structure, decomposition), not a replacement for them — a Claude-optimized prompt that's vague or contradictory still fails for the same reasons any vague or contradictory prompt fails.
- Claude system prompts respond well to explicit, clearly-labeled sections (role, tone, constraints) rather than one undifferentiated paragraph, mirroring Chapter 2's prompt anatomy made structurally explicit.
- XML tags are Claude's most distinctive convention — they reliably delimit content from instructions, especially valuable in long prompts mixing reference material with directives, and enable clean prefill/parsing boundaries.
- Extended thinking is a dedicated reasoning phase with its own token budget, distinct from prompted chain-of-thought — it raises the ceiling on unaided reasoning for hard problems but doesn't replace a specific reasoning structure you already know works, and it can't compensate for an underspecified task.
- Claude tends to follow instructions literally, which makes precise constraints unusually reliable but also makes poorly-scoped constraints fail in exactly the narrow way they were written, not the way you actually intended.
- Explicitly inviting disagreement or flagged concerns in a system prompt measurably increases how often a real problem in the request surfaces, rather than being silently worked around — a direct application of Chapter 11's honest-uncertainty principle to model behavior design.
