---
title: "08 — Context & Memory Management"
description: "Context as a finite budget — sliding window, summarization, structured memory, prompt caching, and the layered production architecture. Anti-patterns for silent truncation and stale memory. Code-first reference for mid-to-senior engineers."
---

# 08 — Context & Memory Management

## The Problem: Context Is Finite, Conversations Aren't

The model has no memory across API calls. "Memory" in a chat product = resending the transcript every time. Any application supporting ongoing conversation is doing context management whether it realizes it or not.

## Anti-Pattern: Naive Full-History Resend

::code-wrapper{language="python" filename="naive_history.py"}
```python
# ANTI-PATTERN: append every turn, resend everything, hope the window never fills.
messages = []

def chat(user_input: str) -> str:
    messages.append({"role": "user", "content": user_input})
    response = client.messages.create(
        model="claude-opus-5",
        max_tokens=1024,
        messages=messages,
    )
    reply = response.content[0].text
    messages.append({"role": "assistant", "content": reply})
    return reply

# FAILS in three predictable ways as conversation grows:
# 1. Context limit exceeded → request errors out (no graceful degradation)
# 2. Paying for tokens you don't need → cost/latency scale unboundedly
# 3. Quality degrades BEFORE the hard limit → "lost in the middle" effect:
#    a technically-valid 150K-token request produces worse answers than a
#    well-curated 20K-token one because effective attention to any given fact
#    drops as context grows and the fact's position drifts toward the middle.
```
::

## Strategy 1: Sliding Window Truncation

::code-wrapper{language="python" filename="sliding_window.py"}
```python
MAX_TURNS = 20

def trim(messages: list[dict]) -> list[dict]:
    """Keep only the most recent N turns, drop older ones entirely."""
    if len(messages) <= MAX_TURNS:
        return messages
    return messages[-MAX_TURNS:]

# Works when older turns genuinely stop mattering (casual chat, independent Qs).
# FAILS BADLY when conversation has long-range dependency:
#   - User established "I'm allergic to shellfish" in turn 2
#   - On turn 40, that fact silently falls out of the window
#   - The model has no way to know it ever existed
# Naive truncation trades context safety for SILENT correctness risk —
# it doesn't fail loudly, it just quietly forgets.
```
::

## Strategy 2: Summarization Compaction

::code-wrapper{language="python" filename="summarization.py"}
```python
SUMMARIZE_PROMPT = """Summarize the conversation so far in no more than 200 words. Preserve:
- Any stated constraints, preferences, or facts about the user (allergies,
  budget limits, prior decisions, names/dates they've given).
- The current unresolved question or task, if any.
- Any commitments the assistant has already made ("I'll follow up with X").

Do not preserve pleasantries, small talk, or resolved side-tangents. Write
the summary as neutral third-person notes, not as a transcript.
"""

def compact(messages: list[dict], keep_recent: int = 6) -> list[dict]:
    """Compress older turns into a summary, keep recent turns verbatim."""
    if len(messages) <= keep_recent + 1:
        return messages

    to_summarize = messages[:-keep_recent]
    recent = messages[-keep_recent:]

    summary_response = client.messages.create(
        model="claude-opus-5",
        max_tokens=300,
        messages=[{"role": "user", "content": f"{SUMMARIZE_PROMPT}\n\nConversation:\n{format_messages(to_summarize)}"}],
    )
    summary = summary_response.content[0].text

    return [{"role": "user", "content": f"[Conversation summary so far: {summary}]"}] + recent

# TRIGGER: compact at 60-70% of working budget, NOT at the last possible moment.
# Waiting until you're one turn from the limit means the summarization call
# itself processes near-maximal context — slow and expensive.
# Compacting earlier is cheaper and produces better summaries.

# TRADEOFF: summarization is lossy and one-directional. A detail dropped from
# the summary is GONE. If it matters three turns later, there's no recovery
# without asking the user to repeat themselves. See Strategy 3 for a better fix.
```
::

## Strategy 3: Structured Memory (Non-Lossy)

::code-wrapper{language="python" filename="structured_memory.py"}
```python
import json
from dataclasses import dataclass, field, asdict

@dataclass
class StructuredMemory:
    """Application-maintained state, injected into every prompt at fixed token cost.
    Unlike transcript memory, this is EXACT and NON-LOSSY — the fact doesn't
    degrade or disappear regardless of conversation length."""

    user_facts: dict[str, any] = field(default_factory=dict)
    task_state: dict[str, any] = field(default_factory=dict)

    def update_fact(self, key: str, value: any) -> None:
        """Update (not just add) — critical for preventing stale facts."""
        self.user_facts[key] = value

    def render(self) -> str:
        """Render into system prompt at small, fixed token cost."""
        lines = ["Known facts about this user (treat as ground truth, do not "
                 "ask again unless they explicitly update one):"]
        for key, value in self.user_facts.items():
            lines.append(f"- {key.replace('_', ' ').title()}: {value}")
        if self.task_state:
            lines.append(f"\nCurrent task state: {self.task_state.get('current_goal', 'none')}")
            if self.task_state.get("confirmed"):
                lines.append(f"Confirmed: {', '.join(self.task_state['confirmed'])}")
            if self.task_state.get("still_needed"):
                lines.append(f"Still need: {', '.join(self.task_state['still_needed'])}")
        return "\n".join(lines)

# Example state:
memory = StructuredMemory()
memory.user_facts = {
    "dietary_restrictions": ["shellfish allergy"],
    "preferred_name": "Priya",
    "timezone": "Asia/Kolkata",
}
memory.task_state = {
    "current_goal": "planning a 5-day Kerala itinerary",
    "confirmed": ["dates: Nov 12-17", "budget: moderate"],
    "still_needed": ["hotel preference", "interest in backwater tours"],
}

# Injected into EVERY system prompt, regardless of conversation length:
print(memory.render())
# Known facts about this user (treat as ground truth, do not ask again...):
# - Dietary Restrictions: ['shellfish allergy']
# - Preferred Name: Priya
# - Timezone: Asia/Kolkata
#
# Current task state: planning a 5-day Kerala itinerary
# Confirmed: dates: Nov 12-17, budget: moderate
# Still need: hotel preference, interest in backwater tours

# This is how most production "the assistant remembers me across sessions" features
# actually work: not by resending an ever-growing transcript, but by maintaining a
# small structured profile that's cheaply re-injected every time.
```
::

## Prompt Caching

::code-wrapper{language="python" filename="prompt_caching.py"}
```python
# Prompt caching is NOT memory across turns — it's efficiency within/across
# requests that share a long, unchanging PREFIX. If a subsequent request
# reuses the exact same prefix, the provider skips reprocessing it → reduced
# latency + reduced cost for the cached portion.

LONG_STATIC_SYSTEM_PROMPT = "..."  # your durable system prompt, reference docs, etc.

response = client.messages.create(
    model="claude-opus-5",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": LONG_STATIC_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},  # ← mark as cacheable
        }
    ],
    messages=[{"role": "user", "content": user_question}],  # ← variable part goes LAST
)

# CRITICAL DESIGN IMPLICATION:
# Structure prompts so STABLE, REUSABLE parts (system instructions, reference
# docs, large few-shot sets) come FIRST and stay byte-for-byte identical across
# calls. VARIABLE parts (user question, latest turn) come LAST.
#
# A prompt that interleaves static and dynamic content throughout DEFEATS caching
# — any change earlier in the prompt invalidates the cache for everything after it.
#
# cache_valid = prefix_identical(request, previous_request)
# if any token in [0..n] differs → cache invalidated for [n..end]
# → order matters: static first, dynamic last
```
::

## Production Layered Architecture

::code-wrapper{language="python" filename="layered_architecture.py"}
```python
"""
A realistic production system layers all strategies:
  1. Structured memory → durable facts (small, exact, cheap)
  2. Rolling summary → gist of older conversation (lossy, compact)
  3. Recent turns verbatim → short-range coherence (exact wording)
  4. Stable cacheable system prefix → cost/latency optimization
"""

def assemble_context(
    system_prompt: str,        # STABLE: persona, rules, format constraints
    memory: StructuredMemory,   # STRUCTURED: user facts, task state
    summary: str,               # ROLLING: compressed older conversation
    recent_turns: list[dict],   # RECENT: last N messages, verbatim
    current_message: str,       # CURRENT: the user's latest input
) -> dict:
    """Assemble the full context with cache-friendly ordering."""
    # Layer 1: system prompt (cached, byte-identical across calls)
    # Layer 2: structured memory (regenerated from app state, small)
    # Layer 3: rolling summary (compressed older turns)
    # Layer 4: recent turns (verbatim, last 6)
    # Layer 5: current user message

    full_system = f"{system_prompt}\n\n{memory.render()}"

    messages = []
    if summary:
        messages.append({"role": "user", "content": f"[Conversation summary: {summary}]"})
    messages.extend(recent_turns)
    messages.append({"role": "user", "content": current_message})

    return {
        "system": [{
            "type": "text",
            "text": full_system,
            "cache_control": {"type": "ephemeral"},
        }],
        "messages": messages,
    }

# Each layer answers a different question:
# - System prompt: what never changes? (persona/rules)
# - Structured memory: what's true regardless of conversation length? (facts/state)
# - Rolling summary: what happened a while ago that still matters in gist?
# - Recent turns: what happened just now that matters in exact wording?
# - Current message: what is the user asking right now?
```
::

## 💡 Tips & Tricks

::code-wrapper{language="python" filename="tips.py"}
```python
# [Performance] Budget context like money, not like an afterthought. Decide
# explicitly what fraction is reserved for system, memory, history, and output.
# Treat exceeding any budget as a BUG, not something to patch reactively.

# [Idiom] Summarize BEFORE you're forced to, not after. Waiting until the context
# limit to trigger summarization means the summarization call itself processes
# near-maximal context — slow and expensive. Trigger at 60-70% of budget.

# [Idiom] Let the model flag what's worth remembering. Ask at end of turn:
# "Was there anything in this exchange worth persisting to long-term memory?
# If so, state it as a short fact." This shifts judgment about WHAT matters
# onto the model, which can be more accurate than generic summarization.

# [Performance] Cache-friendly ordering pays for itself even in single-shot use.
# Putting static reference material (product catalog, style guide, FAQ) ahead
# of the variable question saves cost across many independent requests sharing
# that prefix — even without multi-turn conversations.

# [Idiom] Re-inject critical constraints near the END, not just at the start.
# For any fact that absolutely cannot be forgotten (hard safety constraint,
# legal disclaimer), restate it close to where generation begins — counteracts
# the position effects that weaken mid-context instructions.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python" filename="edge_cases.py"}
```python
# [Gotcha] Silent truncation is WORSE than a visible error. A sliding window that
# quietly drops old turns causes the model to contradict something the user said
# earlier — no error, no warning, no way for the user to know why. They'll just
# experience the assistant as "forgetting." Prefer strategies that ATTEMPT to
# carry facts forward (structured memory, summarization) over ones that guarantee
# loss past a fixed turn count.

# [Gotcha] Summaries can confidently misrepresent what was said. A summarization
# pass is itself a generation subject to hallucination (Chapter 17). It can
# compress "the user said they're NOT sure about the budget" into "budget:
# confirmed" — inverting the meaning while looking well-formed. Treat summaries
# as lossy, fallible compression, not verified records.

# [Gotcha] Prompt caching has a TTL shorter than you might assume. Cached
# prefixes typically expire after a few minutes of inactivity (provider-specific).
# A conversational app with long user think-time between turns may not benefit
# from caching as much as benchmarks suggested — the cache expired before the
# next request arrived.

# [Gotcha] Structured memory can go STALE without an update mechanism. A "known
# fact" written in turn 3 ("budget": "moderate") needs a path for the user to
# change it later ("actually, let's go higher-end"). If your update logic only
# ADDS facts and never revises, structured memory becomes increasingly WRONG
# ground truth — arguably worse than no memory at all, since the model states
# the stale fact with full confidence.

# [Gotcha] Combining strategies can double-count or contradict. If your rolling
# summary AND your structured memory both track "user's budget" and they drift
# out of sync (summary says "moderate," structured field updated to "high" but
# the old summary wasn't regenerated), the model receives contradictory
# information with no way to know which is current. Keep a SINGLE source of
# truth per fact — derive everything else from it.
```
::

## 🧠 Spot the Bug

A team builds a long-running coding assistant that truncates to the last 15 messages every turn — no summarization, no structured memory. A user establishes in turn 3 that their project uses a specific coding convention. By turn 20, the convention is gone from context. The assistant starts suggesting code that violates the convention. The user is confused because the assistant "knew" this earlier. What's the structural flaw?

<details>
<summary>Answer</summary>

Truncation with no compensating mechanism (structured memory or summarization) guarantees that any fact established early in the conversation silently disappears once it falls outside the window. The user experiences this as the assistant "forgetting" — but the assistant never knew anything; the fact was simply no longer in context.

The fix depends on the fact's nature:
- **Durable user facts/conventions** → structured memory (Strategy 3): extract the convention into a structured field that's re-injected every turn at fixed token cost, regardless of conversation length.
- **Conversation gist** → summarization (Strategy 2): compress older turns into a summary that carries the convention forward in compressed form.
- **Neither** → naive truncation is a guaranteed data-loss mechanism for any conversation long enough to exceed the window.

The deeper lesson: every context management strategy is a tradeoff between cost, fidelity, and complexity. Naive truncation is the cheapest and lowest-fidelity — acceptable only when older turns genuinely stop mattering. For any fact that must persist across the full conversation, use structured memory; for conversation flow, use summarization.

</details>

## Key Takeaways

::code-wrapper{language="python" filename="key_takeaways.py"}
```python
"""
Context & memory management — the finite budget problem.
"""

# 1. The model has NO persistent memory across API calls. "Memory" = the product
#    resending the transcript every turn. Context management is YOUR job.

# 2. Three strategies, in order of fidelity and complexity:
#    sliding_window: cheapest, silent data loss past N turns
#    summarization:  lossy compression, costs an extra model call per compaction
#    structured_memory: exact, non-lossy, fixed token cost — requires app logic
#    to decide when to write/update facts.

# 3. Prompt caching ≠ memory. It's efficiency for shared prefixes. Structure
#    prompts: STABLE first (cached), VARIABLE last. Any change early in the
#    prompt invalidates the cache for everything after it.

# 4. Production systems LAYER all three: structured memory (facts) + rolling
#    summary (gist) + recent verbatim turns (exact wording) + cacheable prefix.

# 5. Silent truncation is worse than a visible error — it causes the model to
#    "forget" with no warning. Always prefer strategies that ATTEMPT to carry
#    facts forward over ones that guarantee loss past a fixed count.
#    And: keep a SINGLE source of truth per fact to avoid contradictions between
#    parallel tracking mechanisms.
```
::
