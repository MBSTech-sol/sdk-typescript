/**
 * MBS SDK Example — Batch Processor
 *
 * Reads prompts from a JSON array file, processes them in parallel
 * against the MBS server, and writes results to an output JSON file.
 *
 * Usage:
 *   npm install @mbs/sdk
 *   npx tsx batch-processor.ts prompts.json --output results.json --concurrency 4
 *
 * Input format (prompts.json):
 *   ["Summarize quantum computing", "Explain neural networks", ...]
 */

import { MbsClient } from "../src/index.js";
import type { ChatCompletionRequest } from "../src/index.js";
import * as fs from "node:fs";

const args = process.argv.slice(2);

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const inputFile = args.find((a) => !a.startsWith("--")) ?? "prompts.json";
const outputFile = getArg("--output", "results.json");
const concurrency = parseInt(getArg("--concurrency", "4"), 10);
const maxTokens = parseInt(getArg("--max-tokens", "512"), 10);
const baseUrl = getArg("--url", "http://127.0.0.1:3030");
const apiKey = args.includes("--key") ? getArg("--key", "") : undefined;

async function main() {
  // Read prompts
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: ${inputFile} not found`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputFile, "utf-8");
  const prompts: string[] = JSON.parse(raw);
  console.log(`Loaded ${prompts.length} prompts from ${inputFile}`);

  // Build requests
  const requests: ChatCompletionRequest[] = prompts.map((prompt) => ({
    messages: [{ role: "user" as const, content: prompt }],
    max_tokens: maxTokens,
  }));

  // Process batch
  const client = new MbsClient({ baseUrl, apiKey });
  const start = performance.now();
  const batch = await client.batchChat({ requests, concurrency });
  const elapsed = (performance.now() - start) / 1000;

  // Write results
  const results = batch.results.map((r: { ok: boolean; value?: any; error?: Error }, i: number) => ({
    prompt: prompts[i],
    response: r.ok ? r.value.choices[0]?.message?.content ?? "" : "",
    status: r.ok ? "ok" : "error",
    error: r.ok ? undefined : (r.error as Error).message,
    tokens: r.ok ? r.value.usage?.total_tokens ?? 0 : 0,
  }));

  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), "utf-8");

  console.log(`\nResults written to ${outputFile}`);
  console.log(`  Succeeded: ${batch.succeeded}/${batch.results.length}`);
  console.log(`  Failed:    ${batch.failed}/${batch.results.length}`);
  console.log(`  Time:      ${elapsed.toFixed(1)}s`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
