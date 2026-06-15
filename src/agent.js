/**
 * agent.js
 *
 * The agentic layer. This is the new piece that makes invoice-explainer
 * an agent rather than a fixed pipeline.
 *
 * WHAT THIS DOES:
 *   1. Sends the invoice to Claude with two tool definitions
 *   2. Checks stop_reason on every response
 *   3. If "tool_use" → executes the tool, sends result back, loops
 *   4. If "end_turn" → Claude is done, return the final text
 *   5. If Claude flags a dead end → halt and surface the problem
 *
 * THE LOOP CONDITION (from the docs):
 *   while (stop_reason === "tool_use") → keep going
 *   stop_reason === "end_turn"         → done
 *
 * FIXES APPLIED:
 *   #1 — try/catch around client.messages.create()
 *   #3 — validate invoice_number format before hitting the CRM
 */

const Anthropic = require("@anthropic-ai/sdk");
const { executeTool } = require("./mock-crm");

const client = new Anthropic();

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "lookup_customer",
    description:
      "When the customer name is missing or unknown in the invoice, look up the customer name in the CRM using the invoice number. Only call this if the customer name is not already present in the invoice.",
    input_schema: {
      type: "object",
      properties: {
        invoice_number: {
          type: "string",
          description: "The invoice number extracted from the invoice text",
        },
      },
      required: ["invoice_number"],
    },
  },
  {
    name: "lookup_billing_address",
    description:
      "When the billing address is missing from the invoice, look up the billing address in the CRM using the invoice number. Only call this if the billing address is not already present in the invoice.",
    input_schema: {
      type: "object",
      properties: {
        invoice_number: {
          type: "string",
          description: "The invoice number extracted from the invoice text",
        },
      },
      required: ["invoice_number"],
    },
  },
];

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an invoice analysis agent. Your job is to:
1. Analyse the invoice provided by the user
2. Identify any missing critical fields: customer name, billing address
3. Use the available tools to look up missing information from the CRM
4. Once you have all available information, produce a clear plain-language explanation of the invoice
5. If a tool returns { found: false }, clearly flag to the user what is missing and cannot be resolved — do not guess or invent data`;

// ─── Invoice number validation ────────────────────────────────────────────────
// FIX #3: Claude extracts the invoice number from raw text — we don't control it.
// Validate before hitting the CRM to catch hallucinated or malformed values.

const INVOICE_NUMBER_FORMAT = /^INV-\d+$/;

function validateInvoiceNumber(invoiceNumber) {
  if (!invoiceNumber) return false;
  return INVOICE_NUMBER_FORMAT.test(invoiceNumber);
}

// ─── Agent loop ───────────────────────────────────────────────────────────────

async function runAgent(invoiceText) {
  console.log("\n" + "═".repeat(50));
  console.log("🤖 AGENT STARTING");
  console.log("═".repeat(50));

  const messages = [{ role: "user", content: invoiceText }];

  let iteration = 0;
  const MAX_ITERATIONS = 10;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n── Loop iteration ${iteration} ──`);

    // FIX #1: wrap API call in try/catch
    // A 429 (rate limit), 500 (server error), or network failure will throw.
    // We catch it, log the status code, and fail clean instead of crashing.
    let response;
    try {
      response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      // err.status is the HTTP status code from the Anthropic SDK
      // Useful later if you want to add retry logic for 429 vs 400
      console.error(`\n❌ Anthropic API error: ${err.status} — ${err.message}`);
      return {
        success: false,
        result: `API error (${err.status ?? "unknown"}): ${err.message}`,
      };
    }

    console.log(`stop_reason: ${response.stop_reason}`);

    // ── EXIT CONDITION 1: Claude is done ──────────────────────────────────
    if (response.stop_reason === "end_turn") {
      const finalText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      console.log("\n✅ Agent finished (end_turn)");
      return { success: true, result: finalText };
    }

    // ── TOOL USE: Claude wants to call a tool ─────────────────────────────
    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`\n🔧 Claude requests tool: ${block.name}`);
          console.log(`   Input: ${JSON.stringify(block.input)}`);

          const invoiceNumber = block.input.invoice_number;

          // FIX #3: validate invoice number format before hitting the CRM.
          // If Claude hallucinated or misread the number, we catch it here
          // and send an error result back instead of a silent { found: false }.
          if (!validateInvoiceNumber(invoiceNumber)) {
            console.log(`   ⚠️  Invalid invoice number: "${invoiceNumber}" — skipping CRM call`);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({
                error: `Invalid invoice number format: "${invoiceNumber}". Expected format: INV-followed by digits (e.g. INV-1042)`,
              }),
            });
          } else {
            // Invoice number looks valid — safe to hit the CRM
            const result = executeTool(block.name, block.input);
            console.log(`   Result: ${JSON.stringify(result)}`);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }

        if (block.type === "text" && block.text.trim()) {
          console.log(`\n💭 Claude reasoning: ${block.text}`);
        }
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // ── UNEXPECTED stop_reason ────────────────────────────────────────────
    console.log(`⚠️  Unexpected stop_reason: ${response.stop_reason}`);
    return {
      success: false,
      result: `Agent stopped unexpectedly: ${response.stop_reason}`,
    };
  }

  return {
    success: false,
    result: `Agent exceeded maximum iterations (${MAX_ITERATIONS}). Something may be looping.`,
  };
}

module.exports = { runAgent };

