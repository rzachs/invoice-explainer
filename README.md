# Invoice Explainer

An invoice analysis agent that uses Claude tool use to look up missing customer data from a CRM before producing a plain-language explanation.

## How it works

```
Raw invoice text
      ↓
[Agent loop]  Claude analyses the invoice
      ↓ (if customer name or billing address missing)
[Tool call]   lookup_customer / lookup_billing_address → mock CRM
      ↓ (loop until end_turn or dead end)
[end_turn]    Claude produces plain-language explanation
      ↓
Output: explanation, or halt + flag if data can't be resolved
```

Claude decides whether to call tools — the agent loop keeps going while `stop_reason === "tool_use"` and exits when `stop_reason === "end_turn"`. If the CRM has no record, Claude flags the issue instead of guessing.

## Project structure

```
invoice-explainer/
├── src/
│   ├── index.js       # Entry point — three test scenarios, SCENARIO switch
│   ├── agent.js       # Agent loop: tool dispatch, message history, exit conditions
│   └── mock-crm.js    # Simulated CRM with lookup_customer / lookup_billing_address tools
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
| `"B"` | INV-1043 — customer name and billing address missing | Two tool calls; CRM returns name but no address |
| `"C"` | INV-1044 — customer name missing, no CRM record | Agent halts and flags the unresolvable field |

## Tools

| Tool | When Claude calls it | Returns |
|---|---|---|
| `lookup_customer` | Customer name absent from invoice | `{ found, customer_name? }` |
| `lookup_billing_address` | Billing address absent from invoice | `{ found, billing_address? }` |

Both tools dispatch through `executeTool()` in `mock-crm.js`. In production, replace the mock CRM object with real database queries.

## References

- [Claude API docs](https://docs.claude.com)
- [Tool use guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Messages API reference](https://docs.claude.com/en/api/messages)
