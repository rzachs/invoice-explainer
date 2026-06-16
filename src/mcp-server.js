/**
 * mcp-server.js
 *
 * Exposes the invoice-explainer CRM tools as an MCP server.
 * Claude Desktop connects to this server and calls tools natively —
 * no agent loop, no orchestration code needed on our side.
 *
 * Tools exposed:
 *   - lookup_customer
 *   - lookup_billing_address
 *
 * Transport: stdio (Claude Desktop launches this as a child process)
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { executeTool } = require("./mock-crm");

// ─── Create MCP server ────────────────────────────────────────────────────────

const server = new McpServer({
  name: "invoice-explainer",
  version: "1.0.0",
});

// ─── Tool: lookup_customer ────────────────────────────────────────────────────
// Same logic as before — Claude Desktop calls this when customer name is missing

server.tool(
  "lookup_customer",
  "When the customer name is missing or unknown in the invoice, look up the customer name in the CRM using the invoice number. Only call this if the customer name is not already present in the invoice.",
  {
    invoice_number: z
      .string()
      .describe("The invoice number extracted from the invoice text"),
  },
  async ({ invoice_number }) => {
    const result = executeTool("lookup_customer", { invoice_number });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
    };
  }
);

// ─── Tool: lookup_billing_address ─────────────────────────────────────────────

server.tool(
  "lookup_billing_address",
  "When the billing address is missing from the invoice, look up the billing address in the CRM using the invoice number. Only call this if the billing address is not already present in the invoice.",
  {
    invoice_number: z
      .string()
      .describe("The invoice number extracted from the invoice text"),
  },
  async ({ invoice_number }) => {
    const result = executeTool("lookup_billing_address", { invoice_number });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
    };
  }
);

// ─── Start server ─────────────────────────────────────────────────────────────
// StdioServerTransport: Claude Desktop launches this process and communicates
// through stdin/stdout — no HTTP, no ports, no network config needed

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: don't console.log here — stdout is reserved for MCP protocol messages
  // Any logging must go to stderr
  console.error("Invoice Explainer MCP server running");
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
