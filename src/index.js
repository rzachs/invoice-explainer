/**
 * index.js
 *
 * Full pipeline:
 *   Raw invoice text
 *       ↓
 *   [Claude call 1] Extract → JSON          (extract.js)
 *       ↓
 *   [Deterministic]  Validate + retry loop  (validate.js)
 *       ↓
 *   [Claude call 2]  Explain in plain lang  (explain.js)
 *       ↓
 *   Output to console
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node src/index.js
 */

import { extractInvoice } from "./extract.js";
import { explainInvoice } from "./explain.js";

// --- Sample invoice ---
// Replace this with file input, PDF text extraction, or stdin as needed.
const SAMPLE_INVOICE = `
Invoice #1042
From: Acme Corp
To: Wayne Enterprises
Date: 2026-05-01
Due: 2026-05-30

- Web design services: $3,200
- Hosting setup: $400

Total: $3,600
`;

// Audience: "business" | "accountant" | "developer"
const AUDIENCE = "business";

async function main() {
  // Guard: check API key is set
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
    console.error("Run: export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(1);
  }

  console.log("=== Invoice Explainer Pipeline ===\n");

  // --- Stage 1: Extract ---
  console.log("[1/2] Extracting...");
  const extraction = await extractInvoice(SAMPLE_INVOICE);

  if (!extraction.success) {
    console.error("\nPipeline failed at extraction stage:");
    console.error(extraction.error);
    process.exit(1);
  }

  console.log("\nExtracted JSON:");
  console.log(JSON.stringify(extraction.data, null, 2));

  // --- Stage 2: Explain ---
  console.log(`\n[2/2] Explaining (audience: ${AUDIENCE})...`);
  const explanation = await explainInvoice(extraction.data, AUDIENCE);

  console.log("\nPlain language explanation:");
  console.log("─".repeat(40));
  console.log(explanation);
  console.log("─".repeat(40));

  console.log(`\nDone. (${extraction.attempts} extraction attempt(s))`);
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
