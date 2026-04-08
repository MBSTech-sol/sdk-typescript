/**
 * MBS SDK Example — Interactive Chat App
 *
 * A terminal chatbot that connects to a local MBS Workbench server
 * and maintains a multi-turn conversation with streaming support.
 *
 * Usage:
 *   npm install @mbs/sdk
 *   npx tsx chat-app.ts [--url http://127.0.0.1:3030]
 */

import { MbsClient } from "../src/index.js";
import type { ChatMessage } from "../src/index.js";
import * as readline from "node:readline";

const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");
const baseUrl = urlIdx >= 0 && args[urlIdx + 1] ? args[urlIdx + 1] : "http://127.0.0.1:3030";
const keyIdx = args.indexOf("--key");
const apiKey = keyIdx >= 0 && args[keyIdx + 1] ? args[keyIdx + 1] : undefined;

const client = new MbsClient({ baseUrl, apiKey });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function main() {
  // Verify connection
  const models = await client.models();
  console.log(`Connected to MBS server at ${baseUrl}`);
  console.log(`Available models: ${models.data.map((m: { id: string }) => m.id).join(", ")}`);
  console.log('Type "quit" to exit, "clear" to reset conversation.\n');

  const history: ChatMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
  ];

  while (true) {
    const input = await ask("You: ");
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed.toLowerCase() === "quit") {
      console.log("Goodbye!");
      break;
    }
    if (trimmed.toLowerCase() === "clear") {
      history.length = 1; // Keep system prompt
      console.log("Conversation cleared.\n");
      continue;
    }

    history.push({ role: "user", content: trimmed });

    const resp = await client.chat({
      messages: history,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const assistantMsg = resp.choices[0].message.content;
    history.push({ role: "assistant", content: assistantMsg });
    console.log(`Assistant: ${assistantMsg}\n`);
  }

  rl.close();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
