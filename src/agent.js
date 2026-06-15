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
 */

const Anthropic = require("@anthropic-ai/sdk");
const { executeTool } = require("./mock-crm");

const client = new Anthropic();

// ─── Tool definitions ────────────────────────────────────────────────────────
// These are what Claude reads to know what tools exist and when to use them.
// The description is critical — it's Claude's instructions for when to call it.

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
// Tells Claude its role and what to do when it hits a dead end.

const SYSTEM_PROMPT = `You are an invoice analysis agent. Your job is to:
1. Analyse the invoice provided by the user
2. Identify any missing critical fields: customer name, billing address
3. Use the available tools to look up missing information from the CRM
4. Once you have all available information, produce a clear plain-language explanation of the invoice
5. If a tool returns { found: false }, clearly flag to the user what is missing and cannot be resolved — do not guess or invent data`;

// ─── Agent loop ───────────────────────────────────────────────────────────────

async function runAgent(invoiceText) {
  console.log("\n" + "═".repeat(50));
  console.log("🤖 AGENT STARTING");
  console.log("═".repeat(50));

  // messages is the full conversation history.
  // Claude has no memory — we send everything every time.
  const messages = [{ role: "user", content: invoiceText }];

  let iteration = 0;
  const MAX_ITERATIONS = 10; // safety ceiling — prevents infinite loops

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n── Loop iteration ${iteration} ──`);

    // Send current conversation to Claude
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

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
      // Add Claude's response (including tool_use blocks) to history
      messages.push({ role: "assistant", content: response.content });

      // Collect all tool results — Claude may request multiple tools at once
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`\n🔧 Claude requests tool: ${block.name}`);
          console.log(`   Input: ${JSON.stringify(block.input)}`);

          // YOUR CODE runs the actual function — Claude never touches the DB
          const result = executeTool(block.name, block.input);
          console.log(`   Result: ${JSON.stringify(result)}`);

          // Package result in the format the API expects
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id, // must match the id Claude generated
            content: JSON.stringify(result),
          });
        }

        // Print any reasoning text Claude produces before tool calls
        if (block.type === "text" && block.text.trim()) {
          console.log(`\n💭 Claude reasoning: ${block.text}`);
        }
      }

      // Send tool results back — this is what closes the loop
      messages.push({ role: "user", content: toolResults });

      // Loop continues — Claude will now reason about the results
      continue;
    }

    // ── UNEXPECTED stop_reason ────────────────────────────────────────────
    console.log(`⚠️  Unexpected stop_reason: ${response.stop_reason}`);
    return {
      success: false,
      result: `Agent stopped unexpectedly: ${response.stop_reason}`,
    };
  }

  // ── EXIT CONDITION 2: Hit safety ceiling ──────────────────────────────────
  return {
    success: false,
    result: `Agent exceeded maximum iterations (${MAX_ITERATIONS}). Something may be looping.`,
  };
}

module.exports = { runAgent };
