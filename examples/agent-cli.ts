/**
 * MBS SDK Example — Agent CLI
 *
 * Runs an autonomous AI agent that can use MCP tools to accomplish
 * multi-step tasks via the MBS ReAct agent API.
 *
 * Usage:
 *   npm install @mbs/sdk
 *   npx tsx agent-cli.ts "Find all TODO comments in the project"
 *   npx tsx agent-cli.ts --list-tools
 */

import { MbsClient } from "../src/index.js";

const args = process.argv.slice(2);

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const baseUrl = getArg("--url", "http://127.0.0.1:3030");
const apiKey = args.includes("--key") ? getArg("--key", "") : undefined;
const maxSteps = parseInt(getArg("--max-steps", "10"), 10);
const listTools = args.includes("--list-tools");
const task = args.find((a) => !a.startsWith("--"));

async function main() {
  const client = new MbsClient({ baseUrl, apiKey });

  if (listTools) {
    const resp = await client.listTools();
    console.log(`Available MCP tools (${resp.tools.length}):\n`);
    for (const tool of resp.tools) {
      const params = tool.parameters
        ? JSON.stringify(tool.parameters, null, 2)
        : "none";
      console.log(`  ${tool.name}`);
      console.log(`    ${tool.description}`);
      console.log(`    Parameters: ${params}\n`);
    }
    return;
  }

  if (!task) {
    console.log("Usage: npx tsx agent-cli.ts <task> [--max-steps 10]");
    console.log('       npx tsx agent-cli.ts --list-tools');
    return;
  }

  console.log(`Agent task: ${task}`);
  console.log(`Max steps: ${maxSteps}\n`);
  console.log("=".repeat(60));

  const resp = await client.runAgent({
    task,
    max_steps: maxSteps,
  });

  console.log(`\nStatus:   ${resp.status}`);
  console.log(`Steps:    ${resp.steps_taken}`);

  if (resp.tool_calls && resp.tool_calls.length > 0) {
    console.log(`\nTool calls (${resp.tool_calls.length}):`);
    for (const tc of resp.tool_calls) {
      const name = typeof tc === "object" && tc !== null ? (tc as Record<string, unknown>).name ?? "unknown" : String(tc);
      console.log(`  - ${name}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Result:\n${resp.result}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
