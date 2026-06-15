const Anthropic = require("@anthropic-ai/sdk");
const { executeTool } = require("./mock-crm");
const { Logger } = require("./logger");

const client = new Anthropic();

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
      cache_control: { type: "ephemeral" },
    },
  },
];

const SYSTEM_PROMPT = `You are an invoice analysis agent. Your job is to:
1. Analyse the invoice provided by the user
2. Identify any missing critical fields: customer name, billing address
3. Use the available tools to look up missing information from the CRM
4. Once you have all available information, produce a clear plain-language explanation of the invoice
5. If a tool returns { found: false }, clearly flag to the user what is missing and cannot be resolved — do not guess or invent data`;

const INVOICE_NUMBER_FORMAT = /^INV-\d+$/;

function validateInvoiceNumber(invoiceNumber) {
  if (!invoiceNumber) return false;
  return INVOICE_NUMBER_FORMAT.test(invoiceNumber);
}

async function runAgent(invoiceText) {
  console.log("\n" + "═".repeat(50));
  console.log("🤖 AGENT STARTING");
  console.log("═".repeat(50));

  const logger = new Logger();
  const messages = [{ role: "user", content: invoiceText }];

  let iteration = 0;
  const MAX_ITERATIONS = 10;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n── Loop iteration ${iteration} ──`);
    logger.logIteration(iteration);

    // Log exactly what we're about to send
    logger.logRequest({
      model: "claude-sonnet-4-6",
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    let response;
    try {
      const stream = client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      stream.on("text", (text) => {
        process.stdout.write(text);
      });

      response = await stream.finalMessage();
    } catch (err) {
      console.error(`\n❌ Anthropic API error: ${err.status} — ${err.message}`);
      return {
        success: false,
        result: `API error (${err.status ?? "unknown"}): ${err.message}`,
      };
    }

    // Log exactly what came back
    logger.logResponse(response);

    console.log(`\nstop_reason: ${response.stop_reason}`);

    if (response.stop_reason === "end_turn") {
      const finalText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      console.log("\n✅ Agent finished (end_turn)");
      const outcome = { success: true, result: finalText };
      logger.logEnd(outcome);
      return outcome;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`\n🔧 Claude requests tool: ${block.name}`);
          console.log(`   Input: ${JSON.stringify(block.input)}`);

          const invoiceNumber = block.input.invoice_number;

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

    console.log(`⚠️  Unexpected stop_reason: ${response.stop_reason}`);
    const outcome = {
      success: false,
      result: `Agent stopped unexpectedly: ${response.stop_reason}`,
    };
    logger.logEnd(outcome);
    return outcome;
  }

  const outcome = {
    success: false,
    result: `Agent exceeded maximum iterations (${MAX_ITERATIONS}). Something may be looping.`,
  };
  logger.logEnd(outcome);
  return outcome;
}

module.exports = { runAgent };
