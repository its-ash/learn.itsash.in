---
title: Prompt Engineering — From Zero to Pro
description: A comprehensive prompt-engineering curriculum. 20 chapters covering how LLMs work, prompt structure, core and advanced techniques, RAG, tool use, multi-agent workflows, model-specific craft, security, and production evaluation. Go from beginner to pro prompt engineer.
---

# 🧭 Prompt Engineering — From Zero to Pro

A comprehensive, edge-case-covering prompt-engineering curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to pro prompt engineer — no prior coding background required for most of the track.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 20).
2. **Jump to a chapter** as a reference when you hit a specific prompting problem in the wild.
3. **Run the exercises** in chapter 20 after every few chapters, not just at the end.
4. **Keep a scratch conversation open** in whatever chat interface you use, and try every example prompt yourself rather than just reading it — prompting is learned by running prompts, not by reading about them.

## Prerequisites

- Basic familiarity with using an LLM chat interface (ChatGPT, Claude, or similar) — if you've had a back-and-forth conversation with one, you're ready.
- No coding required for most chapters. A handful of intermediate/advanced chapters (tool use, RAG, evaluation harnesses) show code examples, but understanding the prompting concept never depends on being able to write that code yourself.
- Curiosity about *why* a model responds the way it does, not just *that* it does — this curriculum favors mechanism over recipe.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & How LLMs Work](/prompt-engineering/01-introduction-and-how-llms-work) | Tokens, next-token prediction, training — the mental model everything else builds on. |
| 02 | [Anatomy of a Prompt](/prompt-engineering/02-anatomy-of-a-prompt) | System, user, and assistant roles; instructions vs. context vs. examples. |
| 03 | [Zero-Shot & Few-Shot Prompting](/prompt-engineering/03-zero-shot-and-few-shot-prompting) | When examples help, when they bias, and how many is enough. |
| 04 | [Clarity & Specificity](/prompt-engineering/04-clarity-and-specificity) | The single highest-leverage skill — precise instructions beat clever ones. |

### Part II — Core Techniques

| # | Topic | Why It Matters |
|---|---|---|
| 05 | [Chain-of-Thought Prompting](/prompt-engineering/05-chain-of-thought-prompting) | Getting a model to reason step by step, and why that reasoning can still be wrong. |
| 06 | [Role & Persona Prompting](/prompt-engineering/06-role-and-persona-prompting) | Shaping tone and scope with system-level identity — and its limits. |
| 07 | [Output Formatting & Structured Data](/prompt-engineering/07-output-formatting-and-structured-data) | Reliable JSON, tables, and schemas for downstream automation. |
| 08 | [Context & Memory Management](/prompt-engineering/08-context-and-memory-management) | Budgeting a finite context window across long conversations. |
| 09 | [Iterative Refinement & Prompt Testing](/prompt-engineering/09-iterative-refinement-and-prompt-testing) | Treating a prompt as a draft to test and revise, not a one-shot guess. |

### Part III — Advanced Techniques

| # | Topic | Why It Matters |
|---|---|---|
| 10 | [Decomposition & Task Breakdown](/prompt-engineering/10-decomposition-and-task-breakdown) | Splitting ambitious tasks into reliable, testable sub-steps. |
| 11 | [Self-Consistency & Verification](/prompt-engineering/11-self-consistency-and-verification) | Sampling multiple attempts and voting to beat single-run variance. |
| 12 | [Retrieval-Augmented Generation (RAG)](/prompt-engineering/12-retrieval-augmented-generation-rag) | Grounding answers in real documents instead of parametric memory. |
| 13 | [Tool Use & Function Calling](/prompt-engineering/13-tool-use-and-function-calling) | Letting a model act on the world through defined, safe interfaces. |
| 14 | [Multi-Agent & Agentic Workflows](/prompt-engineering/14-multi-agent-and-agentic-workflows) | Planner/worker/critic patterns for tasks too complex for one prompt. |

### Part IV — Model-Specific & Practical Craft

| # | Topic | Why It Matters |
|---|---|---|
| 15 | [Working with Claude](/prompt-engineering/15-working-with-claude) | Anthropic-specific conventions: XML tags, extended thinking, constitutional behavior. |
| 16 | [Working with GPT & Other Models](/prompt-engineering/16-working-with-gpt-and-other-models) | Portability, and where prompts silently stop transferring across model families. |
| 17 | [Handling Hallucination & Uncertainty](/prompt-engineering/17-handling-hallucination-and-uncertainty) | Getting a model to know what it doesn't know, and say so. |

### Part V — Production & Safety

| # | Topic | Why It Matters |
|---|---|---|
| 18 | [Prompt Injection & Security](/prompt-engineering/18-prompt-injection-and-security) | Defending against malicious instructions hidden in untrusted content. |
| 19 | [Evaluating & Testing Prompts at Scale](/prompt-engineering/19-evaluating-and-testing-prompts-at-scale) | Eval sets, LLM-as-judge, and CI-gated regression testing for prompts. |
| 20 | [Exercises & Project Ideas](/prompt-engineering/20-exercises-and-projects) | From beginner drills to a self-hosted red-team bounty — where it all comes together. |

## Learning Path Suggestions

### If you just want better results from a chatbot

Read 01–04 closely — they cover 80% of what separates a frustrating chat session from a productive one. Skim 05–07 for reasoning and formatting tricks. Skip the tool-use, RAG, and multi-agent chapters (10, 12, 13, 14) unless you get curious. Do exercises 1–5 in chapter 20.

### If you're a developer building LLM features into a product

Read 01–09 in order — don't skip the foundations even if you're experienced with APIs, since most production prompt bugs trace back to a Part I or II concept applied sloppily. Read 12, 13, and 19 closely. Read 15 or 16 depending on which model you're shipping with. Treat chapter 19's eval-harness pattern as non-optional before shipping to real users.

### If you're building agents or tool-using systems

Skim 01–09. Read 10, 11, 13, and 14 carefully — this is the core of agentic design. Read 17 before you trust any agent's intermediate claims. Read 18 before you give an agent access to anything that matters, and treat it as required reading, not optional. Finish with exercises 9, 12, and 13 in chapter 20.

### If your focus is safety, security, or red-teaming

Read 01–04 for the mental model, then jump straight to 17 and 18. Read 19 to understand how injection resistance gets regression-tested rather than checked once. Do exercises 10 and 13 in chapter 20, and treat project 14 (the self-hosted prompt injection bug bounty) as the capstone.

## Companion Resources

- [Anthropic's Prompt Engineering Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) — official Claude-specific guidance and technique reference.
- [Anthropic Docs — Claude Developer Platform](https://docs.anthropic.com/) — full API and model documentation.
- [OpenAI's Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering) — official GPT-specific guidance.
- [OpenAI Cookbook](https://cookbook.openai.com/) — worked examples across common tasks.
- [Learn Prompting](https://learnprompting.org/) — community-maintained, model-agnostic reference.

## Where to Practice

- **[claude.ai](https://claude.ai)** — Claude's chat interface; good for persona, formatting, and reasoning exercises without writing any code.
- **[chat.openai.com](https://chat.openai.com)** — ChatGPT's chat interface; useful for the model-portability exercises in Part IV.
- **[Anthropic Console](https://console.anthropic.com/)** and **[OpenAI Playground](https://platform.openai.com/playground)** — API playgrounds with adjustable system prompts, temperature, and token settings; the right place for the intermediate and advanced exercises in chapter 20 that need repeatable, parameterized runs.
- **A plain text editor and a notebook** — the most underrated tools in this curriculum. Write prompts as files, version them, and keep a running log of what you tried and what changed — chapter 19's entire discipline starts from this habit.

## License

These notes are yours to use, share, and modify.

🧭
