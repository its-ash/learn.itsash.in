---
title: "Prompt Engineering — Engineering Reference"
description: "A code-first, production-grade prompt-engineering reference for mid-to-senior engineers. 20 chapters covering LLM mechanics, prompt structure, core and advanced techniques, RAG, tool use, multi-agent workflows, model-specific conventions, security, and evaluation at scale — through annotated code, anti-patterns, and edge cases."
---

# 🧭 Prompt Engineering — Engineering Reference

A code-first, production-grade prompt-engineering curriculum for mid-to-senior developers moving toward staff/principal roles. Each chapter is structured around **annotated code blocks** — complex implementations, anti-patterns with fixes, performance tricks, and edge-case failure modes — rather than prose-heavy tutorials. Every technique is shown as it's used in real production systems, with dense inline comments explaining the underlying mechanism.

## How to Use This Reference

1. **Read sequentially** (01 → 20) for a structured path from LLM mechanics to production evaluation.
2. **Jump to a chapter** as a reference when you hit a specific prompting problem in the wild — each is self-contained.
3. **Run the exercises** in chapter 20 after every few chapters, not just at the end.
4. **Treat every code example as a starting point** — adapt the patterns to your domain, test against your own eval set (Chapter 19), and verify behavior on YOUR target model (Chapter 16).

## Prerequisites

- Familiarity with at least one LLM API (Anthropic, OpenAI, or equivalent) — you've made API calls and understand the request/response shape.
- Working knowledge of Python — code examples use Python with `anthropic` SDK patterns, but the concepts transfer to any language.
- Understanding of basic software engineering practices (versioning, testing, CI) — this reference treats prompts as production code, not creative writing.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & How LLMs Work](/prompt-engineering/01-introduction-and-how-llms-work) | Next-token prediction, tokenization, context budgets — the mechanistic model every technique builds on. |
| 02 | [Anatomy of a Prompt](/prompt-engineering/02-anatomy-of-a-prompt) | Role hierarchy, instruction/context/data separation, delimiter strategy — shown as real API request bodies. |
| 03 | [Zero-Shot & Few-Shot Prompting](/prompt-engineering/03-zero-shot-and-few-shot-prompting) | Example selection, ordering effects, diminishing returns, and the accidental-pattern trap. |
| 04 | [Clarity & Specificity](/prompt-engineering/04-clarity-and-specificity) | Eliminating ambiguity through checkable constraints, positive framing, and anti-rebound instruction design. |

### Part II — Core Techniques

| # | Topic | Why It Matters |
|---|---|---|
| 05 | [Chain-of-Thought Prompting](/prompt-engineering/05-chain-of-thought-prompting) | CoT as self-generated context, extended thinking, and the fluent-but-wrong failure mode. |
| 06 | [Role & Persona Prompting](/prompt-engineering/06-role-and-persona-prompting) | Conditioning signals, sycophancy mitigation, anti-caving instructions, and persona drift. |
| 07 | [Output Formatting & Structured Data](/prompt-engineering/07-output-formatting-and-structured-data) | Prompted vs. API-enforced schemas, function calling as structured output, and parsing failure modes. |
| 08 | [Context & Memory Management](/prompt-engineering/08-context-and-memory-management) | Sliding window, summarization, structured memory, prompt caching, and the layered production architecture. |
| 09 | [Iterative Refinement & Prompt Testing](/prompt-engineering/09-iterative-refinement-and-prompt-testing) | Eval sets, A/B testing, LLM-as-judge, and the iteration loop that separates engineering from tweaking. |

### Part III — Advanced Techniques

| # | Topic | Why It Matters |
|---|---|---|
| 10 | [Decomposition & Task Breakdown](/prompt-engineering/10-decomposition-and-task-breakdown) | Pipelines of focused prompts, structured handoffs, parallel vs. sequential, and error compounding. |
| 11 | [Self-Consistency & Verification](/prompt-engineering/11-self-consistency-and-verification) | Sampling multiple paths, majority voting, external ground-truth checks, and multi-model cross-checking. |
| 12 | [Retrieval-Augmented Generation (RAG)](/prompt-engineering/12-retrieval-augmented-generation-rag) | Grounding instructions, citation verification, contradiction handling, and chunk placement strategy. |
| 13 | [Tool Use & Function Calling](/prompt-engineering/13-tool-use-and-function-calling) | Tool definitions, the calling loop, result formatting, error handling, and the tool-vs-prompt decision. |
| 14 | [Multi-Agent & Agentic Workflows](/prompt-engineering/14-multi-agent-and-agentic-workflows) | Orchestrator/sub-agent patterns, structured handoffs, synthesis design, and human-in-the-loop enforcement. |

### Part IV — Model-Specific & Practical Craft

| # | Topic | Why It Matters |
|---|---|---|
| 15 | [Working with Claude](/prompt-engineering/15-working-with-claude) | XML tags, system prompt structure, extended thinking, literal instruction-following, and pushback encouragement. |
| 16 | [Working with GPT & Other Models](/prompt-engineering/16-working-with-gpt-and-other-models) | Portability, OpenAI conventions, reasoning-optimized models, open-weight chat templates, and graceful degradation. |
| 17 | [Handling Hallucination & Uncertainty](/prompt-engineering/17-handling-hallucination-and-uncertainty) | Calibrated uncertainty, grounding with citations, explicit I-don't-know permission, and domain-specific risk patterns. |

### Part V — Production & Safety

| # | Topic | Why It Matters |
|---|---|---|
| 18 | [Prompt Injection & Security](/prompt-engineering/18-prompt-injection-and-security) | Direct and indirect injection, defense-in-depth, architectural safeguards, and the SQL-injection analogy. |
| 19 | [Evaluating & Testing Prompts at Scale](/prompt-engineering/19-evaluating-and-testing-prompts-at-scale) | Eval harnesses, LLM-as-judge calibration, CI-gated regression testing, cost/latency metrics, and statistical significance. |
| 20 | [Exercises & Project Ideas](/prompt-engineering/20-exercises-and-projects) | From beginner drills to a self-hosted red-team bounty — where the curriculum turns into judgment. |

## Learning Path Suggestions

### If you're a developer building LLM features into a product

Read 01–09 in order — don't skip the foundations even if you're experienced with APIs, since most production prompt bugs trace back to a Part I or II concept applied sloppily. Read 12, 13, and 19 closely. Read 15 or 16 depending on which model you're shipping with. Treat chapter 19's eval-harness pattern as **non-optional** before shipping to real users.

### If you're building agents or tool-using systems

Skim 01–09. Read 10, 11, 13, and 14 carefully — this is the core of agentic design. Read 17 before you trust any agent's intermediate claims. Read 18 **before** you give an agent access to anything that matters. Finish with exercises 9, 12, and 13 in chapter 20.

### If your focus is safety, security, or red-teaming

Read 01–04 for the mental model, then jump straight to 17 and 18. Read 19 to understand how injection resistance gets regression-tested rather than checked once. Do exercises 10 and 13 in chapter 20, and treat project 14 (the self-hosted prompt injection bug bounty) as the capstone.

## Companion Resources

- [Anthropic's Prompt Engineering Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) — official Claude-specific guidance.
- [Anthropic Docs — Claude Developer Platform](https://docs.anthropic.com/) — full API and model documentation.
- [OpenAI's Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering) — official GPT-specific guidance.
- [OpenAI Cookbook](https://cookbook.openai.com/) — worked examples across common tasks.
- [Learn Prompting](https://learnprompting.org/) — community-maintained, model-agnostic reference.
