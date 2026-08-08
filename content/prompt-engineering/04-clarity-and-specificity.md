# 04 — Clarity & Specificity

## Ambiguity Is the Default State of Natural Language

Human language is riddled with ambiguity that we resolve effortlessly using shared context, tone of voice, and real-world knowledge — none of which an LLM has unless you supply it explicitly in the prompt. Every sentence you write has a space of plausible interpretations, and the model has to pick one. Vague prompts don't fail because the model is "not smart enough" — they fail because you under-specified the problem and the model correctly, faithfully answered a *different, equally valid* reading of it.

Consider: "Summarize this article." Summarize for whom? At what length? Preserving what — key facts, the author's argument, actionable takeaways? Formal or casual? A model has to make a decision on every one of these axes, and it will make *some* decision, silently, because "summarize" itself doesn't encode any of that information.

The core discipline of clarity and specificity is: **identify every axis along which your request is actually ambiguous, and decide explicitly, in the prompt, rather than letting the model guess.** This chapter is about training yourself to see the ambiguity that's invisible to you (because you know what you meant) but very much present to the model (which only has the text).

## A Worked Example: The Cost of Vagueness

::code-wrapper{language="markdown"}
```markdown
Write a product description for our new wireless earbuds.
```
::

This will produce *something* — plausibly decent, generic marketing copy. But every one of these was left to chance:

- Length (one sentence? Three paragraphs?)
- Target audience (audiophiles? casual gym-goers? gift buyers?)
- Tone (playful startup voice? premium/luxury? technical spec-sheet?)
- What features to emphasize (battery life? noise cancellation? price? none specified)
- Whether to include a call to action
- Format (plain paragraph? bullet points? a title plus body?)

Now the specified version:

::code-wrapper{language="markdown"}
```markdown
Write a product description for our new wireless earbuds, the "Aria Pro."

Audience: existing customers browsing our e-commerce product page, most of
whom already own one of our older audio products and are comparison-shopping
against the previous generation.

Length: exactly 3 short paragraphs, no more than 60 words each.

Tone: confident and specific, not hype-driven. Avoid superlatives like
"revolutionary" or "game-changing." We're a brand known for understated,
engineer-focused copy.

Must mention: 30-hour battery life with the case, active noise cancellation
(new in this model, the previous generation didn't have it), and IPX4 water
resistance.

Do not mention: price (set elsewhere on the page) or compare directly to
named competitor products.

Format: no title/heading, just the three paragraphs, no bullet points.
```
::

This is a longer prompt, but every added sentence removed one axis of ambiguity that the model would otherwise have had to resolve arbitrarily. The output from the second prompt will be dramatically more likely to be usable without heavy editing — not because the model "tried harder," but because there was almost nothing left for it to guess.

### The diminishing-but-real returns of specification

Not every prompt needs this level of detail — for a one-off, low-stakes, exploratory request, over-specifying is wasted effort. The discipline is proportional: **the more the output will be used unedited, at scale, or by other people, the more worth it is to eliminate ambiguity up front**, because the cost of a wrong guess (re-running, editing, or shipping something subtly off) compounds with volume.

## Explicit Constraints Beat Implicit Assumptions

A related discipline: state constraints as constraints, not as assumptions you're hoping the model shares. "Keep it professional" assumes a shared, precise definition of "professional" that may not exist. "Don't use contractions, don't use emoji, address the reader as 'you' not 'the user,' and keep sentences under 20 words" is unambiguous and independently checkable — by you, in review, and implicitly by the model as it generates.

This matters especially for **quantitative constraints**. "Keep it short" is a suggestion the model interprets against its own sense of "short," which drifts across different types of content. "No more than 3 sentences" is a hard, checkable target.

::code-wrapper{language="markdown"}
```markdown
Explain what a foreign key is, but keep it short and simple, for someone
who isn't very technical.
```
::

versus

::code-wrapper{language="markdown"}
```markdown
Explain what a foreign key is in exactly 2 sentences. Assume the reader
has never written SQL but understands what a spreadsheet is — use a
spreadsheet analogy if it helps. Do not use the words "constraint,"
"integrity," or "schema."
```
::

The second version turns three vague adjectives ("short," "simple," "not very technical") into concrete, checkable rules: a sentence count, a specific analogy anchor, and an explicit vocabulary exclusion list. Notice the last constraint in particular — banning specific jargon words is often more effective than saying "avoid jargon," because "jargon" is itself a fuzzy category the model has to interpret, while a list of forbidden words is unambiguous.

## Positive vs. Negative Instructions: "Do X" vs. "Don't Do Y"

One of the most counterintuitive dynamics in prompt engineering is that **telling a model what *not* to do is often less reliable than telling it what *to* do instead** — and can sometimes backfire in a specific, mechanistic way.

### Why negative instructions are weaker

To process the instruction "don't mention pricing," the model's internal representation has to activate the *concept* of pricing (to know what it's supposed to avoid), and then separately suppress it. This is a strictly harder cognitive operation than "don't have pricing in your representation of the task at all," which is what a positive instruction achieves for free. The training data also contains vastly more examples of people directly discussing what they're avoiding (a common conversational move — "I won't mention the elephant in the room, but...") than of people cleanly omitting a concept with no trace, so the model has less signal for pure, clean suppression than you might assume.

Compare:

::code-wrapper{language="markdown"}
```markdown
Don't apologize excessively in your response, and don't say "I'm sorry"
more than once.
```
::

versus:

::code-wrapper{language="markdown"}
```markdown
If you can't fully complete the request, state plainly what you can do
and proceed with that. Use at most one brief acknowledgment of any
limitation; do not repeat it.
```
::

The second version tells the model what the *correct* behavior looks like (state what you can do, proceed), which gives it a positive target to generate toward, rather than only a thing to avoid — the "at most one" framing still bounds the negative case, but it's anchored to a described positive pattern rather than standing alone.

### The "don't think about X" backfire

There's a specific, well-documented failure mode sometimes called the **ironic rebound effect** in psychology, and something structurally similar shows up in LLM behavior: explicitly naming a thing you want to avoid can make the model *more* likely to produce it, not less — because naming it raises its salience/activation in the context, and the model's generation is influenced by everything active in context, including things flagged as forbidden.

::code-wrapper{language="markdown"}
```markdown
Write a bedtime story for a 5-year-old. Do not include anything scary,
do not mention monsters, do not include any conflict or danger, and
absolutely do not have a villain.
```
::

A model given this prompt has now had "monster," "scary," "danger," and "villain" all activated in its context as concepts, and — especially at higher temperature or with a less careful model — has a non-trivial chance of a monster or a scary moment showing up anyway, sometimes almost as if the concepts "leaked" in despite (or because of) being named. The more reliable version describes the desired *positive* content directly:

::code-wrapper{language="markdown"}
```markdown
Write a gentle, calming bedtime story for a 5-year-old about a rabbit who
can't fall asleep and asks the moon for help. Keep the tone soothing
throughout, with a peaceful resolution where the rabbit falls asleep happy.
```
::

Now there's nothing forbidden to accidentally activate — the desired content is fully and positively specified, and there's no "don't think about the villain" tension for the model to manage.

### When negative instructions are still the right tool

This doesn't mean negative instructions are always wrong — for a small, specific, well-defined set of behaviors (particularly formatting or mechanical constraints, as opposed to thematic/content constraints), a clear "don't" is fine and often necessary, especially when there's no natural positive phrasing:

::code-wrapper{language="markdown"}
```markdown
Do not include a markdown code fence around the JSON output — return the
raw JSON object only.
```
::

There's no meaningfully different "positive" way to say this that isn't more convoluted. The rule of thumb: **negative instructions work well for narrow, mechanical, unambiguous prohibitions** (don't wrap in code fences, don't add a trailing comma, don't exceed N words) and work poorly for **broad, thematic, or conceptually loaded prohibitions** (don't be scary, don't be biased, don't sound like an AI) — the broader and more conceptual the forbidden thing, the more you should reach for a positive description of the target behavior instead.

## Specificity in Constraints, Not Just Instructions

Clarity isn't only about the main instruction — it extends to every constraint and edge case you specify. A vague constraint is barely better than no constraint:

| Vague | Specific |
|---|---|
| "Keep responses concise." | "Keep responses to 2–3 sentences unless the user explicitly asks for more detail." |
| "Be careful with sensitive topics." | "If the user's message concerns self-harm, provide the crisis hotline number for their stated region and encourage them to contact a professional — do not attempt to counsel them yourself." |
| "Handle errors gracefully." | "If the input is missing a required field, return `{\"error\": \"missing_field\", \"field\": \"<name>\"}` instead of attempting to guess a value." |
| "Format nicely." | "Use Markdown: an H2 heading per section, bullet points for lists of 3 or more items, and a table only when comparing 2+ items across 2+ attributes." |

Each "specific" version is checkable — you (or an automated eval, see Chapter 19) can look at an actual output and determine pass/fail. The vague versions can't be checked at all; "concise" and "nicely" mean whatever the reader decides they mean after the fact, which is exactly the ambiguity you're trying to eliminate.

## 💡 Tips & Tricks

- **The "would a new teammate know this?" test** — Before sending a prompt, ask whether a new human teammate, given only the text of your prompt and no other context, would produce the output you want. If they'd have to guess at tone, scope, length, or edge-case handling, so will the model — and for the same reason (missing information, not lack of skill).
- **Quantify everything quantifiable** — Any time you're tempted to write "brief," "detailed," "several," "a few," or "appropriate," pause and ask if there's a number you actually have in mind. If there is, write the number. If there truly isn't (the right length genuinely depends on content), say so explicitly: "length should scale with complexity — a simple question gets 1-2 sentences, a multi-part question can go longer."
- **Define your own domain terms inline** — If your prompt uses a term with a specific meaning in your business (e.g., "Sev1," "at-risk customer," "qualified lead"), don't assume the model shares your definition even if the term is common in general usage — restate your specific definition in the prompt, briefly, every time it's used in a way where precision matters.
- **Write constraints as if they'll be graded** — For any prompt going into production, imagine handing the output to a strict reviewer with a checklist derived from your prompt. If a constraint in your prompt couldn't become a checklist item ("is this concise? — unclear, no way to verify"), rewrite it until it could.
- **Positive-frame first, negative-frame as backup** — When you catch yourself writing "don't do X," pause and ask what you want instead, and try phrasing that first. Reserve the negative form for cases where there's genuinely no clean positive equivalent or where you need an explicit, narrow, mechanical prohibition alongside the positive instruction.

## ⚠️ Edge Cases & Gotchas

- **Over-specification can also backfire — see Chapter 2 and Chapter 7 for rigid-format truncation.** Extremely long, rigid lists of constraints can cause the model to prioritize surface compliance with the *format* of your rules over the *substance* of the task, or can trigger truncation issues in constrained generation (covered in Chapter 7). Specificity is not the same as maximalism — the goal is "no remaining ambiguity on axes that matter," not "the longest possible prompt."
- **A precise-sounding number can be arbitrary and get treated as a hard target anyway.** If you write "summarize in exactly 3 sentences" but the content genuinely doesn't compress cleanly into 3 sentences, the model will often force it — producing one unnaturally long, comma-spliced "sentence" to hit the count, or dropping important content to fit. If the number is a soft target, say "approximately 3 sentences" or give a range ("2-4 sentences") rather than a hard exact count you don't actually need.
- **Ambiguity in multi-turn context compounds.** In a single-turn prompt, you can catch and fix an ambiguous phrase before sending it. In a multi-turn conversation, an ambiguous pronoun reference or underspecified follow-up ("can you make it shorter?" — shorter than what, the whole response or just one section?) inherits all the ambiguity of everything that came before it, and the model has to resolve the reference against a growing, sometimes contradictory context. See Chapter 8 for context management and disambiguation strategies specific to multi-turn conversations.
- **"Don't" instructions about the model's own behavior/identity are especially unreliable.** Instructions like "don't reveal you're an AI" or "don't mention you don't have access to real-time data" run into both the ironic-rebound problem and a deeper one: many models are trained with strong priors toward honesty about their own nature, and a prompt fighting that prior directly is fighting training, not just fighting the ironic-rebound effect. These specific categories of "don't" are worth flagging as unusually unreliable compared to ordinary content-based negative instructions.
- **Vague constraints tested only on "easy" inputs look fine until they don't.** A prompt with "handle edge cases sensibly" might work by coincidence on your test inputs (which didn't happen to be edge cases) and then fail unpredictably in production the first time a genuinely ambiguous input arrives. Test vague-looking constraints specifically against inputs designed to be ambiguous, not just your typical/happy-path examples — see Chapter 19 on building eval sets that include adversarial and boundary cases.

## 🧠 Spot the Issue

A team writes this instruction for an internal tool that drafts email replies to customer inquiries:

::code-wrapper{language="markdown"}
```markdown
Draft a reply to this customer email. Don't be too formal, but don't be
too casual either. Don't make it too long, but make sure it fully
addresses their question. Don't sound robotic or like a template.
```
::

They find that output quality is wildly inconsistent from one customer email to the next — sometimes appropriately warm and useful, sometimes stiff and oddly generic, with no clear pattern to when each happens. What's the underlying issue with this prompt, independent of any specific customer email it's applied to?

<details>
<summary>Answer</summary>

Every constraint in this prompt is a negatively-framed midpoint on a spectrum ("not too formal, not too casual," "not too long," "not robotic") with no anchor for where the actual target point is — "not too X, not too Y" describes an entire wide middle range, not a specific target, and gives the model nothing concrete to aim *for*, only vague zones to avoid. Because there's no positive description of the actual desired tone, length, or style, the model has to invent one from scratch on every single call, and — since generation involves an element of sampling, not a single deterministic lookup — it will land in a different part of that wide, underspecified middle range each time, which is exactly the inconsistency observed. None of these constraints could be turned into a checklist item: "is this too formal?" has no fixed threshold to check against.

**The lesson**: replace vague midpoint negatives with a concrete positive target — e.g., "Use a warm, direct tone, similar to how a helpful teammate would reply in Slack: complete sentences, no corporate boilerplate phrases like 'We appreciate your patience,' 3-5 sentences, and always end by directly answering their specific question in the first or second sentence." A concrete target produces consistent output; a description of what to avoid, without an anchor for what to aim for, produces however the model happens to land in an unbounded middle each time.

</details>

## Key Takeaways

- Ambiguity is the default state of any natural-language request — the model will resolve every unspecified axis (length, tone, scope, format) with some choice, and that choice is a guess unless you make it explicit.
- Specificity should be proportional to how much the output matters — quick exploratory prompts don't need exhaustive constraints, but anything going to production, running at scale, or being used unedited benefits heavily from eliminating ambiguity up front.
- Quantify wherever you can: numbers, explicit vocabulary lists, and concrete examples of the target beat vague adjectives like "brief," "professional," or "appropriate" every time.
- Positive instructions ("do X") are generally more reliable than negative ones ("don't do Y"), especially for broad, thematic prohibitions — naming a forbidden concept can paradoxically raise its likelihood of appearing (the ironic-rebound effect). Reserve negative framing for narrow, mechanical constraints with no natural positive phrasing.
- Every constraint in a production prompt should be checkable — if you can't imagine grading an output pass/fail against a constraint, it's still too vague to reliably shape the model's behavior.
