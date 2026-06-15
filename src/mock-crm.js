/**
 * mock-crm.js
 *
 * Simulates a real CRM database with a plain JS object.
 * In production this would be a SQL query against your real CRM.
 *
 * Three scenarios built in:
 *   INV-1042 → full record (happy path, one tool call)
 *   INV-1043 → missing billing_address (forces second tool call)
 *   INV-1044 → no record at all (forces halt + flag)
 */

const CRM = {
  "INV-1042": {
    customer_name: "Wayne Enterprises",
    billing_address: "1007 Mountain Drive, Gotham",
    email: "accounts@wayne.com",
  },
  "INV-1043": {
    customer_name: "Stark Industries",
    // billing_address deliberately missing — forces second tool call
    email: "ap@stark.com",
  },
  "INV-1044": {
    // No data — forces halt and flag to user
  },
};

/**
 * Tool: lookup_customer
 * Input:  { invoice_number: string }
 * Output: { found: boolean, customer_name?: string }
 *
 * Claude calls this when customer_name is missing from the invoice.
 */
function lookupCustomer({ invoice_number }) {
  const record = CRM[invoice_number];
  if (record && record.customer_name) {
    return { found: true, customer_name: record.customer_name };
  }
  return { found: false };
}

/**
 * Tool: lookup_billing_address
 * Input:  { invoice_number: string }
 * Output: { found: boolean, billing_address?: string }
 *
 * Claude calls this when billing_address is missing from the invoice.
 */
function lookupBillingAddress({ invoice_number }) {
  const record = CRM[invoice_number];
  if (record && record.billing_address) {
    return { found: true, billing_address: record.billing_address };
  }
  return { found: false };
}

/**
 * Dispatcher — routes Claude's tool_use request to the right function.
 * This is what your agent loop calls when Claude requests a tool.
 */
function executeTool(toolName, toolInput) {
  switch (toolName) {
    case "lookup_customer":
      return lookupCustomer(toolInput);
    case "lookup_billing_address":
      return lookupBillingAddress(toolInput);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

module.exports = { executeTool };
