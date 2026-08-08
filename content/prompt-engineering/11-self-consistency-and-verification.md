# 11 — Self-Consistency & Verification

## The Model That Grades Its Own Homework

A recurring intuition when a model produces a questionable answer is "just ask it to check its own work." This chapter is about when that intuition is right, when it's a placebo, and the more rigorous techniques — sampling multiple independent answers and comparing them, and structured multi-pass verification — that actually move the needle on catching errors, rather than just producing text that *looks* like it moved the needle.

## Why Naive Self-Verification Often Doesn't Work

The most common form of self-verification is appending "double-check your answer before responding" to a prompt, or, after getting an answer, sending it back with "are you sure this is correct?" Both are weaker than they appear, for a mechanistic reason that follows directly from Chapter 1: the model generating the check is the *same* model, conditioned on largely the *same* reasoning, that produced the original answer. If the original error came from a genuine gap or bias in what the model learned (not a one-off sampling fluke), asking it to re-examine the same reasoning with the same underlying knowledge frequently reproduces the same error with renewed confidence, rather than catching it.

::code-wrapper{language="markdown"}
```markdown
What is the capital of Australia?
```
::

If a model incorrectly answers "Sydney" (a genuinely common real-world misconception, since Sydney is the best-known Australian city but not the capital), asking "are you sure?" as a follow-up frequently produces an unhelpful, low-value response — either a mechanical "Yes, I'm sure" that doesn't re-derive anything, or (worse, per Chapter 6's sycophancy discussion) a flip to a *different* wrong answer purely because the question implied doubt, not because any new evidence or reasoning was introduced. Neither outcome is genuine verification; both are artifacts of surface-level prompting that doesn't change what the model actually knows or how it reasons.

**Naive self-verification works best for catching a specific, narrow class of error: mistakes that are visible from the *output itself* without needing new information** — an arithmetic slip that a careful re-read would catch, a JSON structure with a missing bracket, an answer that contradicts an explicit constraint stated earlier in the same prompt. It works poorly for factual errors rooted in what the model actually believes to be true, because there's no new signal being introduced that would change that belief on a second pass.

## Structured Verification: Give the Check Something to Check Against

The fix is not to abandon self-verification, but to make the verification step do real, structured work rather than a vague "are you sure":

::code-wrapper{language="markdown"}
```markdown
Step 1: Solve the following problem, showing your work.

A store offers a 20% discount, then charges 8% sales tax on the
discounted price. If the original price is $150, what is the final price?

Step 2: Now verify your Step 1 answer by solving the problem a second
time using a different method (e.g., if you multiplied discount and tax
factors together first, this time apply the discount first, get an
intermediate dollar value, then apply tax to that intermediate value
separately). State whether the two methods agree. If they disagree,
identify which step diverged and redo the calculation.
```
::

This works meaningfully better than "are you sure?" because it forces a **genuinely independent derivation** — a different method arriving at the same intermediate values is real corroborating evidence, in a way that re-reading the same derivation and nodding along is not. The general principle: **verification is only informative when it's structurally different from the original reasoning path, not just a repetition of it phrased as a question.**

## Self-Consistency: Sample Multiple Times, Then Vote

**Self-consistency** is a more rigorous, empirically well-studied technique: instead of generating one chain-of-thought and trusting it, generate *several* independent reasoning paths (typically at a non-zero temperature, so they actually differ from each other) for the same problem, and take the majority answer.

::code-wrapper{language="python"}
```python
from collections import Counter

def self_consistency(prompt, n=5):
    answers = []
    for _ in range(n):
        response = client.messages.create(
            model="claude-opus-5",
            max_tokens=1024,
            temperature=0.7,
            messages=[{"role": "user", "content": prompt}],
        )
        answer = extract_final_answer(response.content[0].text)
        answers.append(answer)
    most_common, count = Counter(answers).most_common(1)[0]
    return most_common, count / n
```
::

The intuition: a model's reasoning errors on a genuinely hard problem are often somewhat random with respect to *which* wrong path it takes at a given branching point, while correct reasoning tends to converge on the same answer via multiple valid routes. Sample enough independent attempts, and the correct answer — if the model is capable of reaching it at all — tends to show up more often than any single specific *wrong* answer, because there are many ways to be wrong but usually only one way to be right. Majority voting across samples exploits that asymmetry.

This is not free — it costs *n* times the tokens and latency of a single call — so it's best reserved for cases where getting the answer right matters enough to justify the multiplier: a hard reasoning or math problem, a high-stakes classification, a step early in a pipeline (Chapter 10) whose error would otherwise propagate through several subsequent stages.

### What self-consistency does and doesn't fix

Self-consistency is well-suited to catching **variance** — cases where the model sometimes gets it right and sometimes doesn't, depending on which reasoning path it happens to sample. It does *not* help with **bias** — a systematic error the model makes essentially every time, regardless of sampling, because it reflects something it consistently and confidently believes (the Sydney/Canberra example above would likely show "Sydney" across all *n* samples, since it's not a random slip, it's a consistent misconception). Distinguishing which kind of error you're facing matters: if repeated manual testing shows a prompt failing the *same way* every time, more samples won't help — you need either better grounding (Chapter 12) or a fundamentally different prompt approach, not more votes on the same flawed reasoning.

## Verification Against an External Check

The most reliable form of verification doesn't ask the model to check itself at all — it checks the model's output against something outside the model:

::code-wrapper{language="python"}
```python
def verified_extraction(document, schema):
    result = extract_with_schema(document, schema)

    for field, value in result.items():
        if value is not None and isinstance(value, str):
            if value not in document:
                flag_for_review(field, value, reason="not found verbatim in source")

    return result
```
::

Here, an extracted quote or fact is checked against the literal source text — a cheap, deterministic, non-LLM check that catches a real and common failure mode (a model paraphrasing or subtly fabricating a "quote" that doesn't actually appear in the source) far more reliably than asking the model itself whether the quote is accurate. Chapter 12 covers this pattern in depth for retrieval-grounded generation specifically; the general lesson here is that **verification is strongest when it's checking against ground truth external to the model's own generation — a database, a calculator, the literal source document, a schema validator** — rather than asking the same generative process to grade itself.

## Multi-Model or Multi-Prompt Cross-Checking

A related technique: have two differently-prompted calls (or, where feasible, two different models) independently attempt the same task, and treat disagreement between them as a signal requiring closer attention, rather than blindly trusting either:

::code-wrapper{language="markdown"}
```markdown
Prompt A (direct): What is the primary cause of this application crash,
based on the attached stack trace?

Prompt B (adversarial): A colleague claims the primary cause of this
crash is a null pointer dereference in the request handler. Review the
attached stack trace and either confirm or refute that specific claim,
citing the exact lines that support your conclusion.
```
::

If both independently-framed prompts converge on the same root cause, that's stronger evidence than either alone. If they diverge, that divergence is itself valuable information — it flags a case that likely needs human judgment rather than being resolved by picking one output arbitrarily. This technique is more expensive to run and reason about than a single call, so it's typically reserved for the highest-stakes classification or diagnostic decisions in a pipeline, not applied universally.

## Where to Spend the Verification Budget

Verification techniques all cost extra tokens, calls, and latency, so the practical question is *where* in a system that budget is best spent. As a rule of thumb, prioritize verification for:

- **Early stages in a decomposed pipeline** (Chapter 10), since an error there propagates and compounds through everything downstream.
- **Numeric, factual, or quotable claims**, where an external check (a calculator, the source document, a database) is cheap and available — verification against ground truth is almost always worth it when the ground truth is accessible.
- **High-stakes, low-frequency decisions** (a medical, legal, or financial classification that drives a real consequence) over high-frequency, low-stakes ones (a casual chat response), where the cost of an occasional error is much higher relative to the cost of extra verification calls.
- **Tasks with observed, measured error rates** from your evaluation process (Chapter 9), rather than tasks you merely suspect might be unreliable — spend the verification budget where your data says it's needed, not where intuition says it might be.

## 💡 Tips & Tricks

- **Ask for a different method, not a re-read** — When prompting for self-verification, be explicit that the second pass should use a genuinely different approach (a different formula, working backward from the answer, checking against a known special case) rather than just "check your work," which too easily becomes a repetition of the same reasoning.
- **Reserve self-consistency sampling for problems with a checkable final answer** — Majority voting works cleanly when answers are comparable (a number, a category, a short factual claim). It's much harder to apply to open-ended generation (there's no clean "majority vote" over five different essays), so match this technique to tasks with a discrete, comparable output.
- **Log disagreement rate as a quality signal, not just a routing trigger** — If you're running self-consistency or multi-prompt cross-checking in production, the *rate* at which samples disagree is itself a useful health metric for a given prompt or task — a sudden rise in disagreement can flag an ambiguous new input pattern or a prompt that's stopped matching current input characteristics before it shows up as an obvious downstream failure.
- **Cheap external verification beats expensive model-based verification whenever it's available** — checking an extracted quote against source text, or a calculated total against re-computed arithmetic, costs a few milliseconds of deterministic code; use it in preference to a second LLM call whenever the ground truth is mechanically checkable at all.
- **Combine self-consistency with decomposition for the highest-stakes single stage, not the whole pipeline** — running every stage of a multi-step pipeline five times each multiplies cost across the entire pipeline; it's usually more cost-effective to identify the single highest-risk stage and apply heavier verification only there.

## ⚠️ Edge Cases & Gotchas

- **Self-consistency at temperature 0 doesn't work** — if every sample is generated deterministically (or close to it), all *n* samples will tend to produce the same output regardless of whether it's right or wrong, defeating the entire premise of voting across independent attempts. Self-consistency requires actual sampling diversity (a meaningfully non-zero temperature) to be worth running at all.
- **A confident, articulate wrong answer can win a majority vote just as easily as a correct one**, if the model's training gives it a strong, consistent (but mistaken) prior — self-consistency corrects for random variance in reasoning paths, not for a systematic bias shared across all sampled attempts. Don't treat "5 out of 5 samples agree" as proof of correctness for a claim that could plausibly reflect a shared training-data misconception rather than genuinely convergent correct reasoning.
- **Verification steps can themselves introduce new errors.** A "double check this JSON is valid" pass, run as a separate model call rather than a deterministic parser, can confidently declare malformed JSON valid, or "fix" already-valid JSON into a subtly broken form — whenever a deterministic check (an actual JSON parser, a schema validator, a calculator) is available, it is strictly more reliable than an LLM call asked to perform the equivalent check.
- **The cost multiplier of self-consistency is easy to underestimate at scale.** Five samples per request isn't "5x slower" in isolation, but at production request volume it's 5x the token spend and 5x the load on rate limits, every single time that code path runs — reserve it explicitly for the subset of requests (via the pipeline stage or task-difficulty routing) that actually need it, rather than applying it uniformly by default.
- **Multi-prompt cross-checking can produce two independently wrong answers that happen to agree.** If both prompts share the same underlying blind spot (both rely on the model's general knowledge about a fact it's simply wrong about), agreement between them provides false reassurance — cross-checking catches divergent errors, not shared ones, so it's not a substitute for external grounding (Chapter 12) when the risk is a shared factual gap rather than a reasoning-path fluke.

## 🧠 Spot the Issue

A team building a medical-symptom triage assistant adds this verification step to increase confidence in the assistant's urgency assessments:

::code-wrapper{language="markdown"}
```markdown
You just classified this patient's symptoms as LOW urgency. Before
finalizing, double-check: are you confident this is correct?
```
::

They observe that this check almost never changes the original classification — the model virtually always responds "Yes, I'm confident in this assessment" regardless of the case. The team concludes the check is working well, since it "confirms" the original answer every time. What's the flaw in that conclusion, and what would be a more rigorous verification design for this specific use case?

<details>
<summary>Answer</summary>

A verification step that always confirms the original answer provides zero information — it can't distinguish "the original classification was actually correct" from "the verification step is a rubber stamp that never meaningfully re-examines anything," and the team has no way to tell which of those is happening from the check's output alone. This is exactly the naive self-verification failure described at the start of the chapter: asking the same model, with the same underlying reasoning and knowledge, whether it's "confident" doesn't introduce any new derivation or external signal that could actually catch an error — it just asks the model to restate its prior conclusion, which it will very often do regardless of correctness. For a genuinely high-stakes use case like medical triage, a more rigorous design would use structured, method-different verification (re-derive the urgency assessment from the listed symptoms against an explicit checklist of red-flag symptoms, independent of the first pass's reasoning), and — given the stakes — favor an external, non-LLM safety net over self-verification entirely, such as a hard rule that any symptom matching a predefined red-flag list is escalated to at least MEDIUM urgency regardless of what the model's classification step concluded, with human clinical review as the actual safeguard for anything the system is uncertain about.

**The lesson**: a verification step that virtually always confirms the original answer is not evidence the original answer was right — it's a sign the verification step isn't introducing any new reasoning path or external check, and for high-stakes domains, self-verification alone should never be the last line of defense.

</details>

## Key Takeaways

- Naive self-verification ("are you sure?") mostly catches surface-visible errors (arithmetic slips, malformed structure) and does little for errors rooted in what the model actually, consistently believes — the same reasoning re-examined by the same model tends to reproduce the same conclusion.
- Structured verification that forces a genuinely different method or derivation is meaningfully stronger than a repeated read-through, because it introduces real corroborating (or contradicting) evidence rather than just restating the original reasoning.
- Self-consistency (sampling multiple independent reasoning paths at non-zero temperature and taking a majority vote) corrects for random variance in reasoning but not for systematic bias shared across all samples — five agreeing samples is not proof of correctness if the agreement stems from a shared misconception.
- Verification against external ground truth (source documents, calculators, schema validators, databases) is more reliable than any form of the model checking itself, and should be preferred whenever such ground truth is mechanically accessible.
- Verification budget (extra calls, samples, cross-checks) is finite and should be allocated based on measured error rates and stakes — prioritize early pipeline stages, checkable factual/numeric claims, and high-stakes low-frequency decisions over uniform application everywhere.
