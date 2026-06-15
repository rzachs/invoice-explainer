/**
 * index.js
 *
 * Entry point. Runs three invoice scenarios to exercise the full agent:
 *
 *   Scenario A (INV-1042): All fields present in invoice → 0 tool calls
 *   Scenario B (INV-1043): Missing customer name → 1 tool call (name found, address missing → 2nd call)
 *   Scenario C (INV-1044): Missing customer name, no CRM record → halt + flag
 *
 * Change SCENARIO below to test each one.
 */

require('dotenv').config();

const { runAgent } = require("./agent");

// ─── Test invoices ────────────────────────────────────────────────────────────

const INVOICES = {
  A: `
Invoice #INV-1042
Customer: Wayne Enterprises
Billing Address: 1007 Mountain Drive, Gotham
Date: 2026-06-01
Due: 2026-06-30

Items:
- Security consulting: $8,000
- Equipment maintenance: $1,200

Total: $9,200
`,

  B: `
Invoice #INV-1043
Date: 2026-06-01
Due: 2026-06-30

Items:
- Arc reactor components: $42,000
- Engineering consultation: $15,000

Total: $57,000
`,
// Note: customer name AND billing address missing — should trigger two tool calls

  C: `
Invoice #INV-1044
Date: 2026-06-01
Due: 2026-06-30

Items:
- Consulting services: $5,000

Total: $5,000
`,
// Note: customer name missing, no CRM record — should halt and flag
};

// ─── Change this to "A", "B", or "C" ─────────────────────────────────────────
const SCENARIO = "C";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  const invoice = INVOICES[SCENARIO];
  console.log(`\nRunning Scenario ${SCENARIO}`);
  console.log("Invoice text:");
  console.log(invoice);

  const outcome = await runAgent(invoice);

  console.log("\n" + "═".repeat(50));
  if (outcome.success) {
    console.log("FINAL EXPLANATION:");
    console.log("═".repeat(50));
    console.log(outcome.result);
  } else {
    console.log("⚠️  AGENT HALTED — ACTION REQUIRED:");
    console.log("═".repeat(50));
    console.log(outcome.result);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
