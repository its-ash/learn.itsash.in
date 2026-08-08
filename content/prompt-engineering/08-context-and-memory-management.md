# 08 — Context & Memory Management

## The Problem: Context Is Finite, Conversations Aren't

Chapter 1 introduced the context window as a hard ceiling on how many tokens a model can process in one request. Chapter 7 mentioned schema drift over long conversations in passing. This chapter is about the discipline that sits underneath both: **any application that supports an ongoing conversation, a long document, or a persistent "session" is, whether its builders realize it or not, doing context management** — deciding what stays in the window, what gets dropped, what gets compressed, and what gets fetched back in on demand.

The model itself has no memory across API calls. Every request is stateless — what looks like "the assistant remembering what you said five messages ago" in a chat product is the product resending the entire transcript (or some curated subset of it) as part of the prompt, every single time. Once you internalize that, "memory" stops being a mysterious model capability and becomes an engineering problem you're directly responsible for solving.

## The Naive Approach and Why It Breaks

The simplest possible strategy is: keep appending every user and assistant turn to a list, and resend the whole list on every request.

::code-wrapper{language="python"}
```python
messages = []

def chat(user_input):
    messages.append({"role": "user", "content": user_input})
    response = client.messages.create(
        model="claude-opus-5",
        max_tokens=1024,
        messages=messages,
    )
    reply = response.content[0].text
    messages.append({"role": "assistant", "content": reply})
    return reply
```
::

This works fine for short conversations and fails in three predictable ways as the conversation grows:

1. **You hit the context limit.** Eventually `messages` plus your system prompt plus the model's reserved output space exceeds the window, and the request errors out entirely rather than degrading gracefully.
2. **You pay for tokens you don't need.** Every turn resends the entire history, even turns that are no longer relevant to the current question — cost and latency both scale with conversation length, unboundedly, for no benefit past a certain point.
3. **Quality degrades before you hit the hard limit.** As covered in Chapter 1, models exhibit position effects — information in the middle of a long context is recalled less reliably than information near the start or end (the "lost in the middle" effect). A technically-valid 150K-token request can still produce worse answers than a well-curated 20K-token one, because the model's *effective* attention to any given fact drops as the context grows and that fact's relative position drifts toward the middle.

## Strategy 1: Sliding Window Truncation

The simplest real mitigation: keep the system prompt (which usually carries durable, high-value instructions) and the most recent *N* turns, dropping older turns entirely.

::code-wrapper{language="python"}
```python
MAX_TURNS = 20

def trim(messages):
    if len(messages) <= MAX_TURNS:
        return messages
    return messages[-MAX_TURNS:]
```
::

This is cheap to implement and works well when older turns genuinely stop mattering — a casual support chat where each question is largely independent of the last. It fails badly when the conversation has a long-range dependency: a user who established an important constraint in turn 2 ("I'm allergic to shellfish") and is now on turn 40 will have that fact silently fall out of the window, and the model has no way to know it ever existed. Naive truncation trades context-window safety for a real, silent correctness risk — it doesn't fail loudly, it just quietly forgets.

## Strategy 2: Summarization

A more robust approach is to periodically compress older turns into a summary that preserves the load-bearing facts while shedding the verbatim text:

::code-wrapper{language="markdown"}
```markdown
Summarize the conversation so far in no more than 200 words. Preserve:
- Any stated constraints, preferences, or facts about the user (allergies,
  budget limits, prior decisions, names/dates they've given).
- The current unresolved question or task, if any.
- Any commitments the assistant has already made ("I'll follow up with X").

Do not preserve pleasantries, small talk, or resolved side-tangents. Write
the summary as neutral third-person notes, not as a transcript.
```
::

The resulting summary replaces the raw older turns in the message list, and the most recent handful of turns are kept verbatim:

::code-wrapper{language="python"}
```python
def compact(messages, keep_recent=6):
    if len(messages) <= keep_recent + 1:
        return messages
    to_summarize = messages[:-keep_recent]
    recent = messages[-keep_recent:]
    summary = summarize(to_summarize)
    return [{"role": "user", "content": f"[Conversation summary so far: {summary}]"}] + recent
```
::

This costs an extra model call each time you compact (the summarization itself is a generation), but it preserves far more of the conversation's actual substance per token than either raw truncation or hoping the window never fills. The tradeoff to be honest about: summarization is lossy and one-directional — a detail dropped from the summary is gone, and if that detail turns out to matter three turns later, there's no way to recover it without asking the user to repeat themselves.

### Recursive summarization

For genuinely long-running sessions (a multi-day support case, a long-form writing collaboration), a single summarization pass isn't enough — you'll eventually need to summarize a summary. Each additional layer of compression loses more fidelity, so recursive summarization should be treated as a last resort, not a default: prefer keeping the *most recent* raw summary plus new recent turns, and only re-summarize the summary itself when it, too, grows too large to keep resending in full.

## Strategy 3: Structured Memory Instead of Transcript Memory

A different, often better, strategy for anything with a well-defined shape (user preferences, known facts, task state) is to stop treating "memory" as a compressed transcript at all, and instead maintain it as **structured state your application updates**, separate from the raw conversation:

::code-wrapper{language="json"}
```json
{
  "user_facts": {
    "dietary_restrictions": ["shellfish allergy"],
    "preferred_name": "Priya",
    "timezone": "Asia/Kolkata"
  },
  "task_state": {
    "current_goal": "planning a 5-day Kerala itinerary",
    "confirmed": ["dates: Nov 12-17", "budget: moderate"],
    "still_needed": ["hotel preference", "interest in backwater tours"]
  }
}
```
::

This structured object gets rendered into the system prompt (or a dedicated context block) on every turn, in a fixed, compact form — no matter how long the underlying conversation has run:

::code-wrapper{language="markdown"}
```markdown
Known facts about this user (treat as ground truth, do not ask again unless
they explicitly update one):
- Dietary restriction: shellfish allergy
- Preferred name: Priya
- Timezone: Asia/Kolkata

Current task state: planning a 5-day Kerala itinerary. Confirmed: dates
Nov 12-17, moderate budget. Still need: hotel preference, interest in
backwater tours.
```
::

This is more engineering work than either truncation or summarization — you need logic somewhere (either your application code, or the model itself via a tool call, see Chapter 13) that decides when to write a new fact into this structure — but it gives you exact, non-lossy recall of the things that actually matter, at a small, fixed token cost, regardless of how long the surrounding conversation has run. This is essentially how most production "the assistant remembers me across sessions" features actually work: not by resending an ever-growing transcript, but by maintaining a small structured profile that's cheaply re-injected every time.

## Prompt Caching

A distinct but related concept — **not** memory across turns, but efficiency within and across requests that share a long, unchanging prefix. Several providers (Claude, GPT, and others, as of this writing — check current docs for exact mechanics and pricing on your target model) let you mark a portion of your prompt as cacheable, so that if a subsequent request reuses the exact same prefix, the provider can skip reprocessing it, at reduced latency and reduced cost for the cached portion.

::code-wrapper{language="python"}
```python
response = client.messages.create(
    model="claude-opus-5",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": LONG_STATIC_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }
    ],
    messages=[{"role": "user", "content": user_question}],
)
```
::

The practical implication for context management: **structure your prompts so that the stable, reusable parts (system instructions, a large reference document, a big few-shot example set) come first and stay byte-for-byte identical across calls, and the variable parts (the actual user question, the latest turn) come last.** A prompt that interleaves static and dynamic content throughout defeats caching, because any change earlier in the prompt invalidates the cache for everything after it. This is a case where the format of your prompt (ordering, stability of the prefix) has direct cost and latency consequences, not just quality ones — it's worth designing your context-assembly logic around cache-friendliness from the start, rather than retrofitting it later.

## Combining Strategies in Practice

A realistic production system rarely picks just one of the above — it layers them:

1. **Structured memory** for durable facts about the user/task (small, exact, cheap).
2. **A rolling summary** for the "gist" of the conversation beyond what's kept verbatim.
3. **The most recent N turns verbatim**, for short-range coherence and exact wording of the immediate exchange.
4. **A stable, cacheable system prompt prefix**, ordered so caching actually applies.

::code-wrapper{language="markdown"}
```markdown
[STABLE, CACHED: system instructions, persona, output format rules]

[STRUCTURED MEMORY: known user facts, current task state — regenerated
fresh each turn from application state, not from raw transcript]

[ROLLING SUMMARY: compressed notes on the conversation prior to the
last 6 turns]

[RECENT TURNS: last 6 user/assistant messages, verbatim]

[CURRENT USER MESSAGE]
```
::

Each layer answers a different question: what never changes (persona/rules), what's true regardless of conversation length (facts/state), what happened a while ago but still matters in gist (summary), and what happened just now and matters in exact wording (recent turns).

## 💡 Tips & Tricks

- **Budget context like money, not like an afterthought** — Before writing summarization or truncation logic, decide explicitly what fraction of your context window is reserved for system instructions, structured memory, conversation history, and the model's own output, and treat exceeding any one of those budgets as a bug to fix, not something to patch reactively when a request finally errors.
- **Summarize before you're forced to, not after** — Waiting until you're one turn away from the context limit to trigger summarization means your summarization call itself has to process a near-maximal context, which is slow and expensive. Trigger compaction at a comfortable threshold (e.g., 60–70% of your working budget), not at the last possible moment.
- **Let the model flag what's worth remembering** — Rather than only ever summarizing algorithmically after the fact, some production systems ask the model, at the end of a turn, "was there anything in this exchange worth persisting to long-term memory? If so, state it as a short fact." This shifts some of the judgment about *what matters* onto the model itself, which can be more accurate than a generic summarization prompt for domain-specific "important facts."
- **Cache-friendly ordering pays for itself even in single-shot use** — Even an application that never has multi-turn conversations benefits from putting static reference material (a product catalog, a style guide, a large FAQ) ahead of the variable question in the prompt, purely for prompt-caching cost savings across many independent requests that share that static prefix.
- **Re-inject critical constraints near the end, not just once at the start** — For any fact that absolutely cannot be forgotten (a hard safety constraint, a legal disclaimer requirement), don't rely solely on it being stated once in a system prompt at the top of a long context — restate it, briefly, close to where generation begins, to counter the position effects covered in Chapter 1.

## ⚠️ Edge Cases & Gotchas

- **Silent truncation is worse than a visible error.** A sliding-window strategy that quietly drops old turns can cause the model to contradict something the user said earlier, with no error, no warning, and no way for the user to know why — they'll just experience the assistant as "forgetting" and, worse, may not realize it happened until the consequence surfaces (e.g., a shellfish dish gets recommended anyway). Wherever feasible, prefer strategies (structured memory, summarization) that at least *attempt* to carry the fact forward over ones that guarantee its loss past a fixed turn count.
- **Summaries can confidently misrepresent what was said.** A summarization pass is itself a generation, subject to the same hallucination risks as any other model output (see Chapter 17) — it can compress "the user said they're *not* sure about the budget" into "budget: confirmed," inverting the meaning while looking perfectly well-formed. Treat summaries as a lossy, fallible compression, not a verified record, and where a fact is critical, prefer structured extraction with an explicit schema over prose summarization.
- **Prompt caching has a time-to-live, and it's shorter than you might assume.** Cached prefixes typically expire after a few minutes of inactivity (exact duration is provider- and tier-specific, and changes — check current docs). A conversational application with long user think-time between turns may not actually benefit from caching as much as a benchmark suggested, because the cache has already expired by the time the next request arrives.
- **Structured memory can go stale without an update mechanism.** A "known fact" written to structured memory in turn 3 (`"budget": "moderate"`) needs an explicit path for the user to change it later ("actually, let's go higher-end") — if your update logic only ever adds facts and never revises them, structured memory becomes a source of *increasingly wrong* ground truth over time, which is arguably worse than no memory at all, since the model will state the stale fact with full confidence.
- **Combining strategies can double-count or contradict.** If your rolling summary and your structured memory both separately track "user's budget," and they drift out of sync (the summary says "moderate," the structured field was updated to "high" but the old summary sentence wasn't regenerated), the model receives genuinely contradictory information in the same prompt and has no principled way to know which one is current — per Chapter 1, it will weigh both as real signals, not resolve the conflict for you. Keep a single source of truth per fact, and derive anything else (like summary text) from it, rather than maintaining parallel, independently-updated representations of the same information.

## 🧠 Spot the Issue

A team builds a long-running coding-assistant chat. To manage context, they truncate to the last 15 messages on every turn, with no summarization and no structured memory:

::code-wrapper{language="python"}
```python
def build_context(messages):
    return messages[-15:]
```
::

Users on long debugging sessions report that, after roughly 20-30 turns, the assistant starts suggesting fixes that contradict a design decision explicitly agreed on early in the conversation ("we decided to use optimistic locking, not pessimistic locking, for this table"), even though nothing about the current question directly touches locking. What's going wrong, and why does the fix depend on *what kind* of information was lost?

<details>
<summary>Answer</summary>

The design decision was made in a turn that has now aged out of the 15-message window — pure truncation has no concept of "this fact is important, keep it regardless of age," it only knows recency. Because the decision doesn't get restated or referenced in the recent turns (it was a one-time agreement, not something repeated), it's now genuinely absent from what the model sees, and the model has no way to distinguish "this constraint was never established" from "this constraint aged out of context" — from its point of view, both look identical: the fact simply isn't there. The fix depends on the kind of information because a decision like this is exactly the case structured memory is suited for (a durable, discrete fact: "locking strategy: optimistic," which should persist verbatim regardless of conversation length) rather than something a rolling summary would reliably retain (summaries are lossy and tend to compress toward the gist of recent exchanges, not preserve a single early architectural decision word-for-word many turns later). Sliding-window truncation alone is the wrong tool for any fact whose relevance doesn't correlate with recency.

**The lesson**: recency-based truncation silently discards anything important that was only ever stated once and doesn't reappear — durable decisions, constraints, and facts need a persistence mechanism (structured memory, in this case) that doesn't depend on staying within a fixed recent-turn window.

</details>

## Key Takeaways

- The model has no memory between API calls — every "memory" behavior in a product is the result of application logic deciding what to resend, summarize, or store, and that decision is entirely your responsibility to get right.
- Naive full-transcript resending fails in three ways as conversations grow: hitting hard context limits, wasting tokens on irrelevant history, and degrading quality due to position effects even before the limit is reached.
- Sliding-window truncation is cheap but silently drops anything that was stated once and never repeated, regardless of how important it was — a real correctness risk, not just a cost optimization tradeoff.
- Summarization preserves more substance per token than truncation but is itself a lossy, fallible generation — treat compressed summaries as approximate, not as a verified record, especially for facts that must be exact.
- Structured memory (explicit fields your application maintains and re-injects) gives exact, low-cost recall for durable facts and task state, independent of conversation length, at the cost of needing explicit update logic to avoid staleness.
- Prompt caching is a distinct, complementary technique for cost/latency (not cross-turn memory) that rewards keeping a stable, identically-ordered prefix — structure prompts with static content first and variable content last to take advantage of it.
