/**
 * validate.js
 *
 * Deterministic validation layer.
 * The LLM is the least reliable component in the pipeline.
 * All business rules live here — not in the prompt.
 */

export function validateInvoice(data) {
  const errors = [];

  // 1. Required fields
  const required = ["invoice_number", "vendor", "client", "total_amount"];
  for (const field of required) {
    if (data[field] === null || data[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // 2. Type check — LLMs often stringify numbers
  if (data.total_amount !== null && typeof data.total_amount !== "number") {
    errors.push(`total_amount must be a number, got: ${typeof data.total_amount}`);
  }

  // 3. Math check — models fail arithmetic more than you'd expect
  if (Array.isArray(data.line_items) && data.line_items.length > 0) {
    const sum = data.line_items.reduce((acc, item) => acc + (item.amount || 0), 0);
    const diff = Math.abs(sum - data.total_amount);
    if (diff > 0.01) {
      errors.push(`Line items sum ($${sum.toFixed(2)}) doesn't match total ($${data.total_amount})`);
    }
  }

  // 4. Date sanity
  if (data.issue_date && isNaN(Date.parse(data.issue_date))) {
    errors.push(`Invalid issue_date: ${data.issue_date}`);
  }
  if (data.due_date && isNaN(Date.parse(data.due_date))) {
    errors.push(`Invalid due_date: ${data.due_date}`);
  }

  // 5. Logical date ordering
  if (data.issue_date && data.due_date) {
    if (new Date(data.due_date) < new Date(data.issue_date)) {
      errors.push(`due_date (${data.due_date}) is before issue_date (${data.issue_date})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
