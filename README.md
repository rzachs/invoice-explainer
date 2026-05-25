# Invoice Explainer

A two-call Claude pipeline that extracts structured data from invoice text and explains it in plain language.

## Pipeline

```
Raw invoice text
      ↓
[Claude call 1]  Extract → JSON        retry loop up to 3x
      ↓
[Deterministic]  Validate              required fields, types, math, dates
      ↓
[Claude call 2]  Explain in plain      audience-aware
      ↓
Output
```

## Project structure

```
invoice-explainer/
├── src/
│   ├── index.js      # Entry point — wires the full pipeline
│   ├── extract.js    # Claude call 1: extraction + retry loop
│   ├── explain.js    # Claude call 2: plain language explanation
│   └── validate.js   # Deterministic validation layer
├── package.json
├── .gitignore
└── README.md
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set your API key

Get your key from [console.anthropic.com](https://console.anthropic.com/settings/keys).

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Never hardcode the key. Never commit it to git (see `.gitignore`).

### 3. Run

```bash
npm start
```

## Concepts covered

| Layer | File | What it does |
|---|---|---|
| LLM extraction | `extract.js` | Handles variable invoice formats Claude hasn't seen |
| Retry loop | `extract.js` | Feeds validation errors back to Claude for self-correction |
| Deterministic validation | `validate.js` | Required fields, type checks, math verification, date logic |
| LLM explanation | `explain.js` | Audience-aware plain language output |

## Changing the audience

In `src/index.js`, set `AUDIENCE` to one of:
- `"business"` — non-technical owner, highlights action items
- `"accountant"` — precise, flags bookkeeping anomalies  
- `"developer"` — terse, highlights data pipeline issues

## Next steps

- Add PDF text extraction (`npm install pdf-parse`)
- Add image invoice support (pass base64 to Claude's vision API)
- Add batch processing for multiple invoices
- Add a web UI (see the React artifact version)

## References

- [Claude API docs](https://docs.claude.com)
- [Anthropic cookbook](https://github.com/anthropics/anthropic-cookbook)
- [Messages API reference](https://docs.claude.com/en/api/messages)
