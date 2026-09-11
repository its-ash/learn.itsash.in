---
title: 01 — Introduction & How LLMs Work
description: The mechanical underpinnings of LLMs — next-token prediction, tokenization, context budgets, and inference-time conditioning — shown through production-grade annotated code, anti-patterns, edge cases, and failure modes.
---

# 01 — Introduction & How LLMs Work

## The Core Mechanism: Next-Token Prediction

::code-wrapper{language="python" filename="next_token_prediction.py"}
```python
import torch
from torch.nn.functional import softmax, log_softmax
from dataclasses import dataclass

@dataclass
class GenerationConfig:
    """Sampling parameters that shape the probability distribution at each step."""
    temperature: float = 1.0       # >1 flattens (more random), <1 sharpens (more deterministic)
    top_k: int = 0                 # 0 = disabled; otherwise only consider top-k logits
    top_p: float = 1.0             # 1.0 = disabled; otherwise nucleus sampling — smallest set whose cumulative prob >= top_p
    max_tokens: int = 512          # hard stop regardless of EOS
    stop_sequences: tuple[str, ...] = ()  # early termination on exact string match

def generate_next_token(
    model,                        # frozen transformer — weights never change during inference
    token_ids: torch.Tensor,      # shape: [seq_len] — the full context so far, including model's own output
    config: GenerationConfig,
    is_first_token: bool = False,  # first generation step after the user prompt
) -> int:
    """
    The ONE thing an LLM does: given a token sequence, produce the next token id.
    Everything — reasoning, coding, refusal, translation — is this function called in a loop.
    """
    with torch.no_grad():                # inference only — no gradient computation, no weight updates
        logits = model(token_ids)        # [vocab_size] — raw unnormalized scores for every possible next token

    # --- Temperature: scales logits before softmax ---
    # temperature=0.5 makes high-probability tokens even more likely (sharper distribution)
    # temperature=2.0 flattens, making low-probability tokens more likely (more creative / noisier)
    if config.temperature != 1.0:
        logits = logits / config.temperature   # divide logits by T; T<1 amplifies differences, T>1 dampens them

    # --- Top-k: keep only the k highest-scoring tokens, set rest to -inf ---
    if config.top_k > 0:
        top_vals, _ = torch.topk(logits, config.top_k)
        min_val = top_vals[-1]                       # the k-th highest logit
        logits = torch.where(logits < min_val, torch.tensor(float('-inf')), logits)

    # --- Top-p (nucleus): keep smallest set of tokens whose cumulative prob >= top_p ---
    if config.top_p < 1.0:
        sorted_logits, sorted_idx = torch.sort(logits, descending=True)
        cumulative_probs = torch.cumsum(softmax(sorted_logits, dim=-1), dim=-1)
        # mask tokens that fall outside the nucleus (past the cumulative threshold)
        sorted_mask = cumulative_probs - softmax(sorted_logits, dim=-1) > config.top_p
        sorted_logits[sorted_mask] = float('-inf')
        logits = torch.full_like(logits, float('-inf'))
        logits[sorted_idx] = sorted_logits          # scatter back to original positions

    # --- Sample from the (possibly filtered, temperature-scaled) distribution ---
    probs = softmax(logits, dim=-1)                 # normalize to a valid probability distribution
    next_token_id = torch.multinomial(probs, num_samples=1).item()

    # NOTE: even with temperature=0 (greedy = argmax), floating-point non-determinism
    # across GPU batches means you CANNOT guarantee bit-identical output run-to-run.
    # Never build a system that assumes exact reproducibility from an LLM.
    return next_token_id

def generate_loop(model, prompt_ids: list[int], config: GenerationConfig) -> list[int]:
    """The autoregressive loop: append, re-feed, repeat. Each token depends on ALL prior tokens."""
    token_ids = torch.tensor(prompt_ids)
    generated: list[int] = []
    for i in range(config.max_tokens):
        next_id = generate_next_token(model, token_ids, config, is_first_token=(i == 0))
        if next_id == model.eos_token_id:            # end-of-turn marker — model decided it's done
            break
        generated.append(next_id)
        token_ids = torch.cat([token_ids, torch.tensor([next_id])])
        # CRITICAL: the model conditions on its OWN output as it generates.
        # If it starts hedging ("I'm not sure, but..."), those tokens make further hedging
        # more probable — the model can "talk itself into" a stance it wouldn't have started with.
    return generated
```
::

The entire field of prompt engineering targets the `prompt_ids` input to this loop. Every technique in this course — few-shot examples, chain-of-thought, system prompts, XML structuring — is a way of shaping the token sequence that enters `generate_loop`, which in turn shapes the probability distribution sampled at each step.

## Training vs. Inference

::code-wrapper{language="python" filename="training_vs_inference.py"}
```python
from dataclasses import dataclass

@dataclass
class TrainingPhase:
    """What happens BEFORE you ever send a request. You control NOTHING here."""
    objective: str = "next-token prediction via gradient descent"
    # The model's weights are adjusted over billions of text examples so that
    # P(next_token | context) increasingly matches the training distribution.
    alignment: tuple[str, ...] = ("RLHF", "DPO", "constitutional_ai")
    # After base pretraining, fine-tuning + human-feedback alignment shapes
    # instruction-following, refusal behavior, and helpfulness.
    weights_change: bool = True              # ← THIS is the defining difference
    you_control: tuple[str, ...] = ()        # nothing — the provider already did this

@dataclass
class InferencePhase:
    """What happens when YOU send a request. You control EVERYTHING here."""
    weights_change: bool = False             # ← frozen. The model learns NOTHING new.
    # "In-context learning" is a misnomer — no learning occurs. You're selecting
    # which pre-trained distribution region to sample from via the tokens you supply.
    you_control: tuple[str, ...] = (
        "system_prompt",       # conditions the distribution toward a role/behavior region
        "user_prompt",         # the actual task
        "few_shot_examples",   # demonstrates the input→output mapping in-context
        "temperature",         # sampling entropy
        "top_k", "top_p",      # truncation of the candidate token set
        "max_tokens",          # generation budget
        "stop_sequences",      # early termination triggers
    )

# --- The key distinction for prompt engineers ---
# Training: model.weights <- gradient_step(loss(predictions, targets))
#   You weren't there. The model's capability ceiling is already fixed.
# Inference: output = sample(model.forward(your_tokens))
#   model.weights are READ-ONLY. Your ONLY lever is the token sequence you send.
#   A well-crafted few-shot prompt can approximate fine-tuned behavior —
#   without touching a single weight. This is why prompting is powerful.

@dataclass
class ChatMemoryIllusion:
    """Explains why 'chat memory' is not real memory."""
    # Every API call is stateless. The model has NO persistent state between calls.
    # What products call "memory" is actually:
    #   1. Your client code stores prior messages
    #   2. On each new request, the ENTIRE transcript is re-sent as input tokens
    #   3. The model re-reads everything from scratch — it has no idea it "remembers"
    # This means: longer "memory" = more input tokens = more cost + latency per turn
    # AND eventually the transcript exceeds the context window and old messages
    # must be dropped, summarized, or truncated — silently, if you're not careful.
    api_is_stateless: bool = True
    memory_mechanism: str = "client resends full transcript as tokens each request"
```
::

## Tokenization

::code-wrapper{language="python" filename="tokenizer_inspection.py"}
```python
"""
Compare how different tokenizers split the 'same' text.
This is why token-count estimates do NOT transfer between models.
"""
from typing import Literal

# --- Simulated BPE (byte-pair encoding) tokenizers for demonstration ---
# Real tokenizers (tiktoken for GPT, Claude's, Gemini's) have 50K-200K vocab entries.
# The merge rules are learned from a training corpus — and that corpus is English-heavy.

# In production, use the actual provider tokenizer, never a word-count heuristic:
#   import tiktoken
#   enc = tiktoken.encoding_for_model("gpt-4o")
#   tokens = enc.encode("strawberry")  # → [straw, berry] or similar — NOT ['s','t','r',...]

def tokenize_naive_word_split(text: str) -> list[str]:
    """What beginners ASSUME the model sees. Wrong — models never see words."""
    return text.split()

def tokenize_bpe_english(text: str) -> list[str]:
    """Simulated English-trained BPE. Whole words and common subwords merge."""
    # "strawberry" might be 1-2 tokens; common words like "the" = 1 token
    # Numbers like "1234" might be 1 token ("1234") or split ("12","34")
    merges = {"strawberry": ["straw", "berry"], "tokenization": ["token", "ization"],
              "the": ["the"], "1234": ["1234"], "54321": ["543", "21"]}
    tokens = []
    for word in text.split():
        word = word.strip(",.;!?")
        tokens.extend(merges.get(word, [word]))
    return tokens

def tokenize_bpe_japanese(text: str) -> list[str]:
    """Simulated BPE applied to Japanese — far less efficient due to English-dominant vocab."""
    # Non-Latin scripts tokenize poorly: same semantic content costs 2-3x more tokens
    # because the tokenizer's merge table has few non-English entries
    return list(text.replace(" ", ""))  # char-level fallback — many more tokens

# --- THE strawberry problem ---
# "How many r's in strawberry?" — the model fails because:
#   1. "strawberry" is 1-2 tokens, NOT 9 character tokens
#   2. The model has no internal character-level representation
#   3. It must INFER letter composition from training patterns, not read it
# Fix in production: ask the model to spell it out first, or use a code-execution tool.

# --- THE number tokenization problem ---
# "1234" → ["1234"] (1 token)  vs  "54321" → ["543", "21"] (2 tokens)
# This is why LLM arithmetic is unreliable: multi-digit math is pattern-completion
# over number-tokens of varying granularity, NOT digit-by-digit school arithmetic.
# Fix: let the model write intermediate steps (chain-of-thought) or call a calculator tool.

# --- Token budget comparison utility ---
def estimate_token_cost(text: str, tokenizer: Literal["gpt", "claude", "gemini"],
                        input_price_per_1k: float, output_price_per_1k: float) -> dict:
    """Compare token counts across tokenizers — never assume parity."""
    # In production, call the actual token-count API for each provider.
    # Heuristic ratios (APPROXIMATE, always verify with real tokenizer):
    ratios = {"gpt": 4.0, "claude": 3.8, "gemini": 4.2}  # chars per token (English prose)
    estimated_tokens = max(1, len(text) // ratios[tokenizer])
    return {
        "tokenizer": tokenizer,
        "char_count": len(text),
        "estimated_tokens": estimated_tokens,
        "estimated_input_cost_usd": round(estimated_tokens / 1000 * input_price_per_1k, 6),
        "warning": "Non-English text and code typically cost 1.5-3x more tokens than this estimate",
    }
```
::

## Context Windows

::code-wrapper{language="python" filename="context_budget_allocator.py"}
```python
"""
A production context-budget allocator.
Context window is a BUDGET, not a bottomless bucket — every token costs money + latency.
"""
from dataclasses import dataclass, field
from enum import Enum

class TokenAllocationError(Exception):
    """Raised when allocations exceed the context budget — fail loudly, never truncate silently."""

class Section(Enum):
    SYSTEM_PROMPT    = "system_prompt"
    FEW_SHOT         = "few_shot_examples"
    USER_MESSAGE     = "user_message"
    RETRIEVED_DOCS   = "retrieved_documents"
    CONVERSATION     = "conversation_history"
    TOOL_OUTPUTS     = "tool_outputs"
    RESPONSE_RESERVE = "response_reserve"   # space set aside for the model's output

@dataclass
class ContextBudget:
    """Validated token budget for a single API request."""
    model: str
    max_context: int                              # provider-documented context window limit
    allocations: dict[Section, int] = field(default_factory=dict)
    reserved_for_response: int = 4096             # never let input eat the response space

    def __post_init__(self):
        if self.reserved_for_response >= self.max_context:
            raise TokenAllocationError(
                f"Response reserve ({self.reserved_for_response}) must be < context window ({self.max_context})"
            )
        self.allocations[Section.RESPONSE_RESERVE] = self.reserved_for_response

    @property
    def available_for_input(self) -> int:
        """The hard ceiling for all input tokens (everything except the model's response)."""
        return self.max_context - self.reserved_for_response

    @property
    def total_allocated(self) -> int:
        return sum(v for k, v in self.allocations.items() if k != Section.RESPONSE_RESERVE)

    @property
    def remaining(self) -> int:
        return self.available_for_input - self.total_allocated

    def allocate(self, section: Section, tokens: int, strict: bool = True) -> None:
        """Reserve tokens for a section. Raises if it would overflow."""
        if tokens < 0:
            raise TokenAllocationError(f"Cannot allocate negative tokens for {section.value}")
        tentative_total = self.total_allocated + tokens - self.allocations.get(section, 0)
        if strict and tentative_total > self.available_for_input:
            raise TokenAllocationError(
                f"Allocating {tokens} tokens to {section.value} would exceed input budget "
                f"({tentative_total}/{self.available_for_input}). "
                f"Currently allocated: {self.total_allocated}. "
                f"Overflow by {tentative_total - self.available_for_input} tokens."
            )
        self.allocations[section] = tokens

    def truncate_to_fit(self, section: Section, content_tokens: int) -> int:
        """How many tokens of `content_tokens` can actually fit in the remaining budget."""
        space = min(content_tokens, self.available_for_input - self.total_allocated)
        return max(0, space)

# --- Production usage ---
budget = ContextBudget(model="claude-sonnet", max_context=200_000, reserved_for_response=4096)
budget.allocate(Section.SYSTEM_PROMPT, 800)
budget.allocate(Section.FEW_SHOT, 1_200)
budget.allocate(Section.RETRIEVED_DOCS, 50_000)
budget.allocate(Section.CONVERSATION, 30_000)

# Simulate a user pasting a massive document
doc_tokens = 150_000
fits = budget.truncate_to_fit(Section.USER_MESSAGE, doc_tokens)
# → only ~118,000 tokens fit — the rest MUST be dropped, summarized, or chunked.
# NEVER silently truncate: the caller decides the strategy (summarize? embed+retrieve? error?)

# --- THE "lost in the middle" effect ---
# A 200K context window means the API ACCEPTS 200K tokens — NOT that the model
# reliably USES all 200K. Attention weight is position-dependent:
#   - Beginning tokens: high recall (primacy effect)
#   - End tokens: high recall (recency effect)
#   - Middle tokens: degraded recall (the "lost in the middle" valley)
# Production implication: put critical instructions at the START or END of context,
# not buried in the middle of a 50-page document dump.
```
::

## Why Prompting Works: Conditioning the Model

::code-wrapper{language="python" filename="conditioning_demo.py"}
```python
"""
Why "You are an expert tax attorney" produces better tax answers than "explain taxes".
The model has no persistent identity — you are selecting a REGION of its learned distribution.
"""
from dataclasses import dataclass

@dataclass
class PromptAsDistributionSelector:
    """
    During training, the model saw that text opening like an expert legal explainer
    is statistically followed by careful, hedged, jargon-appropriate content.
    Text opening like a casual forum post is followed by casual, less precise content.
    Your prompt selects WHICH distribution region to sample from.
    """
    prompt_prefix: str
    # The prefix conditions P(output | prefix) toward a specific region of learned behavior.

    def expected_output_region(self) -> str:
        """Maps prompt framing to the training-distribution region it activates."""
        regions = {
            "You are an expert tax attorney": "legal_explainer_region → hedged, precise, cites statutes",
            "explain tax implications":        "general_forum_region → casual, may omit edge cases, less hedged",
            "You are a senior Rust engineer":   "rust_expert_region → idiomatic code, mentions ownership/lifetimes",
            "write a rust function":            "beginner_region → may use .clone() excessively, miss lifetime annotations",
        }
        return regions.get(self.prompt_prefix, "default_region → average of training distribution")

# --- The mechanical view ---
# P(output | "You are an expert tax attorney. Explain...")  ≠  P(output | "explain taxes")
#                                                  ↑
#                          The prefix shifts the conditional probability mass.
#                          The model doesn't "become" a tax attorney —
#                          it samples from the text distribution that follows
#                          tax-attorney-style openings in its training data.

# --- Why early tokens are load-bearing ---
# Generation is autoregressive: token[n] is sampled conditioned on tokens[0..n-1].
# The FIRST output token disproportionately constrains all subsequent tokens.
#   If the model starts with "Based on IRC Section 280A..." → locked into citation-heavy mode
#   If the model starts with "Sure! So basically..." → locked into casual explainer mode
# This is why "the model starts well, it tends to finish well" — and the inverse.

# --- Anti-pattern: conflicting conditioning ---
# If your system prompt says "Be extremely concise" but your user prompt says
# "Explain in exhaustive detail with examples", the model isn't "confused" —
# it's weighting two REAL, contradictory signals in its context.
# Whichever has stronger positional/relevance attention weight wins, unpredictably.
# Fix: ensure system and user instructions are ALIGNED, not competing.
```
::

## A Production System Prompt Example

::code-wrapper{language="markdown" filename="triage_system_prompt.md"}
```markdown
You are a support-ticket triage assistant for a B2B SaaS company.

Your job: read the incoming support message and classify it into exactly
one of these categories: BILLING, BUG_REPORT, FEATURE_REQUEST, ACCOUNT_ACCESS,
or OTHER. Then extract the customer's stated urgency (LOW, MEDIUM, HIGH) based
on their own language, not your judgment of how urgent it "really" is.

Respond with only a JSON object in this exact shape:
{"category": "...", "urgency": "...", "summary": "one sentence, no more than 20 words"}

Rules:
- category MUST be one of the five uppercase strings above — no others, ever.
- urgency MUST be one of: LOW, MEDIUM, HIGH.
- summary MUST be a single sentence, maximum 20 words.
- If the message doesn't clearly fit one category, choose the closest one —
  always pick exactly one, never refuse or say "unclear".
- Do not include any text outside the JSON object. No preamble, no explanation.
```
::

::code-wrapper{language="python" filename="triage_validator.py"}
```python
"""Client-side validation for the triage system prompt above — never trust raw LLM output."""
import json
from dataclasses import dataclass
from enum import Enum

class Category(Enum):
    BILLING = "BILLING"
    BUG_REPORT = "BUG_REPORT"
    FEATURE_REQUEST = "FEATURE_REQUEST"
    ACCOUNT_ACCESS = "ACCOUNT_ACCESS"
    OTHER = "OTHER"

class Urgency(Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

@dataclass
class TriageResult:
    category: Category
    urgency: Urgency
    summary: str

    @classmethod
    def from_llm_output(cls, raw: str) -> "TriageResult":
        """Parse + validate LLM output. Raises on any deviation from the contract."""
        # Strip any accidental preamble/epilogue the model might add despite instructions
        raw = raw.strip()
        # Find the JSON object even if surrounded by stray text
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end == -1:
            raise ValueError(f"No JSON object found in LLM output: {raw[:100]!r}")
        try:
            data = json.loads(raw[start : end + 1])
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON from LLM: {e}") from e

        # Validate category against the enumerated set — reject anything else
        cat_str = data.get("category", "")
        try:
            category = Category(cat_str)
        except ValueError:
            raise ValueError(f"Invalid category {cat_str!r} — must be one of {[c.value for c in Category]}")

        # Validate urgency
        urg_str = data.get("urgency", "")
        try:
            urgency = Urgency(urg_str)
        except ValueError:
            raise ValueError(f"Invalid urgency {urg_str!r} — must be one of {[u.value for u in Urgency]}")

        summary = data.get("summary", "")
        if not summary or len(summary.split()) > 20:
            raise ValueError(f"Summary must be 1-20 words, got {len(summary.split())}: {summary!r}")

        return cls(category=category, urgency=urgency, summary=summary)
```
::

## 💡 Tips & Tricks

::code-wrapper{language="python" filename="tips_and_tricks.py"}
```python
# ─── [Performance] Token budgets are asymmetric: input is cheaper than output ───
# Most providers charge 3-5x more for output tokens than input tokens.
# Strategy: invest in MORE input context (examples, constraints, retrieved docs)
# to get SHORTER, more targeted output — cheaper AND higher quality.
#   BAD:  sparse prompt → model writes 800 output tokens exploring → expensive + verbose
#   GOOD: rich prompt with 5 examples → model writes 50 output tokens matching pattern → cheap + precise

# ─── [Debug] The "what text follows this?" mental model ───
# When output is bad, don't ask "why doesn't it understand me?"
# Ask: "In the training distribution, what text statistically follows what I wrote?"
#   You wrote an open-ended question → training data says open-ended questions get long rambling answers
#   Fix: constrain the output format so the continuation space is narrow

# ─── [Idiom] Use the provider's real tokenizer, not a heuristic ───
# import tiktoken
# enc = tiktoken.encoding_for_model("gpt-4o")
# exact_count = len(enc.encode(your_text))
# Never use len(text.split()) or len(text) // 4 for billing-critical calculations.
# Differences compound across long documents and across providers.

# ─── [Performance] Early tokens are load-bearing — front-load constraints ───
# Because generation is left-to-right autoregressive, the first sentence of the
# model's output shapes everything after it. If you can influence the opening
# (via formatting instructions or a strong constraint on the first line), do it.
# "Start your response with the JSON object. No preamble." ← this is a performance optimization.

# ─── [Safety] "Temperature 0" is NOT determinism ───
# Even greedy decoding (argmax) can produce different outputs across runs due to:
#   - floating-point non-determinism in GPU kernels
#   - batch-dependent parallelism (same request in different batches → different rounding)
#   - provider-side model versioning (silent weight updates between calls)
# Never build a system that assumes bit-for-bit reproducibility. Always have a
# validation layer that checks output STRUCTURE, not exact string equality.

# ─── [Idiom] Append boilerplate in post-processing, not in the prompt ───
# If every response needs a fixed footer (survey link, disclaimer), DON'T ask
# the model to generate it — append it in your application code after the API call.
# Why: forcing the model to emit fixed text BEFORE its substantive answer conditions
# every subsequent token on irrelevant context, degrading answer quality.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="python" filename="edge_cases.py"}
```python
# ─── [Gotcha] Empty / whitespace-only prompts produce chaos ───
def validate_user_input(prompt: str) -> str:
    """Never send empty input to the model — it has no conditioning signal."""
    if not prompt or not prompt.strip():
        raise ValueError("Empty prompt — model has zero conditioning, output is unpredictable.")
    return prompt.strip()
# Without validation: empty string → model outputs "How can I help you?" or hallucinated content
# With validation: fail explicitly, let the caller decide (default message? retry? error to user?)

# ─── [Gotcha] Silent truncation of the PROMPT itself, not just the answer ───
# If your input prompt approaches the context limit, naive client libraries may
# truncate the PROMPT — potentially cutting off your instructions before the task.
# The model then answers a question it never fully received. Output quality craters
# with no error message. Always check limits and fail loudly.
def safe_prompt_send(prompt: str, token_count_fn, max_input_tokens: int) -> str:
    count = token_count_fn(prompt)
    if count > max_input_tokens:
        raise ValueError(
            f"Prompt is {count} tokens, exceeds input limit {max_input_tokens}. "
            f"Truncating would cut instructions — refusing to send."
        )
    return prompt  # safe to send

# ─── [Gotcha] "Reasoning looks right, arithmetic is wrong" ───
# A model can write a flawless proof and then botch 54321 * 98765.
# Multi-digit arithmetic is token-pattern completion, not digit-by-digit computation.
# The model might tokenize "54321" as ["543", "21"] — it never "sees" individual digits.
# Fix: NEVER trust unaided LLM arithmetic for anything that matters.
#       Use a tool call / code execution for any numeric computation.
#       result = llm_with_tools.generate("Calculate 54321 * 98765", tools=[calculator_tool])

# ─── [Safety] Non-English text costs 2-3x more tokens for the same content ───
# A per-message token cap tuned for English users will truncate Japanese/Korean/Arabic/Hindi
# users far more aggressively — their messages hit the cap at half the semantic content.
# Fix: use character-aware or language-aware limits, not a flat token cap.
def adaptive_token_limit(text: str, base_limit: int) -> int:
    """Expand the token budget for non-Latin scripts that tokenize inefficiently."""
    non_latin_ratio = sum(1 for c in text if ord(c) > 0x2E80) / max(len(text), 1)
    # 0x2E80 = start of CJK radicals; rough proxy for non-Latin scripts
    if non_latin_ratio > 0.3:
        return int(base_limit * 2.5)  # non-Latin text needs more tokens for same meaning
    return base_limit

# ─── [Gotcha] Context window ≠ effective recall window ───
# A 200K-token context window means the API ACCEPTS 200K tokens — that's all the
# guarantee gives you. It does NOT mean the model reliably RETRIEVES a fact from
# token position 100,000 in a 200K-token input.
# The "lost in the middle" effect: recall degrades for mid-context positions.
# Production fix: place critical info at the START (primacy) or END (recency) of context.
#   system_prompt → [critical constraints here, position 0-800 tokens]
#   retrieved_docs → [bulk context, lower recall expected]
#   user_message → [the actual task, near the end, high recency recall]
```
::

## 🧠 Spot the Issue

A developer wants a customer-service bot to always end responses with a satisfaction survey link, so they write this system prompt:

::code-wrapper{language="markdown" filename="bad_survey_prompt.md"}
```markdown
You are a customer service assistant. Help the user with their question.
At the very beginning of your response, before anything else, include this
exact text: "Thanks for reaching out! Here's your survey link: [link]".
Then answer their question below that.
```
::

The developer tests it and finds that response **quality** has gotten noticeably worse — the model answers more superficially and sometimes gets facts wrong that it handled fine before. Why, mechanically, would putting the survey link at the *start* cause this?

<details>
<summary>Answer</summary>

Generation is autoregressive and left-to-right. Forcing the model to emit the survey boilerplate **before** it generates any of the actual answer means every token of the substantive answer is conditioned on a prefix (`"Thanks for reaching out! Here's your survey link: [link]"`) that has **zero semantic relevance** to the customer's question.

The model cannot reason about the problem first and then write the boilerplate — it must commit to the boilerplate token sequence first, and only then begin the real answer, with no "planning" tokens preceding it. This is especially damaging for questions that benefit from implicit reasoning before the answer (which is most non-trivial questions). You've forced the model to skip the reasoning-adjacent preamble that would normally precede a careful response.

**The fix**: fixed boilerplate that doesn't depend on the model's reasoning should go at the **end** of the response — or, better, be appended by your application code after the API call returns, so it never enters the generation path at all.

::code-wrapper{language="python" filename="fixed_survey_pattern.py"}
```python
# BAD — boilerplate in the prompt, forced at the START of generation
SYSTEM_PROMPT_BAD = """You are a customer service assistant.
Before anything else, output: 'Thanks for reaching out! Survey: [link]'
Then answer the question."""

# GOOD — boilerplate appended in post-processing, model never generates it
SYSTEM_PROMPT_GOOD = """You are a customer service assistant. Answer the user's question thoroughly."""
SURVEY_FOOTER = "\n\n---\nThanks for reaching out! Here's your survey link: [link]"

def build_response(user_question: str, llm_generate) -> str:
    answer = llm_generate(system=SYSTEM_PROMPT_GOOD, user=user_question)
    return answer + SURVEY_FOOTER  # model's generation is uncontaminated; boilerplate is deterministic
```
::

</details>

## Key Takeaways

::code-wrapper{language="python" filename="key_takeaways.py"}
```python
"""
The mechanical core of prompt engineering, in code.
"""

# 1. An LLM does ONE thing: predict the next token given all prior tokens.
#    Every capability — reasoning, coding, conversation — is this in a loop.
#    def llm(tokens): return sample(softmax(model.forward(tokens)))
#    def generate(prompt): return [llm(prompt + generated_so_far) for _ in range(max_tokens)]

# 2. Prompting is inference-time only. Weights NEVER change.
#    You are not teaching — you are SELECTING a region of the pre-trained distribution.
#    training:   weights -= lr * grad(loss(predictions, targets))    # you weren't here
#    inference:  output = sample(model.forward(your_tokens))          # your only lever

# 3. Tokenization, not characters/words, is the model's unit of perception.
#    "strawberry" = 1-2 tokens, not 9 characters → character-counting fails.
#    "54321" = ["543","21"] → arithmetic is pattern completion, not digit math.
#    Non-English text costs 2-3x more tokens for the same semantic content.

# 4. Context window is a BUDGET, not a guarantee of recall.
#    budget = max_context - response_reserve
#    if input_tokens > budget: RAISE, don't silently truncate.
#    recall(position) is NOT uniform — primacy + recency > middle ("lost in the middle").

# 5. Generation is left-to-right autoregressive — early tokens are load-bearing.
#    token[n] is conditioned on tokens[0..n-1], INCLUDING the model's own output.
#    If the model starts hedging → further hedging becomes more probable.
#    If the model starts precise → further precision is reinforced.
#    → Front-load constraints. Put fixed boilerplate at the END (or in post-processing).
#    → Ensure system + user instructions are ALIGNED, not competing for attention weight.
```
::
