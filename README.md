# Invoice Explainer

An invoice analysis agent that uses Claude tool use to look up missing customer data from a CRM before producing a plain-language explanation.

## How it works

```
Raw invoice text
      ↓
[Agent loop]  Claude analyses the invoice
      ↓ (if customer name or billing address missing)
[Tool call]   lookup_customer / lookup_billing_address → mock CRM
      ↓ (if CRM returns { found: false })
[Human input] Operator prompted to supply missing field manually
      ↓ (loop until end_turn or dead end)
[end_turn]    Claude produces plain-language explanation
      ↓
Output: explanation, or halt + flag if data can't be resolved
```

Claude decides whether to call tools — the agent loop keeps going while `stop_reason === "tool_use"` and exits when `stop_reason === "end_turn"`. When the CRM has no record, the agent pauses and asks the operator to supply the missing field manually. If the operator provides it, the value is tagged `source: "human_input"` and Claude notes the distinction in its explanation. If the operator skips, Claude flags the missing data instead of guessing.

## Project structure

```
invoice-explainer/
├── src/
│   ├── index.js      # Entry point — three test scenarios, SCENARIO switch
│   ├── agent.js      # Agent loop: tool dispatch, message history, exit conditions
│   ├── mock-crm.js   # Simulated CRM with lookup_customer / lookup_billing_address tools
│   └── logger.js     # Writes full API request/response payloads to logs/ per run
├── logs/             # Debug logs, one file per run (git-ignored)
├── package.json
├── .env               # ANTHROPIC_API_KEY goes here (not committed)
├── .gitignore
└── README.md
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set your API key

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Get your key from [console.anthropic.com](https://console.anthropic.com/settings/keys). Never commit it to git.

### 3. Run

```bash
npm start        # run once
npm run dev      # auto-restart on file save
```

## Test scenarios

Switch between scenarios in `src/index.js` by changing `SCENARIO`:

| Scenario | Invoice | What happens |
|---|---|---|
| `"A"` | INV-1042 — all fields present | No tool calls; Claude explains directly |
| `"B"` | INV-1043 — customer name and billing address missing | Two tool calls; CRM returns name but not address; operator prompted for address |
| `"C"` | INV-1044 — customer name missing, no CRM record | Operator prompted for name; if skipped, agent flags the unresolvable field |

## Tools

| Tool | When Claude calls it | Returns |
|---|---|---|
| `lookup_customer` | Customer name absent from invoice | `{ found, customer_name? }` |
| `lookup_billing_address` | Billing address absent from invoice | `{ found, billing_address? }` |

Both tools dispatch through `executeTool()` in `mock-crm.js`. In production, replace the mock CRM object with real database queries.

The agent validates invoice number format (`INV-` followed by digits) before calling any tool. An invalid format returns an error result to Claude instead of hitting the CRM.

## Debug logs

Each run writes a timestamped log file to `logs/debug-TIMESTAMP.log` containing the full API payload for every loop iteration — request (model, system prompt, tools, full message history) and response (stop reason, token usage including cache hits, content blocks). Nothing in the logs is printed to the console; the log path is shown at startup.

```
📝 Logging to: logs/debug-2026-06-15T20-44-11-357Z.log
```

## References

- [Claude API docs](https://docs.claude.com)
- [Tool use guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Messages API reference](https://docs.claude.com/en/api/messages)
