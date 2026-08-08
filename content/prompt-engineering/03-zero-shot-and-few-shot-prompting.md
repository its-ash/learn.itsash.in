# 03 — Zero-Shot and Few-Shot Prompting

## Zero-Shot: Just Asking

**Zero-shot prompting** means asking a model to perform a task with instructions alone — no examples of what a correct answer looks like. Modern frontier models are remarkably capable zero-shot, because their training data includes enough varied task-and-answer pairs that they've generalized the *pattern* of many tasks without needing you to demonstrate one.

::code-wrapper{language="markdown"}
```markdown
Classify the sentiment of this product review as POSITIVE, NEGATIVE, or MIXED.
Respond with only the label.

Review: "The build quality is fantastic and it feels premium, but the
battery life is genuinely disappointing for the price point."
```
::

For well-defined, common tasks (sentiment classification, translation, summarization, simple extraction), zero-shot is usually the right starting point — it's the cheapest prompt to write, the cheapest to run (no example tokens), and the easiest to maintain. The mistake is reaching for few-shot examples reflexively, before establishing that zero-shot actually fails at your specific task.

## Few-Shot: Showing, Not Just Telling

**Few-shot prompting** means including one or more input/output example pairs in the prompt before the real task, so the model can infer the pattern — the desired format, tone, level of detail, or edge-case handling — from demonstration rather than description alone.

::code-wrapper{language="markdown"}
```markdown
Classify the sentiment of each product review as POSITIVE, NEGATIVE, or MIXED.

Review: "Arrived on time, works exactly as described."
Sentiment: POSITIVE

Review: "Stopped working after two days, and support never responded."
Sentiment: NEGATIVE

Review: "The build quality is fantastic and it feels premium, but the
battery life is genuinely disappointing for the price point."
Sentiment:
```
::

Here the model isn't just told the three valid labels — it's shown two classification decisions being made, which implicitly communicates things that are hard to state in prose: how terse the ideal answer is (just the label, no explanation), how "MIXED" differs from a review that leans slightly one way, and the exact casing/format to reply with.

You can also implement few-shot via the conversation structure itself, using genuine `user`/`assistant` message pairs instead of inlining examples as text — both work, and which to use is mostly about whether you want the examples to look like "prior turns in this conversation" or "reference material provided in a single message":

::code-wrapper{language="json"}
```json
{
  "model": "claude-opus-5",
  "max_tokens": 10,
  "system": "Classify sentiment as POSITIVE, NEGATIVE, or MIXED. Reply with only the label.",
  "messages": [
    {"role": "user", "content": "Arrived on time, works exactly as described."},
    {"role": "assistant", "content": "POSITIVE"},
    {"role": "user", "content": "Stopped working after two days, and support never responded."},
    {"role": "assistant", "content": "NEGATIVE"},
    {"role": "user", "content": "The build quality is fantastic and it feels premium, but the battery life is genuinely disappointing for the price point."}
  ]
}
```
::

### When few-shot earns its cost

Few-shot examples cost tokens on every single request (unlike a one-time system prompt improvement, they scale with volume), so reach for them when:

- **The desired output format is unusual or hard to describe precisely in words** — e.g., a very specific citation style, a particular flavor of code comment, or a house style for summaries that's easier to demonstrate than enumerate.
- **The task has systematic edge cases** you want to pin down — e.g., "how do you classify a review that's sarcastic," shown via one well-chosen sarcastic example, rather than trying to write a rule that covers sarcasm in prose.
- **Zero-shot output is inconsistent across similar inputs** — if you send the same *kind* of request twice and get meaningfully different formatting or approaches, examples anchor the model to one consistent pattern.
- **You're working with a smaller or less capable model** that doesn't generalize instructions as reliably — few-shot examples matter more, not less, as model capability decreases, which is worth knowing if you're optimizing cost by using a cheaper model for a narrow task.

## How Many Examples? The Diminishing Returns Curve

A common beginner assumption is "more examples = better performance," extrapolated linearly. In practice the relationship looks more like a curve that rises quickly and then flattens — and can even *decline* past a certain point for a specific, important reason covered below.

| Examples | Typical effect |
|---|---|
| 0 | Baseline zero-shot performance — often fine for common, well-specified tasks. |
| 1 | Usually a meaningful jump — establishes format and register. Also risky: with only one example, the model has nothing to distinguish "this specific detail" from "the general pattern" (see below). |
| 2–5 | Usually the sweet spot for most classification/extraction/formatting tasks — enough to show variation across cases without bloating the prompt. |
| 5–20 | Helpful for tasks with many distinct categories/edge cases that each need representation; diminishing returns per additional example. |
| 20+ | Rarely worth it in-context for most tasks; if you need this many examples to pin down behavior, consider whether the task is better solved with retrieval (Chapter 12), a lookup table, or fine-tuning outside the scope of prompting. |

The steepest jump is almost always **zero-shot to one- or two-shot**. Beyond roughly five well-chosen, diverse examples, you are usually better off spending your effort improving *which* examples you include rather than adding more of them.

## Example Selection Matters More Than Example Count

Which examples you pick shapes the model's behavior far more than how many you include. A poorly chosen set of examples can actively teach the wrong pattern — this is one of the more counterintuitive failure modes in prompt engineering, because it looks like you're "helping" the model by showing it real cases.

### The accidental-pattern trap

Suppose you're building a few-shot prompt to extract structured data from customer emails, and all three of your examples happen to be emails where the customer's name appears in the first sentence:

::code-wrapper{language="markdown"}
```markdown
Extract the customer's name and issue from the email.

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

Every example so far demonstrated "name appears at the start, extract it, done." The fourth email deliberately puts the name at the *end* — a completely realistic pattern in real customer emails (a sign-off). A model that has over-indexed on the surface pattern of the examples (rather than the underlying task, "find the name wherever it is") has a meaningfully higher chance of failing here than a zero-shot prompt would, because the few-shot examples taught a narrower rule ("name is always first") than the one you actually wanted ("name is anywhere in the text"). This isn't a hypothetical — narrow or homogeneous examples reliably produce narrower generalization than the task actually requires.

**The fix**: deliberately vary the *irrelevant* surface features across your examples (where in the text information appears, sentence length, tone, formatting) while keeping the *relevant* pattern (the actual extraction task) constant. If all your examples are easy and similar, you've taught the model to expect easy and similar inputs.

### Example ordering effects

The order examples appear in a prompt also measurably affects output — this is sometimes called order sensitivity or recency bias in few-shot prompting. Two documented effects to be aware of:

- **The most recent example (closest to the actual task) tends to have outsized influence** relative to earlier ones, especially on format and tone specifics. If your last example before the real input happens to be an edge case, the model may over-apply that edge case's handling to a normal input.
- **If examples are presented in a suspiciously sorted or patterned order** (e.g., all positive examples, then all negative, then the real task is negative), the model can pick up on positional patterns rather than content patterns — particularly relevant for classification tasks where you want the model to genuinely evaluate content rather than guess based on "well, the pattern so far suggests this one is probably category X too."

**The fix**: shuffle your few-shot examples so they don't correlate with any positional pattern, and if you have a "hardest" or most nuanced example, consider placing it last (closest to the real task) specifically because of the recency effect — you want the freshest, most relevant example to be the trickiest one, not the easiest one.

## When Few-Shot Hurts

Few-shot isn't free, and it isn't always positive-or-neutral. Concrete failure modes:

- **Token cost compounds at scale.** Five examples averaging 100 tokens each is 500 tokens spent on every single request — for a high-volume production classifier, that's real, ongoing cost for a benefit that a well-written instruction might have delivered for free. Always try to tighten the instruction first; add examples only when instruction-tightening plateaus.
- **Examples can anchor the model to your exact phrasing**, producing outputs that echo your example's specific word choices even when a different phrasing would be more natural for the actual input. This shows up often in generative tasks (not just classification) — a single example with a distinctive turn of phrase can get echoed across many different generated outputs, especially at lower temperature settings.
- **Stale examples silently rot.** If your product or domain changes (new category added, new edge case emerges) and your few-shot examples aren't updated to reflect it, the prompt actively steers the model toward outdated behavior — this is a maintenance liability that a purely instruction-based prompt doesn't carry to the same degree, since the instructions can be updated in one place without needing new demonstration data.

## 💡 Tips & Tricks

- **Start at zero-shot, always** — Even if you're confident you'll need few-shot, write and test the zero-shot version first. It establishes your true baseline, and often the "confident" assumption turns out wrong — many tasks that look like they need examples work fine with a more carefully worded instruction instead, at zero ongoing token cost.
- **Use few-shot to fix specific observed failures, not hypothetical ones** — The best few-shot examples are ones you add *after* seeing your zero-shot prompt fail on a real case. Add that exact case (or a close variant, anonymized if needed) as an example, rather than speculatively front-loading examples for failures you imagine might happen.
- **Diversity budget: cover your input distribution, not your imagination** — If you have production data, sample your few-shot examples from the actual distribution of real inputs (including boring, typical ones) rather than hand-crafting examples that only cover the interesting edge cases — a set of examples that's all edge cases teaches the model that every input is an edge case.
- **Mix easy and hard examples, but end on hard** — Given the recency effect on the example closest to the real task, if you have one especially tricky or nuanced example, place it last among your demonstrations.
- **Few-shot for style, zero-shot with strict rules for logic** — For subjective stylistic tasks (matching a tone, a formatting convention), a couple of good examples is often the highest-leverage thing you can do. For tasks that are really about following an exact rule (an eligibility check, a business logic branch), a precisely worded zero-shot instruction with explicit conditionals is often more robust than trying to have examples "imply" the rule.

## ⚠️ Edge Cases & Gotchas

- **A single example can be worse than zero examples.** With exactly one example, the model has no way to distinguish which aspects of that example are the general rule and which are incidental to that specific case (see the accidental-pattern trap above). If you can only afford one example, make sure it's genuinely representative and not accidentally full of coincidental patterns — or seriously consider whether a clearer zero-shot instruction would be safer.
- **Few-shot examples that are all correct can hide the model's actual boundary behavior.** If none of your examples show what an *invalid* or *out-of-scope* input should produce, the model has no guidance for what to do when the real input doesn't fit any category — it will pick the closest match rather than flag the mismatch. If "doesn't fit any category" is a real possibility in production, include an example of that explicitly.
- **Few-shot doesn't reliably teach counting or exact quantities.** Showing the model three examples of "extract the top 2 keywords" doesn't robustly teach it to *always* produce exactly 2 — it may drift to 1 or 3 on a different input, because the pattern it extracted was "produce a short list of keywords," not "produce exactly the integer 2." For hard numeric constraints, state the number explicitly in the instruction rather than relying on the examples to imply it.
- **Fake assistant-turn examples must not contain instructions to the model.** If a few-shot example (written in the `assistant` role) includes meta-text like "Sure, here's the answer:" before the actual content, the model may learn to reproduce that meta-text as part of the desired output pattern, not just the substantive content — check your examples don't contain artifacts of *how you produced them* (e.g., if you copy-pasted a real model response as your example, strip any conversational wrapper it added).
- **Very long individual examples can dominate a short prompt's budget disproportionately.** If one of your few-shot examples happens to be much longer than the others (e.g., it includes a lengthy input document), it can consume a large fraction of the prompt's effective attention purely by length, independent of its actual representativeness. Keep example lengths roughly comparable unless there's a specific reason not to.

## 🧠 Spot the Issue

A team builds a few-shot prompt to classify support tickets by urgency (LOW, MEDIUM, HIGH). All three of their examples are drawn from tickets submitted in the last hour of a single day, during an actual outage — so all three examples are HIGH urgency, and all three happen to contain the word "urgent" somewhere in the text:

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

In testing, the team finds the model reliably classifies clearly low-urgency tickets as MEDIUM or even HIGH, especially if the ticket text happens to include emphatic punctuation or the word "please." What went wrong, and why does the real ticket at the end — which is a textbook LOW-urgency case — put the model at risk of misclassifying?

<details>
<summary>Answer</summary>

Two compounding problems. First, **the example set has zero label diversity** — all three examples are HIGH, so the model has never seen what a LOW or MEDIUM example looks like; it can only infer the *boundary* of urgency by pattern-matching lexical surface features (words like "urgent," exclamation points) that happened to co-occur with HIGH in this particular sample, rather than the actual underlying signal (business impact, blocking vs. non-blocking, scope of effect). Second, because all examples came from a single outage event, they share incidental surface features (emphatic tone, exclamation marks, similar vocabulary) that aren't the real classification signal — the model has no way to know that urgency is about *impact*, not *tone*, because tone and impact happened to be perfectly correlated in every example it saw.

**The lesson**: a few-shot set needs coverage across the *output space* (here, include at least one LOW and one MEDIUM example, not just HIGH) and diversity in *surface features that aren't supposed to matter* (tone, punctuation, phrasing) so the model can distinguish the true classification signal (business impact) from incidental correlation (emphatic language) in your sample.

</details>

## Key Takeaways

- Zero-shot (instructions only) should be your default starting point — it's cheaper, easier to maintain, and sufficient for most common, well-specified tasks with capable modern models.
- Few-shot (including example input/output pairs) helps most when the desired format is hard to describe in prose, when you need to pin down specific edge-case handling, or when zero-shot output is inconsistent across similar inputs.
- Performance gains from adding examples follow a steep-then-flat curve — the jump from 0 to 1–2 examples is usually the largest, and returns diminish sharply past roughly five well-chosen examples.
- Which examples you choose, and their diversity across irrelevant surface features, matters more than how many you include — homogeneous or coincidentally-patterned examples can actively teach a narrower or wrong rule.
- Example order affects output: the example closest to the real task tends to have outsized influence, so place your trickiest, most representative example last.
