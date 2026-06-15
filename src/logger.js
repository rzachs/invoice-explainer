/**
 * logger.js
 *
 * Writes full API payloads to logs/debug-TIMESTAMP.log
 * One file per agent run. Never logged to console.
 *
 * Each iteration is clearly separated:
 *   ── ITERATION 1 ──
 *   [REQUEST]  everything sent to Claude
 *   [RESPONSE] everything Claude sent back
 *   ── ITERATION 2 ──
 *   ...
 */

const fs = require("fs");
const path = require("path");

class Logger {
  constructor() {
    // Create logs/ folder if it doesn't exist
    const logsDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }

    // One log file per run, named by timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.logPath = path.join(logsDir, `debug-${timestamp}.log`);

    // Write header
    this.write(`AGENT DEBUG LOG`);
    this.write(`Started: ${new Date().toISOString()}`);
    this.write(`${"═".repeat(60)}\n`);

    console.log(`📝 Logging to: ${this.logPath}`);
  }

  // Raw write to file
  write(text) {
    fs.appendFileSync(this.logPath, text + "\n");
  }

  // Called at the start of each loop iteration
  logIteration(iteration) {
    this.write(`\n${"─".repeat(60)}`);
    this.write(`ITERATION ${iteration}`);
    this.write(`${"─".repeat(60)}`);
  }

  // Called just before client.messages.create() — logs everything being sent
  logRequest({ model, system, tools, messages }) {
    this.write("\n[REQUEST]");
    this.write(`  model: ${model}`);
    this.write(`  system: ${system}`);
    this.write(`\n  tools: ${JSON.stringify(tools, null, 2)}`);
    this.write(`\n  messages (${messages.length} total):`);

    messages.forEach((msg, i) => {
      this.write(`\n  [${i}] role: ${msg.role}`);
      if (typeof msg.content === "string") {
        this.write(`      content: ${msg.content}`);
      } else {
        // content is an array of blocks (tool_use, tool_result, text)
        msg.content.forEach((block) => {
          this.write(`      block type: ${block.type}`);
          if (block.type === "tool_use") {
            this.write(`        name: ${block.name}`);
            this.write(`        id: ${block.id}`);
            this.write(`        input: ${JSON.stringify(block.input)}`);
          }
          if (block.type === "tool_result") {
            this.write(`        tool_use_id: ${block.tool_use_id}`);
            this.write(`        content: ${block.content}`);
          }
          if (block.type === "text") {
            this.write(`        text: ${block.text}`);
          }
        });
      }
    });
  }

  // Called after response arrives — logs what Claude sent back
  logResponse(response) {
    this.write("\n[RESPONSE]");
    this.write(`  stop_reason: ${response.stop_reason}`);
    this.write(`  usage: input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens}`);
    this.write(`  cache_creation_tokens=${response.usage.cache_creation_input_tokens ?? 0}`);
    this.write(`  cache_read_tokens=${response.usage.cache_read_input_tokens ?? 0}`);
    this.write(`\n  content blocks (${response.content.length} total):`);

    response.content.forEach((block) => {
      this.write(`\n  block type: ${block.type}`);
      if (block.type === "text") {
        this.write(`    text: ${block.text}`);
      }
      if (block.type === "tool_use") {
        this.write(`    name: ${block.name}`);
        this.write(`    id: ${block.id}`);
        this.write(`    input: ${JSON.stringify(block.input)}`);
      }
    });
  }

  // Called at the end of the run
  logEnd(outcome) {
    this.write(`\n${"═".repeat(60)}`);
    this.write(`RUN COMPLETE`);
    this.write(`success: ${outcome.success}`);
    if (!outcome.success) {
      this.write(`reason: ${outcome.result}`);
    }
  }
}

module.exports = { Logger };
