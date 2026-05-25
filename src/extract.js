/**
 * extract.js
 *
 * Claude call #1 — extract structured JSON from raw invoice text.
 * Includes a retry loop: validation errors are fed back to Claude
 * so it can self-correct. Max 3 attempts.
 *
 * Key principle: the model handles variable input formats.
 * Deterministic code (validate.js) handles correctness checks.
 */

import Anthropic from "@anthropic-ai/sdk";
import { validateInvoice } from "./validate.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `You are an invoice extraction assistant.
Extract key fields from the invoice text and return ONLY a valid JSON object.
No prose, no markdown fences, no explanation — only the raw JSON object.

Required fields:
- invoice_number (string)
- vendor (string)
- client (string)
- issue_date (YYYY-MM-DD format, or null if missing)
- due_date (YYYY-MM-DD format, or null if missing)
- line_items (array of { description: string, amount: number })
- total_amount (number, not a string)
- currency (string, default "USD" if not specified)`;

async function callClaude(invoiceText, previousError = null) {
  const userMessage = previousError
    ? `Previous attempt failed with these errors:\n${previousError}\n\nFix them and extract this invoice again:\n\n${invoiceText}`
    : `Extract this invoice:\n\n${invoiceText}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  return response.content[0].text;
}

export async function extractInvoice(invoiceText, maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`  Extraction attempt ${attempt}/${maxAttempts}...`);

    let raw;
    try {
      raw = await callClaude(invoiceText, lastError);
    } catch (err) {
      throw new Error(`API call failed: ${err.message}`);
    }

    // Parse — strip any accidental markdown fences
    let parsed;
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      lastError = "You returned invalid JSON. Return only a raw JSON object, no markdown, no explanation.";
      console.log(`  ✗ Invalid JSON on attempt ${attempt}`);
      continue;
    }

    // Validate
    const validation = validateInvoice(parsed);
    if (validation.valid) {
      console.log(`  ✓ Extracted and validated on attempt ${attempt}`);
      return { success: true, data: parsed, attempts: attempt };
    }

    lastError = `Validation errors:\n${validation.errors.join("\n")}`;
    console.log(`  ✗ Validation failed on attempt ${attempt}:\n    ${validation.errors.join("\n    ")}`);
  }

  return {
    success: false,
    error: `Could not produce valid output after ${maxAttempts} attempts. Last errors:\n${lastError}`,
    attempts: maxAttempts,
  };
}
