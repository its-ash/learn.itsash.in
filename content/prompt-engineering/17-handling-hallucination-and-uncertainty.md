# 17 — Handling Hallucination & Uncertainty

## What Hallucination Actually Is

"Hallucination" is the term for a model producing fluent, confident, plausible-sounding output that is factually wrong — a fabricated citation, a nonexistent API method, a legal case that doesn't exist, a biography detail invented wholesale. It's worth being precise about the mechanism, because the precision changes what prompting can and can't fix. A language model, at its core (Chapter 1), is trained to predict a statistically likely continuation of text given everything before it. It has no built-in mechanism that separates "things I'm recalling from training data with high confidence" from "things I'm generating because they're a plausible-sounding continuation" — both processes produce the same kind of fluent, grammatical, confident-sounding token stream, because fluency and confidence-sounding are properties of *how* text is generated, not signals the model is separately tracking about *whether the content is true*.

This means hallucination isn't a bug in the sense of an occasional malfunction — it's an expected consequence of the underlying mechanism, most likely to surface exactly where the model's training data was thin, contradictory, or absent: obscure facts, recent events past its training cutoff, exact citations and quotations, precise numerical details, and anything requiring the kind of exact lookup a model structurally cannot do reliably from parametric memory (the same limitation Chapter 13 cited as a reason to reach for a tool rather than trust unaided model output for exact facts).

## Why Prompting Can Help, But Can't Fully Fix It

No prompt can make a model's parametric knowledge more accurate than it actually is — if the training data didn't contain the fact, or contained it inconsistently, no amount of clever phrasing recovers information that was never reliably encoded. What prompting *can* do is change how the model behaves at the boundary of its knowledge: whether it fabricates a confident-sounding answer to fill a gap, or instead signals uncertainty, declines to answer, or asks a clarifying question. That behavioral shift is a real, substantial, and prompt-influenceable effect — it's just a different thing from making the model's knowledge more accurate, and conflating the two leads to over-trusting a "please don't hallucinate" instruction as if it were a fact-checking mechanism rather than a nudge on response *behavior*.

## The Naive Fix (And Why It's Weak)

::code-wrapper{language="markdown"}
```markdown
Don't hallucinate. Only tell me true things.
```
::

This instruction is close to useless on its own, for a structural reason: the model doesn't have a labeled internal flag for "this specific claim is a hallucination" that this instruction could suppress. Asking it not to hallucinate is asking it to distinguish confident-recall from plausible-generation at the moment of production, when — per the mechanism above — both processes look identical from the inside. It's a bit like telling someone "don't misremember things" — the instruction is well-intentioned but doesn't give the person any new capability to act on. What actually helps is more specific: giving the model an explicit, low-cost way to express partial confidence, forcing it to ground claims in provided material rather than parametric memory, and structuring the task so fabrication has a clear, nameable alternative.

## Prompting for Calibrated Uncertainty

A model given explicit permission — and a concrete format — for expressing partial confidence uses it far more than one given a binary "answer or refuse" framing:

::code-wrapper{language="markdown"}
```markdown
For each claim in your answer, tag it with your confidence:
[HIGH] — you're confident this is accurate based on well-established
  information.
[MEDIUM] — you believe this is likely correct but it's the kind of
  detail (exact date, exact figure, niche fact) where you could be wrong.
[LOW] — you're genuinely unsure and are providing your best guess; flag
  it clearly as such rather than stating it plainly.

If you cannot support a claim at even LOW confidence, state that you
don't know rather than guessing.
```
::

::code-wrapper{language="markdown"}
```markdown
Example output:

The company was founded in 2014 [HIGH]. Its headquarters moved to Austin
sometime around 2019 [MEDIUM] — I recall this but am not fully certain
of the exact year. I don't have reliable information on its current
employee count [LOW/UNKNOWN] and would recommend checking a current
source rather than relying on my answer for that figure.
```
::

This works because it changes the *response shape* the model is optimizing toward — a flat, uniformly confident answer is no longer the only available shape, and the explicit tagging format gives the model a concrete, low-friction way to express graded confidence instead of forcing an all-or-nothing choice between a fully confident claim and an outright refusal. This is the same principle Chapter 7 established for structured output generally: the model produces what the format makes easy to produce, and a format with no slot for "I'm not sure" tends to produce full confidence even when it isn't warranted, purely because there's nowhere else for the uncertainty to go.

## Grounding: Requiring Citations to Provided Material

The most reliable hallucination mitigation available through prompting is not asking the model to somehow "know" when it might be wrong — it's restructuring the task so the model's job is to work from material you provide, rather than from parametric memory, and requiring it to point to that material:

::code-wrapper{language="markdown"}
```markdown
Answer the question using only the information in the <sources>
provided below. For every factual claim in your answer, include a
citation in the form [source N] pointing to the specific source it came
from. If the sources don't contain enough information to answer fully,
say so explicitly rather than filling the gap from general knowledge.

<sources>
[source 1] {{retrieved document 1}}
[source 2] {{retrieved document 2}}
</sources>

Question: {{user question}}
```
::

This is precisely the retrieval-augmented pattern from Chapter 12, and the hallucination-mitigation framing here is the same mechanism restated: a model asked to *find and cite support* for each claim in a bounded, inspectable source set behaves very differently from one asked to *recall and state* a fact from its parametric memory, because the former task has a natural check built in — a claim that can't be traced to a citation is, by the task's own rules, out of scope, whereas a claim from parametric memory has no equivalent built-in check at all. The citation requirement also gives *you* a cheap verification mechanism: a human (or an automated check, Chapter 19) can spot-verify that a cited claim actually appears in the referenced source, something that's impossible to do against an uncited claim from parametric memory.

Grounding is not airtight, though — a model can still misread or over-generalize from a real source (citing source 2 for a claim source 2 doesn't quite support), which is a real failure mode distinct from pure fabrication and worth checking for separately rather than assuming "it cited something" is equivalent to "the citation is accurate."

## Explicitly Permitting "I Don't Know"

A surprisingly effective and frequently-omitted instruction is simply stating, in plain terms, that not knowing is an acceptable and expected outcome:

::code-wrapper{language="markdown"}
```markdown
It's fine, and expected, for you to not know the answer to some
questions — especially ones about recent events, niche technical
details, or exact figures. Saying "I don't know" or "I'm not sure, but
here's my best guess" is a better answer than a confident-sounding guess
presented as fact. You will not be penalized for expressing uncertainty
or declining to answer.
```
::

This matters because a model's default behavior, absent this kind of explicit permission, skews toward attempting a complete, confident-sounding answer — plausibly because the vast majority of its training data consists of people writing confidently (question-answering content, reference material, technical documentation rarely models an author saying "I don't know" mid-explanation), so a fluent, complete-sounding answer is a more statistically typical continuation than an honest hedge, independent of whether the content is actually correct. Explicitly telling the model that hedging or declining is an acceptable, rewarded response shape counteracts that default tendency directly, the same way the confidence-tagging format above gives uncertainty a concrete place to go rather than leaving a flat "answer or don't" choice as the only option.

## Asking the Model to Flag Its Own Risky Claims

A related technique: after a first answer is produced, ask the model to review its *own* output specifically for claims that are most likely to be wrong:

::code-wrapper{language="markdown"}
```markdown
Review the answer you just gave. Identify any specific factual claims —
names, dates, statistics, exact quotations, citations — that you are
not highly confident are accurate. List them separately, and for each,
state whether you'd recommend the reader independently verify it before
relying on it.
```
::

This is a direct application of Chapter 11's self-consistency and verification ideas, aimed specifically at hallucination rather than reasoning errors generally — and it inherits the same limitation flagged there: a model reviewing its own output for confidence is still using the same underlying judgment that produced the (possibly wrong) claim in the first place, so this catches genuinely useful cases (the model actually does have latent signal that a particular claim was shakier than the rest) without being a reliable universal detector. It's a meaningfully better-than-nothing check, not a guarantee — treat a "no risky claims found" result as weak evidence, not proof of accuracy, especially for claims your eval process (Chapter 19) considers high-stakes.

## Domains Where the Risk Is Structurally Highest

Some categories of task carry meaningfully elevated hallucination risk, independent of how well the prompt is written, because they ask the model to produce exactly the kind of precise, low-redundancy detail that's hardest for parametric memory to reproduce reliably:

| Task type | Why risk is elevated | Mitigation |
|---|---|---|
| Citations and bibliographic references | Exact titles, authors, years, and URLs are high-precision, low-redundancy facts | Require retrieval/grounding (Chapter 12); never trust an unverified generated citation |
| Legal case names and statute citations | Same precision problem, with high real-world stakes for being wrong | Ground in an actual legal database; treat any unverified citation as provisional |
| Version-specific software APIs | Training data mixes many library versions; the model can blend details across versions that never coexisted | Ground in current, version-specific documentation rather than relying on memory |
| Numerical statistics | Exact numbers are rarely memorized precisely; a plausible-sounding but wrong number is common | Require a cited source for any number that matters, or compute it via a tool (Chapter 13) |
| Recent events past training cutoff | The information may simply not exist in training data at all | Explicit "if this is after your knowledge cutoff, say so" instruction, or retrieval |

## 💡 Tips & Tricks

- **Debug** — When you suspect a hallucinated fact, ask the model directly, in a fresh turn, "how confident are you in that specific claim, and why?" — this sometimes (not reliably) surfaces a hedge the original answer didn't include, because the follow-up specifically asks the model to reconsider one claim in isolation rather than as part of a longer confident narrative.
- **Idiom** — Pair an uncertainty-tagging format (like the [HIGH]/[MEDIUM]/[LOW] example above) with a short explanation of *why* a claim is tagged at a given confidence level, not just the tag alone — the explanation itself is a useful signal to a human reviewer and tends to make the tagging itself more careful, since the model has to justify the label rather than just attach one.
- **Performance** — For any task where factual precision genuinely matters, grounding (Chapter 12's retrieval pattern) is a far higher-leverage investment than prompt wording alone — a well-grounded prompt with mediocre wording usually beats a beautifully-worded ungrounded prompt on actual factual accuracy.
- **Idiom** — Explicitly separate "creative" and "factual" sections within a single request when a task mixes both (e.g., "write a product description, but the specifications listed must exactly match the provided spec sheet") — an unmarked mix of creative latitude and required factual precision is a common source of the model applying creative-writing-style embellishment to the factual part.
- **Safety** — For any hallucination-sensitive production feature, log which claims were grounded (cited to a real source) versus ungrounded (from parametric memory) — this distinction is cheap to compute at generation time and expensive to reconstruct after the fact if a hallucinated claim causes a downstream problem.

## ⚠️ Edge Cases & Gotchas

- **A confidently-worded refusal is not the same as an accurate uncertainty signal.** A model can hedge on an actually-correct answer just as easily as it can confidently state a wrong one — calibration means confidence tracking actual correctness in both directions, and an over-cautious model that hedges everything is miscalibrated in the opposite direction from one that hallucinates confidently, with real costs (a user ignoring a correct answer because it was needlessly hedged).
- **Grounding fails silently when the retrieved sources themselves are wrong, outdated, or irrelevant** — a model faithfully citing a real but incorrect or stale source produces an answer that looks maximally trustworthy (specific citation, precise claim) while still being wrong, and a citation-format check alone won't catch this, only substantive verification of source quality will (Chapter 12's retrieval-quality concerns apply directly here).
- **Asking "are you sure?" repeatedly can degrade a correct answer into an incorrect hedge or reversal**, not just correct an actual mistake — a model pressed hard enough on a genuinely correct claim can flip to a wrong one to satisfy apparent pressure to reconsider, which is a distinct failure mode from the useful self-review technique above; a single, clearly-scoped self-review request tends to be more reliable than repeated adversarial "are you sure?" pressure.
- **A model can hallucinate the citation format itself, not just the fact** — producing a citation that looks structurally correct (plausible journal name, plausible year, plausible page numbers) but points to a source that doesn't exist at all is a well-documented failure mode, and it's more dangerous than an obviously-fabricated fact precisely because the citation's surface plausibility invites less scrutiny, not more.
- **Uncertainty tags can become a rote formatting exercise rather than genuine calibration** if the model is used to producing them in a fixed pattern — watch for a suspiciously uniform distribution of confidence tags (everything marked MEDIUM, for instance) as a sign the tagging has become a formatting habit rather than a substantive judgment, and treat that as a prompt or eval issue worth investigating (Chapter 19).

## 🧠 Spot the Issue

::code-wrapper{language="markdown"}
```markdown
Answer the user's question. Be accurate and don't make anything up. If
you're not sure, use your best judgment to give the most likely correct
answer anyway, since an incomplete answer is not helpful to the user.

Question: What was the exact vote count in the {{obscure 1970s local
election}}?
```
::

<details>
<summary>Answer</summary>

The instruction directly undermines its own stated goal: "don't make anything up" is immediately followed by "if you're not sure, give the most likely correct answer anyway" — which is, in effect, an explicit instruction to fabricate a plausible-sounding guess rather than disclose uncertainty, for exactly the category of fact (an obscure, low-redundancy, highly specific historical statistic) most likely to be outside reliable parametric memory in the first place. This is the naive "don't hallucinate" instruction from earlier in this chapter, made actively worse by then explicitly authorizing a confident guess as the fallback behavior instead of leaving room for a hedge or an "I don't know." The fix removes the contradiction and replaces the "guess anyway" fallback with an explicit permission to express uncertainty or decline: state that guessing confidently is worse than saying "I don't have reliable information on this and would be guessing if I gave you a specific number" and, if precision genuinely matters, ground the question in an actual source (an archived election record, a retrieval tool) rather than asking the model to produce a memorized figure at all.

**The lesson**: an instruction that says "don't hallucinate" but then tells the model to answer confidently anyway when uncertain is not a hallucination mitigation — it's an explicit request for one, dressed up in language that sounds like the opposite.

</details>

## Key Takeaways

- Hallucination is an expected consequence of how language models generate text, not an occasional malfunction — fluency and confidence-sounding are properties of generation, not a signal the model separately tracks about truthfulness, which is why "just don't hallucinate" instructions are weak on their own.
- Prompting can reliably change *behavior at the boundary of knowledge* (whether the model hedges, cites, or declines) but cannot make parametric knowledge more accurate than it actually is — grounding in retrieved sources (Chapter 12) is the strongest available lever, not clever wording alone.
- Give uncertainty a concrete place to go — explicit confidence tagging, citation requirements, and plain permission to say "I don't know" all work by giving the model a viable response shape other than full confidence, not by asking it to somehow detect its own fabrication.
- Grounding requires claims to be traceable to provided sources, which gives both the model and a human reviewer something concrete to check — but a faithfully-cited wrong or stale source still produces a wrong answer, so citation presence is not the same as citation quality.
- Precision-heavy, low-redundancy tasks (citations, exact statistics, version-specific APIs, recent events) carry structurally elevated hallucination risk regardless of prompt quality, and should default to retrieval or tool-based grounding rather than parametric recall.
- Self-review for risky claims (Chapter 11's verification pattern applied to hallucination specifically) is a useful additional check, not a reliable detector — and repeated adversarial "are you sure?" pressure can degrade a correct answer as easily as it corrects a wrong one.
