# 19 — Evaluating & Testing Prompts at Scale

## Why "It Looks Good" Isn't Evidence

Every chapter so far has shown example prompts and asserted they work better than some alternative. In casual use, that assertion gets checked by trying a prompt a few times and eyeballing the output — and for exploratory, low-stakes use, that's genuinely fine. It stops being fine the moment a prompt ships into a product that real users depend on, because manual spot-checking has a specific, well-documented failure mode: it reliably catches the failures you already anticipated and reliably misses the ones you didn't, which are exactly the ones that matter once volume and variety of real input exceed what a few informal test runs ever touched.

This chapter is about closing that gap: building a real evaluation set, automating grading at scale, and treating prompt changes with the same regression-testing discipline applied to any other production code change — because a prompt *is* production code, in every sense that matters for reliability, even though it's written in English instead of a programming language.

## Building an Eval Set

An eval set is a curated collection of representative inputs, each with either a known-correct expected output or a clear rubric for judging correctness, that a prompt is run against systematically rather than spot-checked informally.

::code-wrapper{language="json"}
```json
[
  {
    "id": "refund-001",
    "input": "I was charged twice for order #4471, please refund the duplicate.",
    "expected_category": "billing",
    "expected_action": "issue_refund",
    "notes": "Clear duplicate-charge case, should not require escalation."
  },
  {
    "id": "refund-002",
    "input": "This product broke after two days and I want my money back, this is ridiculous.",
    "expected_category": "returns",
    "expected_action": "initiate_return",
    "notes": "Emotionally charged tone should not affect classification — tests tone robustness."
  },
  {
    "id": "refund-003",
    "input": "hey so my order thing didnt really work out how i wanted can u help sort it",
    "expected_category": "returns",
    "expected_action": "clarify",
    "notes": "Deliberately vague/informal — correct behavior is to ask a clarifying question, not guess."
  }
]
```
::

A good eval set is not just a pile of easy, obviously-correct examples — it deliberately includes the categories that break naive prompts: edge cases at category boundaries, adversarial or ambiguous phrasing, unusual-but-valid formatting, and known-hard cases pulled from actual production failures once you have them. **Every real production bug found in a deployed prompt should become a new eval case**, permanently, the same way a regression test gets added for a fixed software bug — this is the single most reliable way an eval set gets better over time instead of staying frozen at whatever the team thought to test on day one.

## LLM-as-Judge

For tasks where correctness isn't a simple exact-match (open-ended writing quality, summary faithfulness, tone appropriateness), a second model call can grade the first model's output against a rubric, since exact-string comparison doesn't work for free-form text the way it does for a classification label:

::code-wrapper{language="markdown"}
```markdown
You are evaluating the quality of a customer support response. You will
be given the original customer message and the response to evaluate.

Score the response from 1-5 on each dimension:
- Accuracy: does it correctly address what the customer actually asked?
- Tone: is it appropriately empathetic and professional?
- Completeness: does it resolve the issue or clearly state next steps?
- Policy compliance: does it avoid promising anything outside stated
  company policy (e.g. never promises a refund amount without
  verification)?

For any score of 3 or below, explain specifically what was wrong.

<customer_message>
{{original message}}
</customer_message>

<response_to_evaluate>
{{model's response}}
</response_to_evaluate>
```
::

::code-wrapper{language="python"}
```python
def run_eval_suite(prompt_fn, eval_cases, judge_fn):
    results = []
    for case in eval_cases:
        output = prompt_fn(case["input"])
        score = judge_fn(case["input"], output, case.get("rubric"))
        results.append({"id": case["id"], "output": output, "score": score})
    return results
```
::

LLM-as-judge is powerful precisely because it scales to open-ended output that no simple string match could grade — but it inherits real limitations worth being explicit about rather than treating the judge's score as ground truth. A judge model has its own biases (documented tendencies toward favoring longer responses, favoring responses stylistically similar to its own default output, and being influenced by response ordering when comparing two outputs side by side) and its own hallucination risk (Chapter 17) applied to the grading task itself — a judge can confidently assign a wrong score with the same fluent confidence a generator model can state a wrong fact. Treat LLM-as-judge scores as a strong, scalable *signal*, not an infallible ground truth, and periodically validate the judge itself against human-graded samples to confirm its scores actually track what a human would say.

## Human-in-the-Loop Calibration

Because LLM-as-judge can drift or carry systematic bias, the eval process needs a periodic human-grading check on a sample of cases — comparing the judge's scores against a human's independent judgment on the same outputs:

::code-wrapper{language="markdown"}
```markdown
Sample 20 outputs at random from this week's eval run. Have a human
grader score them blind (without seeing the judge model's score) using
the same rubric. Compare human and judge scores:

- If they agree within 1 point on 90%+ of cases, the judge is well-
  calibrated for this task and can be trusted for the bulk of ongoing
  evaluation.
- If there's a systematic gap (judge consistently scores higher/lower
  than humans, or disagrees heavily on a specific dimension), the judge
  prompt needs revision before its scores can be trusted at scale.
```
::

This calibration step is not a one-time setup task — a judge that was well-calibrated against one version of a prompt's typical outputs is not guaranteed to remain well-calibrated after the underlying model or prompt changes meaningfully, so periodic re-calibration, not a single validation at project start, is the sustainable pattern.

## Regression Testing Prompts in CI

Once an eval set and a grading mechanism exist, running them automatically on every prompt change — the same discipline as a unit test suite running on every code change — catches regressions before they reach production rather than after:

::code-wrapper{language="python"}
```python
import sys

def test_prompt_regression():
    baseline_scores = load_baseline("eval_baseline.json")
    current_results = run_eval_suite(current_prompt_fn, eval_cases, judge_fn)

    regressions = []
    for result in current_results:
        baseline = baseline_scores.get(result["id"])
        if baseline and result["score"]["average"] < baseline["average"] - 0.5:
            regressions.append(result["id"])

    if regressions:
        print(f"Regression detected on cases: {regressions}")
        sys.exit(1)

if __name__ == "__main__":
    test_prompt_regression()
```
::

Wiring this into a CI pipeline — running automatically on any pull request that touches a prompt template, a system prompt, or a model/version configuration — turns "did this prompt change make things worse" from a question answered by a developer's subjective impression into one answered by a reproducible, versioned comparison against a known baseline. This matters especially for exactly the scenario Chapter 16 flagged: a model version upgrade, even one a provider doesn't classify as a breaking change, can shift verbosity, refusal thresholds, or formatting defaults enough to move eval scores — and a CI-gated eval suite is what turns that into a caught regression instead of a silent production degradation discovered from user complaints.

## Cost and Latency as First-Class Eval Dimensions

Correctness is necessary but not sufficient for a production prompt — cost and latency are real constraints that a purely-accuracy-focused eval process tends to ignore until they become a crisis:

| Dimension | What to track | Why it matters |
|---|---|---|
| Input tokens | Per-request average and p95 | Directly drives cost; a prompt that grew via accumulated instructions (Chapter 8) costs more per call, silently, over time |
| Output tokens | Per-request average and p95 | Same cost driver; also a proxy for whether verbosity constraints (Chapter 4) are actually being respected |
| Latency | p50 and p95 response time | User-facing responsiveness; extended thinking or long tool-calling loops (Chapters 13, 15) can push this considerably |
| Cost per successful resolution | Total cost divided by tasks actually completed correctly, not just attempted | The metric that actually matters for a support/task-automation product — a cheap-but-frequently-wrong prompt can cost more overall than an expensive-but-reliable one, once retries and human escalation are counted |

A common, easy-to-fall-into trap is optimizing a prompt purely for eval-set accuracy without tracking what that accuracy gain cost in tokens or latency — a prompt change that improves average judge score by 0.2 points by adding several paragraphs of additional instruction and a larger extended-thinking budget may not be worth shipping if it triples per-request cost and latency for a marginal accuracy gain, especially where a cheaper, faster, slightly-less-accurate version is well within acceptable quality for the actual use case. Treat cost and latency as constraints to report alongside every accuracy number, not as an afterthought measured separately (or not at all) after a prompt is already in production.

## Statistical Significance at Small Sample Sizes

A frequently overlooked detail: eval sets in early-stage projects are often small (tens to low hundreds of cases), and a two-point accuracy improvement on fifty cases can easily be noise rather than a real effect. Before concluding a prompt change is an improvement, it's worth asking whether the eval set is large enough, and varied enough, for the observed difference to be meaningfully larger than the run-to-run variance a language model's inherent non-determinism (temperature, sampling) would produce even with *no* prompt change at all — running the *same* prompt twice through the eval suite and observing the score spread is a cheap, concrete way to establish that baseline noise level before trusting a change's apparent effect size.

## 💡 Tips & Tricks

- **Idiom** — Version your eval set alongside your prompts in the same repository, and require any prompt change to note whether the eval set itself needed updating — an eval set that never grows past its initial cases stops reflecting the actual failure modes a production prompt has encountered since launch.
- **Debug** — When a judge model's score disagrees sharply with your own read of an output, don't assume the judge is simply wrong — read the judge's stated reasoning for the score first, since it often reveals either a genuine issue you missed or a specific, fixable bias in the judge prompt's rubric wording.
- **Performance** — Run cheap, fast automated checks (format validity, required-field presence, length constraints) before an expensive LLM-as-judge call in your eval pipeline — failing those cheap checks first means you're not spending a judge-model call grading an output that was already structurally broken.
- **Idiom** — Keep a small, fixed "canary" subset of your eval set that virtually never changes, specifically to detect model-version drift (Chapter 16) — a canary set with stable, well-understood expected behavior makes a provider-side model update's effect immediately visible against a known baseline, separate from the noise of an actively-evolving broader eval set.
- **Safety** — Include known prompt-injection patterns (Chapter 18) as a permanent category within your regular eval suite, not a separate one-off security review — injection resistance should be regression-tested on every prompt change exactly like any other quality dimension, since a seemingly-unrelated prompt edit can incidentally weaken an injection defense that depended on specific earlier wording.

## ⚠️ Edge Cases & Gotchas

- **An eval set that only contains easy, clearly-correct cases produces a falsely reassuring high score** that says nothing about the prompt's actual production reliability — a 98% score on an eval set with no hard cases is a measurement of the eval set's easiness, not the prompt's quality, and is one of the most common ways teams get blindsided by a production failure an eval suite "should have" caught.
- **LLM-as-judge scoring can be gamed, even unintentionally, by a prompt optimized against the judge rather than against real quality** — a generator prompt iteratively tuned purely to maximize judge score can learn to exploit specific judge biases (length, particular phrasing patterns the judge rewards) without actually producing better output for a real user, which is exactly why periodic human calibration against the judge isn't optional once a judge becomes the primary optimization signal.
- **Non-determinism means a single eval run is a sample, not a certainty** — a prompt change that appears to fix a failing case on one run can simply have gotten lucky on that particular sampling; for cases close to a decision boundary, running multiple trials and looking at the distribution of outcomes is more trustworthy than a single pass/fail run.
- **A regression test suite that's slow or expensive enough to skip "just this once" stops providing any protection at all** — an eval suite that takes hours or costs a meaningful amount to run per change tends to get skipped under deadline pressure exactly when a risky change most needs checking; keeping a fast, cheap "smoke test" subset that always runs, with the fuller suite gated to less frequent checkpoints, is usually more sustainable than one large suite that's technically comprehensive but practically bypassed.
- **Cost and latency regressions can hide behind an unchanged or improved accuracy score** — a prompt edit that adds a large extended-thinking budget (Chapter 15) or an additional verification pass (Chapter 11) can improve accuracy while silently multiplying cost and latency; an eval report that surfaces accuracy alone, without cost/latency alongside it, will not catch this until a cost or performance complaint arrives separately.

## 🧠 Spot the Issue

A team ships a prompt change after seeing their eval suite's average judge score improve from 4.1 to 4.4 out of 5. Two weeks later, users report the assistant has become noticeably slower and their API costs have roughly doubled.

::code-wrapper{language="markdown"}
```markdown
Eval report:
  Average judge score: 4.4 (up from 4.1)
  Pass rate: 92% (up from 87%)

Change shipped: added a 5-step internal verification checklist to the
system prompt, requiring the model to explicitly re-derive and cross-
check each claim before finalizing its answer.
```
::

What did the eval report fail to capture, and what should have been checked before shipping?

<details>
<summary>Answer</summary>

The eval report only tracked accuracy-oriented metrics (judge score, pass rate) and said nothing about cost or latency — exactly the gap flagged above, where a real accuracy improvement can coexist with, and even directly cause, a significant cost and latency regression that a purely-accuracy-focused report is structurally blind to. The specific change (a 5-step internal verification checklist added to every request) is a classic driver of exactly this tradeoff: more required internal reasoning steps plausibly does improve output quality, consistent with Chapter 11's verification techniques, but it also means every single request now does substantially more work — more output tokens generated per response, more processing time — which directly explains the doubled cost and increased latency users are now reporting. This wasn't an unpredictable side effect; it's the direct, foreseeable cost of the specific technique chosen, and it should have been measured and weighed against the accuracy gain *before* shipping, not discovered from user complaints afterward. The fix going forward is procedural: report cost and latency figures alongside every accuracy metric in every eval report, and treat a "should we ship this" decision as inherently weighing accuracy gain against cost/latency cost — a 0.3-point score improvement may well be worth doubled cost for a high-stakes task, or may not be for a low-stakes one, but that's a decision to make deliberately with the full picture, not one to discover after the fact.

**The lesson**: an eval report that tracks only accuracy is only telling half the story for any production system — cost and latency need to be first-class metrics reported alongside quality scores, especially for any change (added reasoning steps, larger thinking budgets, extra verification passes) that plausibly trades one for the other.

</details>
