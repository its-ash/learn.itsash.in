---
title: "14 — Multi-Agent & Agentic Workflows"
description: "Orchestrator/sub-agent patterns, structured handoffs, parallel vs sequential execution, synthesis design, human-in-the-loop checkpoints, and multi-agent failure modes. Code-first reference for mid-to-senior engineers."
---

# 14 — Multi-Agent & Agentic Workflows

## Single Agent vs. Multi-Agent: The Actual Decision

::code-wrapper{language="python" filename="single_vs_multi.py"}
```python
# An AGENT = a model given a goal + tools + autonomy to decide its own steps.
# A MULTI-AGENT SYSTEM = autonomy distributed across several narrower agents,
# coordinated by an orchestrator (which may itself be an agent).

# The instinct to reach for multiple agents the moment a task feels complex is
# COMMON and OFTEN WRONG. A single agent with good tools and a well-structured
# prompt handles more than people expect.

MULTI_AGENT_JUSTIFICATION = {
    "distinct_tools_permissions": "Separate naturally — research agent with web access ≠ code-execution agent with sandbox",
    "parallel_exploration": "Several sub-agents investigating different hypotheses/parts simultaneously",
    "unmanageable_single_context": "Agent doing both deep research AND polished prose → prompt/tools/context all fighting for attention",
    "independent_review": "A separate reviewing agent with fresh context, no stake in the original output",
}

# If NONE of these apply, a well-designed single agent is usually more reliable
# and dramatically cheaper to build, debug, and run. The burden of proof is on
# multi-agent complexity, not on staying simple.
```
::

## The Orchestrator/Sub-Agent Pattern

::code-wrapper{language="markdown" filename="orchestrator_prompt.md"}
```markdown
You are a research coordinator. Given a research question, break it into
2-4 independent sub-questions that can be investigated separately. For each,
dispatch a research task to a sub-agent with a clear, self-contained brief
(the sub-agent will not see this conversation, only the brief you write).
Once all sub-agent results return, synthesize them into a single coherent
answer, noting any contradictions between sub-agent findings rather than
silently picking one.
```
::

::code-wrapper{language="markdown" filename="sub_agent_brief.md"}
```markdown
<!-- Written by the orchestrator, given to a FRESH sub-agent with no other context -->
Research task: Determine the current regulatory status of autonomous
vehicle testing in California as of 2026. Focus on: which agency has
jurisdiction, what permits are required, and any recent (last 12 months)
rule changes. Cite sources. Do not speculate beyond what your sources
support. Return a structured summary, not raw search results.
```
::

::code-wrapper{language="python" filename="sub_agent_isolation.py"}
```python
# CRITICAL: the sub-agent brief is COMPLETE and SELF-CONTAINED.
# The sub-agent does NOT inherit the orchestrator's full conversation history.
# It only sees what the orchestrator deliberately writes into the brief.

# This is a FEATURE, not a limitation:
# - Forces the orchestrator to be EXPLICIT about what context a sub-task needs
# - Same discipline as Chapter 10's structured pipeline handoffs
# - Prevents context bloat from accumulating across agent boundaries

async def dispatch_sub_agent(brief: str, tools: list) -> dict:
    """Run a sub-agent with ONLY the brief — no orchestrator context."""
    sub_agent_messages = [{"role": "user", "content": brief}]
    result = await run_agent_loop(
        system_prompt=SUB_AGENT_SYSTEM_PROMPT,
        tools=tools,
        messages=sub_agent_messages,
        max_iterations=5,
    )
    return parse_structured_result(result)
```
::

## Structured Handoffs

::code-wrapper{language="json" filename="structured_handoff.json"}
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

::code-wrapper{language="python" filename="handoff_vs_transcript.py"}
```python
# A structured handoff (above) vs passing a sub-agent's raw transcript:
# - Structured: the receiving agent gets exactly what it needs, in a form it can
#   validate, without re-processing an entire transcript of false starts and tool calls
# - Transcript: works, but burns context for no benefit — the receiving agent must
#   parse meaning from free text containing irrelevant exploration

# The `confidence` and `open_questions` fields are particularly important — they
# let the receiving agent distinguish a well-established finding from a tentative one,
# rather than treating everything with uniform, unwarranted confidence.

# This mirrors Chapter 10's argument for structured pipeline handoffs precisely:
# passing a sub-agent's full raw transcript forward = passing unstructured prose
# between pipeline stages — brittle and context-wasteful.
```
::

## Parallel vs. Sequential Execution

::code-wrapper{language="python" filename="parallel_agents.py"}
```python
import asyncio

async def run_research_agents(sub_questions: list[str]) -> list[dict]:
    """Sub-agents that don't depend on each other → run concurrently."""
    tasks = [dispatch_sub_agent(q, research_tools) for q in sub_questions]
    results = await asyncio.gather(*tasks)
    return results

async def orchestrate(research_question: str) -> dict:
    sub_questions = await decompose_question(research_question)
    results = await run_research_agents(sub_questions)
    synthesized = await synthesize(research_question, results)
    return synthesized

# Sequential multi-agent chains are necessary when a later agent's task genuinely
# depends on an earlier one's output (planning agent → execution agent).
# But should NEVER be the default just because it's simpler to implement —
# an unnecessarily sequential system pays the full latency cost of every agent's
# runtime, stacked, for no correctness benefit over a parallel design.
```
::

## Synthesis Step Design

::code-wrapper{language="markdown" filename="synthesis_prompt.md"}
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

::code-wrapper{language="python" filename="synthesis_principle.py"}
```python
# The synthesis step is EASY TO UNDER-DESIGN. "Combine these results" tends to
# produce shallow concatenation, not genuine integration.

# The explicit instruction to SURFACE DISAGREEMENT matters for the same reason
# Chapter 12 emphasized it for contradictory retrieved documents:
# an orchestrator that quietly picks one of two conflicting sub-agent findings
# is manufacturing FALSE CONFIDENCE — the consumer has no way to know a
# disagreement ever existed.
```
::

## Human-in-the-Loop Checkpoints

::code-wrapper{language="markdown" filename="human_checkpoint.md"}
```markdown
Before calling any tool that sends external communication (email, Slack
message, API call to a third-party system) or modifies persistent data
(database writes, file deletions), stop and present the exact action you
intend to take, including all parameters, for explicit human approval.
Do not proceed until approval is given. Read-only actions (searches,
lookups, calculations) do not require this pause.
```
::

::code-wrapper{language="python" filename="enforced_checkpoint.py"}
```python
# This instruction is PROMPTED, not ENFORCED — the prompted-vs-enforced distinction
# from Chapters 7 and 13. For genuinely high-stakes actions, the actual gating
# belongs in your ARCHITECTURE, not solely in prompt wording.

class GatedToolExecutor:
    """Architecture-level enforcement: high-stakes tools require human approval."""
    
    HIGH_STAKES_TOOLS = {"send_email", "refund_order", "delete_record", "deploy_code"}
    
    async def execute(self, tool_name: str, tool_input: dict) -> dict:
        if tool_name in self.HIGH_STAKES_TOOLS:
            # Present to human for approval — the prompt SUGGESTS this, but
            # the ARCHITECTURE GUARANTEES it. The tool simply can't execute
            # without a separate approval signal from the application.
            approval = await self.request_human_approval(tool_name, tool_input)
            if not approval.approved:
                return {"error": "Action not approved by human reviewer", "reason": approval.reason}
        
        return await self._execute_tool(tool_name, tool_input)

    async def request_human_approval(self, tool_name: str, tool_input: dict) -> dict:
        """Present the action in a way that highlights what's RISKY about it —
        not just dumping raw parameters for rubber-stamping."""
        return await self.approval_ui.show(
            tool=tool_name,
            params=tool_input,
            risk_flags=self._assess_risk(tool_name, tool_input),
            # risk_flags highlight: first-time action? unusually large amount?
            # external recipient? irreversible? — what's DIFFERENT about this call.
        )

# A checkpoint that dumps raw parameters with no highlighting gets rubber-stamped
# exactly like naive self-verification (Chapter 11). Design the approval interface
# to surface what's UNUSUAL or RISKY about this specific action.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="python" filename="tips.py"}
```python
# [Idiom] Start with a single agent and only split when you have a CONCRETE,
# SPECIFIC reason. Write down the specific failure a single agent hit before
# reaching for multi-agent. "It felt complex" is not specific enough.

# [Idiom] Give every sub-agent brief a strict, explicit scope boundary.
# "research the regulatory landscape" → wanders broadly.
# "determine which agency has AV testing jurisdiction in CA, as of 2026" → stays on-task.

# [Debug] Log every agent's full input and output, keyed by task id, from day one.
# Retrofitting observability into a multi-agent system after it's already misbehaving
# in production is dramatically harder. Diffused accountability makes post-hoc
# debugging hard without per-agent logging.

# [Idiom] Cap total sub-agent dispatches and total orchestration rounds explicitly.
# An unbounded "re-dispatch until satisfied" loop is a cost and latency risk that's
# easy to overlook during development and expensive to discover in production.

# [Idiom] Treat the orchestrator's synthesis prompt with as much care as any
# sub-agent's. It's often where the most consequential integration errors happen:
# silently resolved contradictions, dropped caveats.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python" filename="edge_cases.py"}
```python
# [Gotcha] A sub-agent with too little context makes confidently wrong assumptions
# — a brief omitting a constraint the orchestrator considered "obvious" produces a
# technically-responsive but practically-useless result, with no way for the sub-agent
# to know what it wasn't told.

# [Safety] Multi-agent systems can be MORE vulnerable to prompt injection, not less.
# Untrusted content encountered by one sub-agent can be passed along in its report
# and influence the orchestrator downstream — laundering an injection through what
# looks like a trusted internal handoff. Treat sub-agent outputs derived from
# untrusted sources with the SAME caution as the original untrusted content (Chapter 18).

# [Gotcha] Parallel sub-agents can silently DUPLICATE cost on overlapping work if
# the orchestrator's decomposition wasn't actually independent — two "independent"
# sub-questions requiring the same source waste tokens and produce conflicting partials.

# [Gotcha] A synthesis step can be fooled by confidence mismatches — a sub-agent
# phrasing a shaky finding assertively and another hedging a solid finding leads
# the orchestrator to weight them backwards, unless briefs require honest confidence.

# [Safety] Human-in-the-loop checkpoints only work if a human is actually positioned
# to catch a problem — a wall of tool-call parameters with no highlighting gets
# rubber-stamped. Design the approval interface to highlight what's RISKY about
# this specific action.
```
::

## 🧠 Spot the Bug

A multi-agent system: triage agent classifies issues and dispatches to one of three specialists (billing/technical/account). Each specialist independently resolves and responds directly to the customer. A message mentions a billing issue AND an account lockout. Triage classifies as BILLING, passes only a one-line billing summary. The billing specialist resolves the billing question and closes the ticket — the account lockout is never addressed. What's the architectural flaw?

<details>
<summary>Answer</summary>

The triage agent's brief was reduced to a single classification-driven summary, which necessarily discards anything that doesn't fit the chosen category. The account lockout was lost because the billing specialist never saw it, and the triage agent's one-line summary didn't include it.

A better prompt for the triage agent (explicitly instructing it to flag ALL distinct issues, not just the primary one) would help marginally. But the deeper fix is **structural**: a message containing multiple distinct issues shouldn't be forced through a single-category dispatch at all. The more robust architecture either:

1. Lets the triage agent dispatch to multiple specialists when multiple distinct issues are present, or
2. Passes the FULL original customer message to the specialist (not a lossy one-line summary), so the specialist can notice a secondary issue outside its specialty and flag it for escalation.

The lesson: forcing a multi-issue input through a single classification-and-summarize handoff will systematically lose whatever the classification step didn't prioritize. When messages can contain more than one distinct concern, the handoff *design* (not just the prompt wording) needs to account for that.

</details>

## Key Takeaways

::code-wrapper{language="python" filename="key_takeaways.py"}
```python
"""
Multi-agent & agentic workflows — distributing autonomy.
"""

# 1. An agent = goal + tools + autonomy. Multi-agent = autonomy across narrower
#    agents coordinated by an orchestrator. Treat multi-agent as added-complexity
#    needing SPECIFIC justification, not a default for anything complex.

# 2. Multi-agent earns its cost when: roles need different tools/permissions,
#    parallel exploration is valuable, single-agent context would be unmanageable,
#    or an independent reviewing agent provides a real check.

# 3. Sub-agent briefs must be COMPLETE and SELF-CONTAINED — sub-agents don't
#    inherit orchestrator context. Handoffs should be STRUCTURED (facts, confidence,
#    open_questions), not raw transcripts.

# 4. Multi-agent failure modes: ambiguous handoffs, redundant/contradictory parallel
#    work, runaway coordination loops, diffused accountability. Log everything
#    per-agent from day one — debugging without per-agent logs is nearly impossible.

# 5. Prompted caution ("ask for approval before high-stakes actions") must be backed
#    by ARCHITECTURAL enforcement for genuinely irreversible actions. And human
#    checkpoints must highlight what's RISKY about a specific action — not just
#    dump parameters for rubber-stamping.
```
::
