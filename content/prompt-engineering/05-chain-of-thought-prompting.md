# 05 — Chain-of-Thought Prompting

## The Core Idea

**Chain-of-thought (CoT) prompting** means asking a model to work through a problem in explicit intermediate steps before giving a final answer, rather than jumping straight to the answer. The classic trigger phrase — "let's think step by step" — became famous because appending it to a prompt measurably improved accuracy on reasoning-heavy tasks (arithmetic, logic puzzles, multi-step word problems) across many models, without changing anything else about the prompt.

Why does this work, mechanically? Recall from Chapter 1 that generation is autoregressive — each new token is conditioned on everything generated so far, including the model's own prior output in this response. When a model jumps straight to a final answer, it has to arrive at the correct result in effectively one shot, with no intermediate "scratch space" to build on. When it's allowed (or instructed) to write out intermediate steps, those steps become part of the context that later tokens condition on — the model is, in a real sense, using its own generated text as working memory, and each step narrows the space of plausible next steps. This is the single biggest mechanistic idea to hold onto in this chapter: **CoT doesn't make the model "think harder" in some abstract sense — it gives the model more tokens of relevant, self-generated context to condition the final answer on.**

## Zero-Shot CoT: The One-Line Trick

The simplest form of CoT requires no examples at all — just an instruction:

::code-wrapper{language="markdown"}
```markdown
A store had 142 units of a product. They sold 37% of their stock on Monday,
then received a shipment of 60 more units. On Tuesday they sold 28 units.
How many units are left?

Think through this step by step before giving your final answer.
```
::

Without the "think step by step" instruction, a model asked to answer this directly has a meaningfully higher chance of arithmetic slip-ups (recall from Chapter 1 that multi-digit arithmetic is genuinely harder for LLMs than it looks, because it's pattern completion over tokens, not true digit-by-digit computation). With the instruction, the model is far more likely to write out something like:

::code-wrapper{language="markdown"}
```markdown
Starting stock: 142 units
Sold 37% on Monday: 142 × 0.37 = 52.54, round to 53 units sold
Remaining after Monday: 142 - 53 = 89 units
Received shipment: 89 + 60 = 149 units
Sold on Tuesday: 149 - 28 = 121 units

Final answer: 121 units remain.
```
::

...and each intermediate line is a **checkpoint the model can verify against** as it continues — if the running total is nonsensical (negative, absurdly large), that's visible in the token stream and can influence correction in a way that a single hidden mental step cannot.

## Few-Shot CoT: Demonstrating the Reasoning Pattern

You can combine CoT with the few-shot technique from Chapter 3 by showing worked examples that include the reasoning, not just the final answer:

::code-wrapper{language="markdown"}
```markdown
Q: A cafe sells cups of coffee for $4 and pastries for $3. On a day they
sold 45 coffees and 20 pastries, but 3 pastries were returned for a refund,
what was their net revenue?

A: Coffee revenue: 45 × $4 = $180
Pastry revenue before returns: 20 × $3 = $60
Refunds for returned pastries: 3 × $3 = $9
Net pastry revenue: $60 - $9 = $51
Total net revenue: $180 + $51 = $231
The answer is $231.

Q: A parking garage charges $5 for the first hour and $2 for each
additional hour. A customer parked for 6 hours but has a coupon for 25%
off the total. What did they pay?

A:
```
::

This is especially valuable when the reasoning *style* itself matters — e.g., you want the model to always check units, always state assumptions explicitly, or always structure reasoning in a particular sequence specific to your domain (like always checking eligibility criteria before computing a benefit amount). Zero-shot CoT gets you "some reasoning"; few-shot CoT gets you reasoning shaped the way you need it.

## When CoT Helps

CoT provides the largest, most reliable gains on tasks that are:

- **Multi-step and compositional** — where the final answer genuinely depends on correctly completing several intermediate sub-computations in sequence (arithmetic word problems, multi-step logical deduction, planning tasks).
- **Prone to a specific, identifiable error mode** if skipped — e.g., "jumping to a conclusion without checking all the constraints" in a constraint-satisfaction problem.
- **Reasoning-shaped rather than lookup-shaped** — tasks where the answer is *derived*, not *recalled*. If the model already "knows" the answer as a fact from training (e.g., "what's the capital of France"), CoT adds nothing and just adds latency.
- **Verifiable at each step** — if you (or a downstream process) can check the intermediate steps, CoT also gives you an audit trail, not just better accuracy. This matters enormously for anything high-stakes: a wrong final answer with visible, checkable reasoning is far more useful (and far more debuggable) than a wrong final answer with no explanation.

## When CoT Adds Noise Instead of Value

CoT is not free, and reflexively adding "think step by step" to every prompt is a common overcorrection. Situations where it can actively hurt:

- **Simple factual or classification tasks.** Asking a model to "think step by step" before classifying a clearly positive product review as POSITIVE or NEGATIVE adds latency and cost for no accuracy benefit, and can occasionally cause the model to overthink a simple case into an incorrect, more nuanced-sounding but wrong answer — talking itself out of the obviously correct response by generating unnecessary hedging or alternative framings.
- **Latency-sensitive interactive applications.** Every token of visible reasoning is a token the user has to wait for (or that streams before the "real" answer starts appearing in a way that's useful to them). For a live chat interface where response speed matters, gratuitous CoT on easy queries directly hurts user experience for no quality gain.
- **Tasks where the "reasoning" is actually just narrative padding.** A model can produce text that *looks* like step-by-step reasoning without the steps being genuinely load-bearing for the final answer — sometimes called "unfaithful" reasoning, where the stated steps don't actually determine the conclusion the way they appear to. This is a real, documented phenomenon: reasoning-shaped text is not automatically reasoning-*grounded* text. Don't assume that because an output *contains* step-by-step-looking text, the final answer is actually more reliable — verify against known-correct cases (Chapter 19) rather than trusting the presence of visible steps as proof of correctness.
- **Creative or subjective generative tasks with no "correct" answer to derive.** Asking a model to "think step by step" before writing a poem or a piece of marketing copy is usually a category error — there's no computation to walk through, and forcing a reasoning structure onto an inherently non-computational task can produce stilted, mechanical output.

## Extended Thinking / Reasoning Models

Beyond prompting a standard model to show its work, some current-generation models (as of this writing, this includes specific modes on Claude, GPT, and Gemini model families — check each provider's current documentation, since this area moves fast) support a distinct mechanism sometimes called **extended thinking** or **reasoning mode**. Rather than you asking for visible reasoning in the final response text, the model is given a separate internal "thinking" budget or scratchpad where it can reason at length before producing its user-facing answer — and this thinking is often handled distinctly from the final response (sometimes shown to you in a collapsed/summarized form, sometimes not shown at all, sometimes billed differently from output tokens).

The conceptual distinction that matters for prompting purposes:

| | Prompted CoT | Extended thinking / reasoning mode |
|---|---|---|
| How it's invoked | You ask for it explicitly in the prompt ("think step by step") | Often a model/API-level setting, sometimes automatic based on task difficulty |
| Where the reasoning appears | Inline, as part of the visible response text | Frequently in a separate channel — visible only as a summary, or not exposed to you at all, depending on the provider and settings |
| Reasoning depth | Whatever the prompt elicits — can be shallow if not carefully prompted | Often deeper and more thorough by design, sometimes with an adjustable "how much effort" setting |
| When it activates | Every time you ask for it, even on trivial inputs, unless you're careful | Increasingly, providers are building models that adaptively decide how much reasoning a given problem needs, reducing the "wasted CoT on easy tasks" problem somewhat automatically |

Practical implication: on a model that supports a genuine extended-thinking mode, you often get better results by using that mode's dedicated setting/parameter rather than trying to simulate it with a "think step by step" instruction in the prompt — the dedicated mechanism is typically trained and optimized specifically for deep reasoning in a way that a plain prompt-level instruction can only approximate. Check the specific model/provider's current documentation for how to enable and configure this, since exact parameter names, defaults, and behavior differ across Claude, GPT, and Gemini and change over time. Chapter 15 covers Claude-specific extended thinking conventions in more depth.

## CoT and Output Format: A Common Conflict

A frequent practical problem: you want both step-by-step reasoning *and* a clean, structured final output (say, JSON) for downstream parsing. Interleaving them in one response can be awkward — either the JSON is now buried after prose reasoning (making naive parsing fail), or you suppress the reasoning to keep the output clean (losing the accuracy benefit).

The standard solution is to **separate the reasoning from the final structured answer explicitly**, either via a two-part response format or, better, a two-call pipeline:

::code-wrapper{language="markdown"}
```markdown
First, reason through the problem step by step inside <reasoning> tags.
Then, after your reasoning, output your final answer inside <answer> tags
as a JSON object matching this schema: {"category": string, "confidence":
"low" | "medium" | "high"}. Nothing should appear after the closing
</answer> tag.
```
::

This lets you parse deterministically: extract everything inside `<answer>` and discard (or separately log, for debugging) everything inside `<reasoning>`. See Chapter 7 for more on structured output patterns, and Chapter 10 for the alternative approach — using a separate reasoning call and a separate, format-only extraction call as two steps in a pipeline, which cleanly avoids ever mixing the two concerns in one response.

## 💡 Tips & Tricks

- **"Think step by step" is a floor, not a ceiling** — the bare phrase is a reasonable default, but you'll often get better results by specifying *what kind* of steps you want: "list the relevant constraints first, then check each option against them, then state your conclusion" gives the model a specific reasoning scaffold rather than an open-ended "think about it" instruction.
- **Ask for reasoning before the answer, never after** — because generation is autoregressive, reasoning that appears *after* a stated answer can't have influenced that answer (the answer was already committed to before the reasoning tokens were generated). If you want reasoning to actually inform the answer (not just retroactively justify it), the prompt must be structured so reasoning comes first in the generated output.
- **Use CoT to debug prompts, even if you don't ship it** — When a zero-shot prompt is failing mysteriously, temporarily add "think step by step" and inspect the reasoning trace. It often reveals *which* assumption or ambiguity is causing the failure (see Chapter 4), which you can then fix with a clearer instruction — sometimes letting you remove the CoT instruction afterward because the underlying ambiguity is gone.
- **Cap the reasoning length for cost-sensitive production paths** — If you've confirmed CoT helps but you're running at scale, consider instructing a bounded reasoning length ("reason in at most 4 short steps") rather than leaving it fully open-ended, which controls both cost and the risk of the model wandering into unhelpful tangents.
- **CoT plus self-consistency is a strong combo for high-stakes decisions** — generating several independent CoT traces for the same problem and checking whether they converge on the same answer is a more robust signal than trusting a single trace, especially for anything with real consequences. This is covered fully in Chapter 11.

## ⚠️ Edge Cases & Gotchas

- **Reasoning can be fluent and wrong at the same time.** A model can produce a chain of reasoning that reads as completely coherent, logical, and confident, while containing a subtle factual or arithmetic error partway through that invalidates the conclusion — and because each step conditions the next, one early error propagates and gets "confirmed" by everything that follows, since the model is now reasoning consistently *from* the mistake rather than toward the truth. Fluency of the reasoning trace is not evidence of its correctness — always verify against ground truth where possible (Chapter 11, Chapter 19).
- **Forcing a reasoning format can truncate the answer at the token limit.** If your prompt requests lengthy step-by-step reasoning *and* you have a `max_tokens` limit, the reasoning can consume the whole budget, cutting off before the final answer is ever produced. If you need a guaranteed final answer, either bound the reasoning length explicitly, request the answer first with reasoning after (if you don't need the reasoning to inform the answer, e.g., for post-hoc explanation only), or allocate a generous token budget with the final answer format made cheap and short to produce even at the end of a long trace.
- **"Think step by step" doesn't guarantee the model uses your intended steps.** Especially in zero-shot CoT, the model chooses its own reasoning structure, which may not match the structure you had in mind (e.g., it might reason about the wrong sub-problem first). If the *specific sequence* of reasoning matters for your task, use few-shot CoT with examples demonstrating that exact sequence, rather than trusting zero-shot CoT to invent the right structure on its own.
- **CoT doesn't fix tasks that are fundamentally about missing information, not missing reasoning.** If a prompt asks the model to determine something that genuinely isn't derivable from the given information (e.g., "what will the stock price be tomorrow" from historical data alone), CoT will produce confident-looking reasoning that arrives at a number anyway — the reasoning scaffold doesn't prevent the model from confabulating premises it needs but doesn't have. See Chapter 17 for handling genuine uncertainty rather than manufactured confidence.
- **Extended thinking/reasoning-mode budgets and prompted CoT can conflict or double up.** If you enable a model's dedicated extended-thinking parameter *and* also include a "think step by step" instruction in your prompt text, behavior can be redundant (paying for reasoning twice, in two different mechanisms) or, in some implementations, can interact in ways not well-documented for your specific provider and model version. Check current provider documentation before combining the two, rather than assuming they compose additively.

## 🧠 Spot the Issue

A developer building a loan pre-approval assistant wants the model to explain its reasoning for transparency, so they write:

::code-wrapper{language="markdown"}
```markdown
Determine whether this applicant qualifies for pre-approval. Think step
by step, and make sure your final answer is APPROVED or DENIED.

Applicant: credit score 710, annual income $58,000, requested loan
amount $340,000, existing monthly debt payments $1,200.

Approval requires: credit score >= 680, debt-to-income ratio (existing
monthly debt / monthly income) below 36%, and loan amount no more than
5x annual income.
```
::

The model produces a lengthy, confident-sounding chain of reasoning and concludes APPROVED. On manual review, a loan officer catches that the loan amount ($340,000) is actually 5.86x the annual income ($58,000), which fails the "no more than 5x annual income" rule outright — yet the model's own written reasoning trace claimed to have checked this exact criterion and stated it passed. What does this reveal about trusting a CoT trace, and what's the actual bug here (beyond "the model made a math error")?

<details>
<summary>Answer</summary>

The reasoning trace *looked* like it verified the constraint, but the underlying multiplication (5 × $58,000 = $290,000, then comparing $340,000 against that) either wasn't actually performed correctly or was performed and then misreported in the final restated conclusion — this is exactly the "fluent and wrong" failure mode: a chain of reasoning that reads as if it checked something can still get that specific check wrong, especially when it involves the same category of multi-digit arithmetic error covered in Chapter 1. The deeper lesson isn't just "watch for arithmetic slips" — it's that **a visible reasoning trace is not a verification mechanism by itself**; it's a debugging aid and an accuracy improvement on average, but any individual trace can still be wrong while looking entirely legitimate. For a high-stakes decision like loan approval, the correct fix is not "add more CoT instructions" but to **externalize the actual arithmetic and threshold checks into deterministic code** (compute the 5x multiple and the DTI ratio outside the model, in a tool call or the calling application, per Chapter 13) and use the model only for the parts of the task that genuinely require judgment — with CoT as a nice-to-have explanation layer on top of verified numbers, not as the source of truth for the numbers themselves.

**The lesson**: chain-of-thought improves average accuracy and gives you an inspectable trace, but it is not a substitute for actually verifying high-stakes numeric or rule-based decisions with deterministic computation — a model can narrate a check it didn't actually perform correctly, and the narration will look just as confident either way.

</details>

## Key Takeaways

- Chain-of-thought prompting asks the model to generate intermediate reasoning before a final answer, which works because autoregressive generation lets earlier reasoning tokens condition and improve later ones — it's giving the model more relevant self-generated context, not "making it think harder" in an abstract sense.
- Zero-shot CoT ("think step by step") is a cheap, effective default for multi-step or compositional reasoning tasks; few-shot CoT (demonstrating the reasoning pattern with examples) gives more control over the specific structure of the reasoning.
- CoT helps most on genuinely multi-step, derivation-based tasks and helps little or actively hurts on simple lookups, classifications, and purely creative/subjective tasks — it adds latency and cost that isn't always worth paying.
- A fluent, confident-looking reasoning trace is not proof of correctness — reasoning can be internally consistent and still wrong, especially on arithmetic or rule-checking, so high-stakes numeric decisions should be verified with deterministic computation, not trusted from the trace alone.
- Distinct from prompted CoT, many current models offer a dedicated extended-thinking/reasoning mode as an API-level setting — check current provider docs, since this is one of the fastest-moving areas of model capability and configuration.
