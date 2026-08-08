# 14 — Multi-Agent & Agentic Workflows

## From a Tool Loop to an Agent

Chapter 13 ended by noting that a tool-calling loop is, in miniature, an agentic system. This chapter takes that seriously: an **agent**, in the sense used throughout this course, is a model given a goal, a set of tools, and the autonomy to decide — turn by turn, without a human scripting each step — what actions to take until the goal is reached or it determines it can't proceed further. A **multi-agent system** decomposes that autonomy across several distinct agents, each with a narrower role, coordinated by some orchestration logic (which may itself be another agent).

This is the natural endpoint of several earlier chapters converging: decomposition (Chapter 10) applied not just to prompts but to entire autonomous roles; tool use (Chapter 13) as the mechanism an agent acts through; context management (Chapter 8) as the constraint that makes long agentic runs hard; and verification (Chapter 11) as the safeguard against an autonomous process confidently going wrong for many steps before anyone notices.

## Single Agent vs. Multi-Agent: The Actual Decision

The instinct to reach for multiple agents the moment a task feels complex is common and often wrong. A single agent with a good tool set and a well-structured prompt handles more than people expect, and multi-agent architectures introduce real costs: more coordination logic to get right, more places for context to be lost or misinterpreted at a handoff, more total tokens spent, and more surface area for compounding errors (echoing Chapter 10's point about error propagation across pipeline stages, now applied to autonomous stages rather than fixed prompts).

Multi-agent decomposition earns its cost when:

- **Distinct roles genuinely need different tools, permissions, or context** that shouldn't be mixed in one place — a "research agent" with broad web-search access and a "code-execution agent" with access to a sandboxed environment are natural to separate, partly for capability reasons and partly so a prompt-injection attempt encountered by the research agent (Chapter 18) doesn't automatically inherit code-execution privileges.
- **The task benefits from parallel, independent exploration** — several sub-agents investigating different hypotheses or different parts of a large codebase simultaneously, with results merged afterward, rather than one agent working serially through all of it.
- **A single agent's context would otherwise become unmanageably large or noisy** — an agent that both does deep research and writes final polished prose tends to have its prompt, its tool set, and its context all fighting for the same attention; separating "gather and verify information" from "compose the final output" can each be cleaner than one agent doing both.
- **You need an independent check on an agent's own work** — a separate reviewing agent, with its own fresh context and no stake in having produced the original output, is less prone to the same self-verification blind spots discussed in Chapter 11.

If none of these apply, a well-designed single agent with a clear tool set is usually more reliable and dramatically cheaper to build, debug, and run than a multi-agent system solving the same problem — the burden of proof should be on multi-agent complexity, not on staying simple.

## The Orchestrator/Sub-Agent Pattern

The most common production multi-agent shape is a hierarchical one: an **orchestrator** agent (or plain application logic) breaks a goal into sub-tasks and dispatches each to a **sub-agent**, which works within its own scoped context and tool access, then reports a result back:

::code-wrapper{language="markdown"}
```markdown
Orchestrator system prompt:

You are a research coordinator. Given a research question, break it into
2-4 independent sub-questions that can be investigated separately. For
each, dispatch a research task to a sub-agent with a clear, self-contained
brief (the sub-agent will not see this conversation, only the brief you
write). Once all sub-agent results return, synthesize them into a single
coherent answer, noting any contradictions between sub-agent findings
rather than silently picking one.
```
::

::code-wrapper{language="markdown"}
```markdown
Sub-agent brief (written by the orchestrator, given to a fresh sub-agent
with no other context):

Research task: Determine the current regulatory status of autonomous
vehicle testing in California as of 2026. Focus on: which agency has
jurisdiction, what permits are required, and any recent (last 12 months)
rule changes. Cite sources. Do not speculate beyond what your sources
support. Return a structured summary, not raw search results.
```
::

The critical design detail here is that **the sub-agent brief is a complete, self-contained prompt** — the sub-agent doesn't inherit the orchestrator's full conversation history or reasoning, only what the orchestrator deliberately writes into the brief. This is a feature, not a limitation: it forces the orchestrator (and you, designing the orchestrator's prompt) to be explicit about exactly what context a sub-task actually needs, which is the same discipline Chapter 10 argued for in pipeline handoffs, now applied to agent-to-agent handoffs instead of stage-to-stage ones.

## Context Passing and the Handoff Problem

The single hardest problem in multi-agent design is deciding what crosses a handoff and in what form — get this wrong and a multi-agent system inherits all the coordination overhead without the reliability benefit. A few patterns, in increasing order of structure:

::code-wrapper{language="json"}
```json
{
  "task_id": "research-002",
  "status": "complete",
  "summary": "The DMV has primary jurisdiction over AV testing permits in California; CPUC governs commercial deployment separately.",
  "key_facts": [
    {"fact": "SB-XXX amended permit requirements in March 2026", "source": "ca-dmv.gov/av-permits"},
    {"fact": "CPUC requires separate deployment permit distinct from testing permit", "source": "cpuc.ca.gov"}
  ],
  "confidence": "high",
  "open_questions": ["Unclear whether the March 2026 amendment applies retroactively to existing permit holders"]
}
```
::

A **structured handoff** like this — rather than a sub-agent's raw, free-text reasoning transcript — gives the orchestrator (or the next agent in a chain) exactly what it needs to act on, in a form it can validate, without re-processing an entire transcript of the sub-agent's intermediate exploration, false starts, and tool calls. This mirrors Chapter 10's argument for structured pipeline handoffs precisely: passing a sub-agent's full raw transcript forward is analogous to passing unstructured prose between pipeline stages — it works, but it's brittle and burns context for no benefit compared to a deliberately-scoped structured result. The `confidence` and `open_questions` fields are doing particularly important work here — they let the receiving agent (or a human) distinguish a well-established finding from a tentative one, rather than treating everything a sub-agent reports with uniform, unwarranted confidence.

## Parallel vs. Sequential Multi-Agent Execution

Exactly as with decomposition (Chapter 10), sub-agents that don't depend on each other's output should run concurrently:

::code-wrapper{language="python"}
```python
import asyncio

async def run_research_agents(sub_questions):
    tasks = [run_sub_agent(q) for q in sub_questions]
    results = await asyncio.gather(*tasks)
    return results

async def orchestrate(research_question):
    sub_questions = decompose(research_question)
    results = await run_research_agents(sub_questions)
    return synthesize(research_question, results)
```
::

Sequential multi-agent chains are necessary when a later agent's task genuinely depends on an earlier one's output (a "planning agent" whose plan is required before an "execution agent" can start), but should never be the default just because it's the simplest to implement — an unnecessarily sequential multi-agent system pays the full latency cost of every agent's individual runtime, stacked, for no correctness benefit over a parallel design.

## Failure Modes Unique to Multi-Agent Systems

Beyond the general error-propagation risk from Chapter 10, multi-agent systems have several failure modes that don't show up in a single-agent design at all:

- **Miscommunication at the handoff.** An orchestrator's brief to a sub-agent can be ambiguous in exactly the ways any prompt can be ambiguous (Chapter 4), but the consequence is compounded because the sub-agent has no broader conversation context to disambiguate from, and the orchestrator often can't see the sub-agent's internal reasoning to notice the misunderstanding until a clearly wrong result comes back.
- **Redundant or contradictory work.** Two independently-dispatched sub-agents can end up investigating overlapping ground, or worse, reaching different conclusions about the same question, with nothing in the architecture forcing that conflict to surface rather than being silently resolved (or silently ignored) by whichever result the orchestrator happens to process first.
- **Runaway coordination loops.** An orchestrator that can re-dispatch a sub-agent whose result it deems unsatisfactory needs an explicit termination condition — without one, a persistently ambiguous sub-task can loop indefinitely between orchestrator and sub-agent, each retry consuming real cost with no guarantee of convergence.
- **Diffused accountability for errors.** When a final answer is wrong, tracing *which* agent introduced the error, and whether it was a sub-agent's mistake or a synthesis mistake by the orchestrator, requires deliberately-preserved logs of every agent's individual input and output — without that, debugging a multi-agent failure is considerably harder than debugging a single well-logged agent, exactly because there are more independent points of failure to search across.

## Human-in-the-Loop Checkpoints

The more autonomy an agentic system has, the more valuable — and for high-stakes actions, the more necessary — an explicit checkpoint where a human reviews and approves before an irreversible action executes, rather than trusting the agent (or a chain of agents) to self-regulate indefinitely:

::code-wrapper{language="markdown"}
```markdown
Before calling any tool that sends external communication (email, Slack
message, API call to a third-party system) or modifies persistent data
(database writes, file deletions), stop and present the exact action you
intend to take, including all parameters, for explicit human approval.
Do not proceed until approval is given. Read-only actions (searches,
lookups, calculations) do not require this pause.
```
::

This instruction alone is prompted, not enforced — exactly the prompted-vs-enforced distinction from Chapter 7 and Chapter 13 — so for genuinely high-stakes actions, the actual gating (the tool simply isn't invocable without a separate approval signal from your application, not just a request the model can choose to skip) belongs in your system's architecture, not solely in prompt wording. The prompt establishes the intended behavior; the architecture should be what actually guarantees it holds.

## Designing the Orchestrator's Synthesis Step

The step that's easiest to under-design is the final synthesis — the orchestrator combining multiple sub-agent results into one coherent output. A synthesis prompt that just says "combine these results" tends to produce a shallow concatenation rather than genuine integration:

::code-wrapper{language="markdown"}
```markdown
You have results from three independent research sub-agents on related
sub-questions. Synthesize a single coherent answer to the original
question: {original_question}

Sub-agent results:
{result_1}
{result_2}
{result_3}

When synthesizing:
- If sub-agents agree on a fact, state it directly.
- If sub-agents disagree or one flagged low confidence, surface the
  disagreement explicitly rather than silently picking one version.
- Do not simply concatenate the three results — produce one unified
  narrative that a reader who never saw the individual sub-agent outputs
  would find complete and non-repetitive.
```
::

The explicit instruction to surface disagreement, rather than silently resolve it, matters for the same reason Chapter 12 emphasized it for contradictory retrieved documents: an orchestrator that quietly picks one of two conflicting sub-agent findings is manufacturing false confidence, and the person consuming the final answer has no way to know a disagreement ever existed underneath it.

## 💡 Tips & Tricks

- **Start with a single agent and only split when you have a concrete, specific reason** — write down the specific failure or limitation a single agent hit before reaching for multi-agent decomposition; "it felt complex" is not a specific enough reason and usually indicates the task needs better decomposition of prompts/tools (Chapters 10, 13), not more agents.
- **Give every sub-agent brief a strict, explicit scope boundary** — a sub-agent told "research the regulatory landscape" tends to wander broadly; one told the exact sub-question, exact time bound, and exact expected output shape stays far more reliably on-task.
- **Log every agent's full input and output, keyed by a task id**, from day one — retrofitting observability into a multi-agent system after it's already misbehaving in production is dramatically harder than building the logging in from the start, precisely because diffused accountability (above) makes post-hoc debugging so much harder without it.
- **Cap total sub-agent dispatches and total orchestration rounds explicitly** — an unbounded "re-dispatch until satisfied" loop is a cost and latency risk that's easy to overlook during development against a handful of test cases and expensive to discover in production.
- **Treat the orchestrator's synthesis prompt with as much care as any sub-agent's** — it's tempting to under-invest in the "just combine the results" step, but it's often where the most consequential integration errors (silently resolved contradictions, dropped caveats) actually happen.

## ⚠️ Edge Cases & Gotchas

- **A sub-agent with too little context makes confidently wrong assumptions**, exactly the way any underspecified prompt does (Chapter 4) — a brief that omits a constraint the orchestrator considered "obvious" from its own fuller context can produce a technically-responsive but practically-useless sub-agent result, with no way for the sub-agent to know what it wasn't told.
- **Multi-agent systems can be more, not less, vulnerable to prompt injection**, because untrusted content (a search result, a scraped webpage, a document) encountered by one sub-agent can be passed along in that sub-agent's report and influence the orchestrator or other agents downstream, laundering an injection attempt through what looks like a trusted internal handoff rather than obviously-external content. Treat sub-agent outputs that were derived from untrusted external sources with the same caution as the original untrusted content itself (see Chapter 18).
- **Parallel sub-agents can silently duplicate cost on genuinely overlapping work** if the orchestrator's decomposition wasn't actually independent — two "independent" sub-questions that turn out to require researching the same underlying source waste tokens and can produce two redundant (or subtly conflicting) partial answers that then need to be reconciled anyway.
- **A synthesis step can be fooled by sub-agent confidence mismatches that don't reflect actual reliability** — a sub-agent that happens to phrase a shaky finding assertively and another that hedges an actually-solid finding can lead an orchestrator's synthesis to weight them backwards, unless sub-agent briefs explicitly require honest, calibrated confidence reporting (Chapter 17) rather than just a free-text summary.
- **Human-in-the-loop checkpoints only work if a human is actually positioned to catch a problem** — a checkpoint that shows a human a technically-accurate but overwhelming wall of tool-call parameters, with no time pressure accounted for and no highlighting of what's unusual or risky about this particular action, tends to get rubber-stamped exactly like the naive self-verification pattern from Chapter 11. Design the approval interface to highlight what's different or risky about this specific action, not just to dump raw parameters for a human to theoretically review.

## 🧠 Spot the Issue

A team builds a multi-agent customer-issue-resolution system: a triage agent classifies incoming issues and dispatches them to one of three specialist agents (billing, technical, account), each of which independently resolves the issue and sends a response directly to the customer without any further review.

::code-wrapper{language="markdown"}
```markdown
Triage agent: classify the issue and dispatch to the correct specialist
agent with a one-line summary of the issue.

Specialist agent: given the one-line summary, investigate using your
tools and respond directly to the customer with a resolution.
```
::

A customer writes a message that's genuinely a billing issue, but mentions in passing that they're also locked out of their account entirely. The triage agent correctly classifies it as BILLING and passes only a one-line billing summary to the billing specialist, which resolves the billing question and closes the ticket — the account lockout is never addressed because the billing specialist never saw it, and the triage agent's one-line summary didn't include it. What architectural choice caused this, and is the fix a better prompt or a different structure?

<details>
<summary>Answer</summary>

This is the handoff-context problem from this chapter in a customer-facing form: the triage agent's brief to the specialist was reduced to a single classification-driven summary, which necessarily discards anything that doesn't fit the chosen category — exactly the risk flagged above about a sub-agent brief omitting something the dispatching agent considered secondary or "obvious to route elsewhere." A better prompt for the triage agent (explicitly instructing it to flag *all* distinct issues present in a message, not just the primary one for classification purposes) would help, but the deeper fix is structural: a message containing multiple distinct issues shouldn't be forced through a single-category dispatch at all. The more robust architecture either lets the triage agent dispatch to multiple specialists for a single message when multiple distinct issues are present, or passes the full original customer message to the specialist agent (not just a lossy one-line summary), so the specialist can itself notice a secondary issue outside its own specialty and either handle escalation or flag it explicitly, rather than being structurally blind to anything the triage step didn't already name.

**The lesson**: forcing a multi-issue input through a single classification-and-summarize handoff step will systematically lose whatever the classification step didn't prioritize — when messages can plausibly contain more than one distinct concern, the handoff design (not just the wording of the triage prompt) needs to account for that from the start.

</details>

## Key Takeaways

- An agent is a model given a goal, tools, and autonomy to decide its own steps; a multi-agent system distributes that autonomy across several narrower-scoped agents coordinated by an orchestrator — treat multi-agent decomposition as an added-complexity decision that needs a specific justification, not a default for anything that feels complicated.
- Multi-agent architectures earn their cost when roles genuinely need different tools/permissions/context, when independent parallel exploration is valuable, or when an independent reviewing agent provides a real check that self-verification (Chapter 11) can't.
- Sub-agent briefs should be complete and self-contained, since sub-agents typically don't inherit the orchestrator's full context — and handoffs between agents should be structured (explicit facts, confidence, open questions), not raw transcripts, for the same reasons Chapter 10 argued for structured pipeline handoffs.
- Multi-agent systems introduce failure modes single agents don't have: ambiguous handoffs, redundant or contradictory parallel work, runaway coordination loops, and diffused accountability that makes debugging harder without deliberate per-agent logging from the start.
- The orchestrator's synthesis step deserves as much prompting care as any individual agent — it should surface disagreement between sub-agent results explicitly rather than silently resolving it, and should genuinely integrate results rather than concatenate them.
- Prompted caution ("ask for approval before high-stakes actions") should be backed by actual architectural enforcement for genuinely irreversible or high-consequence actions, not trusted as a self-sufficient safeguard — and human approval checkpoints only work if designed to actually surface what's risky about a specific action, not just dump raw parameters for rubber-stamping.
