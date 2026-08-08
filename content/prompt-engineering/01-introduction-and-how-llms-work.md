# 01 — Introduction & How LLMs Work

## What Prompt Engineering Actually Is

Prompt engineering is the practice of designing the input to a large language model (LLM) so that the output reliably does what you need. It sits at an odd intersection: part writing, part systems design, part empirical science. You are not "talking to" the model in the way you talk to a person — you are constructing a specific sequence of tokens that steers a statistical process toward a useful continuation.

That framing matters more than it sounds. Every technique in this course — few-shot examples, chain-of-thought, system prompts, XML structuring — is really a way of shaping the probability distribution the model samples from. Once you internalize that, a lot of "why does this work" questions answer themselves.

This chapter covers the mechanics: what an LLM does when it generates text, what tokens and context windows are, and why the same request phrased two different ways can produce wildly different results.

## Next-Token Prediction: The One Thing an LLM Does

Stripped to its core, a large language model does exactly one thing: given a sequence of tokens, it predicts a probability distribution over what token comes next. That's it. Everything — answering questions, writing code, holding a conversation, refusing harmful requests — is this single mechanism applied repeatedly, one token at a time.

Concretely, generation works like this:

1. The model receives your prompt as a sequence of tokens.
2. It computes a probability distribution over its entire vocabulary (tens of thousands of possible next tokens) for "what token is most likely to come next."
3. It samples one token from that distribution (the exact sampling strategy varies — more on this below).
4. That token gets appended to the sequence, and the process repeats, now including the token just generated, until a stop condition is reached (an end-of-turn marker, a stop sequence, or a length limit).

This is why LLMs are sometimes described as "extremely sophisticated autocomplete." That description is technically accurate but misleading in its implications — the model learned this next-token-prediction skill from a training corpus so large and varied that the resulting behavior includes reasoning, coding, translation, and instruction-following as emergent capabilities. Autocomplete on your phone predicts the next word from a small local pattern; a frontier LLM predicts the next token from a compressed representation of most of humanity's written text, run through a network with hundreds of billions of parameters. The mechanism is the same shape; the capability is not comparable.

### Why this matters for prompting

Because generation is sequential and autoregressive (each token depends on all tokens before it, including ones the model itself just generated), **everything you put earlier in the prompt conditions everything that comes after** — including the model's own output as it writes it. This has concrete consequences:

- If your prompt is ambiguous early on, the model commits to an interpretation early, and that interpretation shapes every subsequent token. You can't "clarify later in the same generation" — once tokens are committed, the model conditions on them as fact.
- If the model starts an answer poorly (say, it begins listing reasons why a request is problematic), it becomes statistically more likely to continue in that vein, because it's now conditioning on its own hedging text. This is one reason "the model talked itself into a refusal it wouldn't have started with" is a real, observed phenomenon.
- Order matters. Two prompts with identical content but different token order can produce different outputs, because the model never gets to "see the whole prompt at once and then decide" — it processes it, then generates conditioned on the whole thing, but its own generation is still a left-to-right walk that compounds early framing.

## Training vs. Inference

It helps to keep two very different phases distinct:

| Phase | What happens | What you control |
|---|---|---|
| **Training** | The model's weights are adjusted (via gradient descent over enormous datasets) so that it gets better at predicting the next token, and later fine-tuned/aligned with techniques like RLHF (reinforcement learning from human feedback) to follow instructions and avoid harmful outputs. | Nothing — this already happened, by the model provider, before you ever sent a request. |
| **Inference** | The trained, frozen model reads your prompt and generates tokens. No weights change. The model "learns" nothing new; any adaptation is purely from the text you put in its context window this one time. | Everything — the prompt, the system instructions, the examples, the sampling parameters. |

Prompt engineering is entirely an **inference-time** activity. This is why it's sometimes called "in-context learning" — you're not training the model, you're giving it enough context, on the fly, that it can perform the task correctly using patterns it already learned during training. A well-crafted few-shot prompt can make a general-purpose model perform a narrow task almost as if it were fine-tuned for it, without ever touching a weight.

This distinction also explains a common point of confusion: **the model has no persistent memory of your previous conversations** unless you (or the product you're using) explicitly re-supply that history as part of the prompt on each new request. Every API call is stateless from the model's point of view — "memory" in a chat product is an illusion created by resending the transcript.

## Tokenization

Models don't see characters or words — they see **tokens**, which are chunks of text produced by a tokenizer. A token might be a whole word ("the"), part of a word ("token" + "ization"), a single character, a punctuation mark, or even whitespace. Different providers use different tokenizers (Claude, GPT, and Gemini each tokenize text somewhat differently), which is one reason token counts for the "same" text differ across models and why you should never assume a token-count estimate from one model's tokenizer transfers to another.

Rough rules of thumb (these vary by language and content type, so treat them as approximations, not guarantees):

- English prose: roughly 4 characters per token, or about 0.75 tokens per word.
- Code: often *more* tokens per character than prose, because of punctuation, indentation, and symbols that don't compress as neatly into common subword chunks.
- Non-English languages, especially those with non-Latin scripts, frequently tokenize less efficiently — the same sentence in Japanese or Arabic can consume noticeably more tokens than the "equivalent" English sentence, because the tokenizer's vocabulary was trained with an English-dominant corpus.

### Why tokenization is not just trivia

Tokenization has real prompting implications:

- **Character-level tasks are surprisingly hard.** Asking a model to "count the number of letters in this word" or "reverse this string" can fail because the model operates on tokens, not characters — it may never have "seen" the word broken into individual letters the way you're imagining. This is the underlying mechanism behind the infamous "how many Rs are in strawberry" failures: if "strawberry" is one or two tokens, the model has to infer letter composition indirectly rather than read it off directly.
- **Numbers tokenize unevenly.** Depending on the tokenizer, "1234" might be one token, or it might split as "12" + "34", or digit-by-digit. This affects arithmetic reliability — a model doing multi-digit multiplication is, in a real sense, doing token-pattern arithmetic, not digit-by-digit arithmetic the way you learned in school. It's part of why models are more reliable at arithmetic when allowed to show intermediate steps (see Chapter 5, Chain-of-Thought).
- **Cost and limits are token-based, not word-based or character-based.** API pricing (input and output) and context-window limits are both denominated in tokens. A prompt that "looks short" in a non-English language or in dense code can burn far more tokens than an English prose prompt of similar visual length.

## Context Windows

The **context window** is the maximum number of tokens a model can process in a single request — this includes your system prompt, the conversation history, any documents or tool outputs you've included, and the space reserved for the model's own response. Exceeding it means older content must be dropped, truncated, or summarized before the model ever sees it.

As of this writing, context windows vary widely by model and provider and change frequently — treat any specific number as a snapshot, not a permanent fact:

| Model family | Approximate context window (check current docs) |
|---|---|
| Claude (Opus/Sonnet/Haiku, current generation) | Commonly around 200K tokens on standard tiers, with some models and tiers offering substantially more (up to roughly 1M tokens) |
| GPT (current generation) | Varies by model, commonly in the 128K–1M token range |
| Gemini (current generation) | Historically among the largest available, often quoted in the 1M+ token range |

Don't memorize these numbers as facts about the world — memorize the fact that **you should check current documentation before designing around a specific limit**, because these ceilings move upward roughly every few months across the industry.

### Why context windows matter for prompting

- **A large context window is not a free lunch.** Even within the window, models exhibit **position effects** — information placed at the very beginning or very end of a long context is generally recalled more reliably than information buried in the middle (often called the "lost in the middle" effect). We cover this in depth in Chapter 8, but it's a direct consequence of how attention mechanisms weight different positions, and it means "I have a 1M token window, so I'll just dump everything in" is not a strategy — placement inside that window still matters.
- **Every token in context costs money and latency**, whether it's your carefully written instructions or forty pages of a PDF the user pasted in. Context is a budget, not a bottomless bucket.
- **The model attends to everything in context simultaneously**, in the sense that any earlier token can influence any later generated token via the attention mechanism — but *how much* influence varies by position, relevance, and how the model was trained to weight recency versus earlier context. This is why conflicting instructions at different points in a long prompt produce inconsistent behavior: the model isn't "confused," it's genuinely weighing two real, contradictory signals in its context.

## Why Prompting Works At All

Given that the model is "just" predicting the next token, why does something like "You are an expert tax attorney. Explain the tax implications of..." produce noticeably better, more accurate, more appropriately-hedged output than "explain tax implications"?

The mechanism: during training, the model saw enormous amounts of text where certain framings, register, and structure correlated with certain kinds of continuations. Text that opens like an expert legal explainer is statistically more likely to be followed by careful, hedged, jargon-appropriate content than text that opens like a casual forum post — because that's the pattern in the training data. When you write "You are an expert tax attorney," you are not making the model *become* a tax attorney (it has no persistent identity) — you are **conditioning the probability distribution** toward the region of "expert tax attorney explanation" text that it learned from training. Chapter 6 covers persona prompting in depth, including where this technique helps and where it backfires.

This is the single most useful mental model for the entire discipline: **a prompt is a specification of which region of the model's learned distribution you want to sample from.** Every technique in this course — instructions, examples, formatting, personas, reasoning scaffolds — is a lever for narrowing that region toward the outputs you actually want.

## A Minimal Real-World Example

Here's a production-style system prompt for a customer-support triage assistant, showing several of the concepts above already in play (we'll unpack each piece in later chapters):

::code-wrapper{language="markdown"}
```markdown
You are a support-ticket triage assistant for a B2B SaaS company.

Your job: read the incoming support message and classify it into exactly
one of these categories: BILLING, BUG_REPORT, FEATURE_REQUEST, ACCOUNT_ACCESS,
or OTHER. Then extract the customer's stated urgency (LOW, MEDIUM, HIGH) based
on their own language, not your judgment of how urgent it "really" is.

Respond with only a JSON object in this exact shape:
{"category": "...", "urgency": "...", "summary": "one sentence, no more than 20 words"}

If the message doesn't clearly fit one category, choose the closest one and
lower your confidence is not something you report — always pick exactly one.
```
::

Notice: this prompt sets a role (conditioning the distribution toward "careful classifier" behavior), gives an explicit enumerated output space (constraining the token distribution at generation time to a small set of valid category tokens), and specifies exact output format (reducing the search space for what a "correct" continuation looks like). Every clause here exists to narrow what the next tokens could plausibly be — that's prompt engineering, mechanically.

## 💡 Tips & Tricks

- **Mental model, not anthropomorphism** — When debugging a bad output, resist the urge to think "why doesn't it understand me?" and instead ask "what text, statistically, would plausibly follow what I just wrote?" The second question usually reveals the fix immediately (e.g., you asked an open-ended question and got a rambling answer because open-ended questions are, in the training data, usually followed by rambling answers).
- **Token budgets are asymmetric** — Input tokens are typically much cheaper than output tokens across most providers. When designing a system that runs at scale, it's often cheaper to send more context (input) if it lets you request a shorter, more targeted answer (output), rather than a sparse prompt that produces a long, exploratory response.
- **Use the provider's tokenizer, not a guess** — If you need to know exactly how many tokens a piece of text will consume, use the actual tokenizer/token-counting endpoint for the model you're targeting rather than a word-count heuristic or another model's tokenizer — the differences compound in long documents.
- **Early tokens are load-bearing** — Because generation is autoregressive, the first sentence of your desired output (if you can influence it, e.g., through formatting instructions or a strong opening constraint) disproportionately shapes everything that follows. This is the mechanism behind "if the model starts well, it tends to finish well."
- **"Temperature 0" is not determinism** — Many people assume setting temperature to zero (see Chapter 5 and provider docs) guarantees identical output every time. In practice, floating-point non-determinism in the underlying computation (especially across different hardware/batch configurations) means even greedy decoding can produce slightly different outputs run to run. Don't build systems that assume bit-for-bit reproducibility from any LLM.

## ⚠️ Edge Cases & Gotchas

- **Empty or whitespace-only prompts** — Sending an empty string or a prompt of only whitespace typically produces either an error, a generic "How can I help you?" style response, or highly unpredictable output, because the model has essentially no conditioning signal at all. Always validate that user-supplied input isn't empty before sending it to the model, and decide explicitly what should happen in that case rather than letting the model guess.
- **Token limits truncate mid-instruction, not just mid-answer** — If your *input* prompt itself is so long it approaches the context window limit (rare, but happens with huge pasted documents), some client libraries or naive implementations will silently truncate the prompt itself — potentially cutting off your instructions before the actual task description, which is disastrous and often invisible until output quality mysteriously craters. Always check documented limits and fail loudly (raise an error) rather than silently truncating.
- **The "reasoning looks right, arithmetic is wrong" trap** — Because of tokenization, a model can write a completely correct chain of reasoning about a math problem and still botch the final multiplication of two five-digit numbers, because multi-digit arithmetic isn't really character-by-character computation for the model — it's pattern completion over number-tokens it has seen with varying frequency in training. Don't trust unaided LLM arithmetic for anything that matters; use a tool/calculator call instead (Chapter 13).
- **Non-English text costs more tokens for the "same" content** — If you're budgeting a fixed token limit for user-generated content in a multilingual product, remember that the same message in Korean, Japanese, Arabic, or Hindi may consume 2–3x the tokens of the English equivalent, purely from tokenizer inefficiency on non-Latin scripts. A per-message token cap that works fine for English users can truncate non-English users' messages far more aggressively.
- **Context window ≠ effective recall window** — A model with a 200K-token context window will accept 200K tokens without erroring, but that doesn't mean it will retrieve a fact from the middle of that context as reliably as one from the beginning or end. Don't confuse "the API accepted my input" with "the model reliably used all of it" — these are different claims, and only the first one is guaranteed by the context-window number.

## 🧠 Spot the Issue

A developer wants a customer-service bot to always end responses with a satisfaction survey link, so they write this system prompt:

::code-wrapper{language="markdown"}
```markdown
You are a customer service assistant. Help the user with their question.
At the very beginning of your response, before anything else, include this
exact text: "Thanks for reaching out! Here's your survey link: [link]".
Then answer their question below that.
```
::

The developer tests it and finds that response *quality* has gotten noticeably worse — the model seems to answer more superficially and sometimes gets facts wrong that it handled fine before this instruction was added. Why, mechanically, would putting the survey link at the *start* of the response cause this?

<details>
<summary>Answer</summary>

Because generation is autoregressive and left-to-right, forcing the model to emit the survey link **before** it has "thought about" or generated any of the actual answer means every token of the real answer is now conditioned on a prefix that has nothing to do with the customer's question. The model can't reason about the problem first and then write the boilerplate — it has to commit to the boilerplate token sequence first, and only then start generating the substantive answer, with no opportunity to have "planned ahead." This is especially damaging for questions that benefit from any implicit reasoning before the answer (which is most non-trivial questions) — you've effectively forced the model to skip straight to answering without the benefit of the reasoning-adjacent tokens that would normally precede a careful response.

**The lesson**: fixed boilerplate that doesn't depend on the model's reasoning about the specific request should go at the *end* of the response (or be appended by your application code after the fact), not the beginning — putting it first taxes every subsequent token with a context that isn't relevant to solving the user's actual problem.

</details>

## Key Takeaways

- An LLM's only fundamental operation is predicting the next token given everything before it; every higher-level capability (reasoning, coding, conversation) is this mechanism applied repeatedly and emerges from training on massive, varied text.
- Prompting is entirely an inference-time activity — it never changes the model's weights. It works by conditioning the model's probability distribution toward the region of learned behavior you want, not by "teaching" it anything new.
- Tokenization (not characters or words) is the model's real unit of perception, which explains character-counting failures, uneven arithmetic reliability, and why non-English text often costs more tokens.
- Context windows bound how much text a model can process per request, but a large window does not guarantee uniform recall across all of it — position within the context still matters (see Chapter 8).
- Because generation is left-to-right and autoregressive, early tokens in a prompt — and early tokens in the model's own output — disproportionately shape everything that follows, which is the mechanistic root of many prompting best practices covered in later chapters.
