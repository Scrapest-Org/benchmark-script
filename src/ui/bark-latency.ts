import WebSocket from "ws";
import { snowflakeTimestamp } from "../lib/latency-tracker";

const barkWsUrl = process.env.BARK_WS_URL!;
const barkApiKey = process.env.BARK_API_KEY!;

const latencies: number[] = [];
let count = 0;
let isShuttingDown = false;

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  ws.close();
  const n = latencies.length;
  if (n === 0) {
    console.log("\nNo tweets received.");
    process.exit(0);
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const avg = Math.round(sorted.reduce((a, b) => a + b, 0) / n);
  const min = sorted[0];
  const max = sorted[n - 1];
  const p50 = sorted[Math.floor(n * 0.5)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];

  console.log("\n=== Bark Latency Report ===");
  console.log(`  tweets:     ${n}`);
  console.log(`  min:        ${min}ms`);
  console.log(`  p50:        ${p50}ms`);
  console.log(`  p95:        ${p95}ms`);
  console.log(`  p99:        ${p99}ms`);
  console.log(`  max:        ${max}ms`);
  console.log(`  avg:        ${avg}ms`);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const ws = new WebSocket(barkWsUrl);

ws.on("open", () => {
  console.log("Connected to bark");
  ws.send(`login ${barkApiKey}`);
});

let firstMsg = true;

ws.on("message", (data) => {
  const clientTs = Date.now();
  let parsed: any;
  try {
    parsed = JSON.parse(data.toString());
  } catch {
    return;
  }

  if (firstMsg) {
    console.log("Connection established\n");
    firstMsg = false;
    return;
  }

  const tweetId = parsed.tags?.TWEET_ID;
  if (!tweetId) return;

  const sft = snowflakeTimestamp(tweetId);
  const latency = clientTs - sft;
  latencies.push(latency);
  count++;

  const abs = Math.abs(latency);
  const bar = abs > 0 ? "█".repeat(Math.min(Math.round(abs / 100), 80)) : "·";
  const sign = latency >= 0 ? "+" : "";
  console.log(
    `${String(count).padStart(4)} ${tweetId}  ${sign}${latency}ms ${bar}`,
  );
});

ws.on("error", (err) => console.error("Error:", err.message));
ws.on("close", () => {
  if (!isShuttingDown) {
    console.log("Disconnected");
    shutdown();
  }
});
