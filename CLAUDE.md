# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm start            # run the pipeline once
npm run dev          # run with --watch (auto-restart on file save)
```

Requires `ANTHROPIC_API_KEY` in the environment. No test suite exists.

## Architecture

A two-stage Claude pipeline in four files under `src/`:

```
Raw invoice text
    ↓
extract.js   — Claude call #1: extract → JSON (retry loop, max 3 attempts)
    ↓
validate.js  — Deterministic validation (required fields, types, math, dates)
    ↓
explain.js   — Claude call #2: plain-language explanation (audience-aware)
    ↓
index.js     — Wires the pipeline; holds SAMPLE_INVOICE and AUDIENCE config
```

**Retry loop** (`extract.js`): If `validateInvoice()` returns errors, the error list is injected back into the next Claude prompt as `previousError` so the model can self-correct. Up to 3 attempts; hard failure on exhaustion.

**Validation before explanation** (`explain.js`): The second Claude call receives the *validated JSON*, not the raw invoice text. This is intentional — Claude explains known-good data rather than re-interpreting the source document.

**Audience targeting** (`index.js`): Set `AUDIENCE` to `"business"`, `"accountant"`, or `"developer"`. Each maps to a distinct system prompt in `explain.js:AUDIENCE_PROMPTS`.

## Model

Both Claude calls use `claude-sonnet-4-20250514`. The current latest Sonnet model ID is `claude-sonnet-4-6` (`claude-sonnet-4-6`) — update both calls in `extract.js:36` and `explain.js:38` if upgrading.
