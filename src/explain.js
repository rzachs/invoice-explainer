/**
 * explain.js
 *
 * Claude call #2 — explain the validated invoice in plain language.
 *
 * Key principle: we pass validated JSON here, NOT the raw invoice text.
 * The extraction + validation pipeline already did the hard work.
 * Claude is now explaining YOUR verified data, not re-interpreting
 * the original document.
 *
 * Audience options: "business" | "accountant" | "developer"
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const AUDIENCE_PROMPTS = {
  business: `You are explaining an invoice to a non-technical business owner.
Be concise and friendly. Highlight what they need to action — especially
the amount owed and due date. Flag anything unusual.`,

  accountant: `You are explaining an invoice to an accountant.
Be precise. Cover line items, totals, dates, tax implications if visible,
and flag any anomalies or missing fields that would matter for bookkeeping.`,

  developer: `You are explaining an invoice to a developer debugging a data pipeline.
Be terse and structured. Highlight data anomalies, missing fields, or anything
that looks like it could cause downstream processing issues.`,
};

export async function explainInvoice(validatedData, audience = "business") {
  const systemPrompt = AUDIENCE_PROMPTS[audience] ?? AUDIENCE_PROMPTS.business;

  console.log(`  Generating explanation for audience: ${audience}...`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Explain this invoice in plain language:\n\n${JSON.stringify(validatedData, null, 2)}`,
      },
    ],
  });

  return response.content[0].text;
}
