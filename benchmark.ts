import WebSocket from "ws";
import { redis } from "bun";
import { loadEnv } from "./env";
import { ResultsManager } from "./results-manager";
import { generateReport, saveReport } from "./report";
import { snowflakeTimestamp } from "./latency-tracker";

const VM_NAME_TO_SOURCE: Record<string, string> = {
  "x-atlanta": "us-east1",
  "closest-to-mozilla": "us-east4",
  "x-oregon": "us-west1",
  "europe-london": "eu-west2",
  "europe-warsaw": "eu-central2",
};

let firstBarkMessage = true;

function getBarkTweetId(payload: any): string | null {
  if (payload._id) return String(payload._id);
  if (payload.mid) return String(payload.mid);
  if (payload.id) return String(payload.id);
  if (payload.tweet_id) return String(payload.tweet_id);
  if (payload.tweetId) return String(payload.tweetId);
  return null;
}

let isShuttingDown = false;
const allConnections: WebSocket[] = [];

const env = await loadEnv();
const useRedis = !!env.redisUrl;

const manager = new ResultsManager(async (tweetId, sources) => {
  const count = sources.size;
  console.log(
    `[Complete] ${tweetId} (${count}/${manager.getPendingCount() + manager.getCompleted().size})`,
  );

  if (useRedis) {
    const key = `latence:${env.vmName}`;
    for (const [source, receivedAt] of sources) {
      redis.hset(key, `${tweetId}:${source}`, String(receivedAt));
    }
  }
});

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\nShutting down...");

  for (const ws of allConnections) {
    try {
      ws.close();
    } catch {}
  }

  const all = manager.getAll();
  const completed = manager.getCompleted();
  console.log(`Completed tweets: ${completed.size}`);
  const pending = manager.getPendingCount();
  if (pending > 0) console.log(`Pending tweets: ${pending}`);

  const report = generateReport(all);
  console.log(`\n${report}`);
  if (!useRedis) await saveReport(report);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Connecting...");

for (const vm of env.vmConfigs) {
  const wsUrl = vm.httpUrl.replace("http://", "ws://");
  const url = `${wsUrl}/ws?useFastX=true&ignoreFullPayload=true`;
  const ws = new WebSocket(url, {
    headers: { "x-api-key": env.myApiKey },
  });

  ws.on("open", () => console.log(`[${vm.name}] Connected`));

  ws.on("message", (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      const tweetId = parsed.mid;
      const rawSource = parsed.vmName;

      const transport = parsed.payload.transport ?? "mozilla"; // fallback for web_push if not yet added
      const source = `${VM_NAME_TO_SOURCE[rawSource] ?? rawSource}:${transport}`;

      if (tweetId) {
        const receivedAt = Date.now();
        manager.record({
          source: source,
          tweetId: String(tweetId),
          receivedAt,
        });
      }
    } catch {}
  });

  ws.on("error", (err) => console.error(`[${vm.name}] Error: ${err.message}`));
  ws.on("close", () => console.log(`[${vm.name}] Disconnected`));

  allConnections.push(ws);
}

const barkWs = new WebSocket(env.barkWsUrl);

barkWs.on("open", () => {
  console.log("[bark] Connected");
  barkWs.send(`login ${env.barkApiKey}`);
});

barkWs.on("message", (data) => {
  const raw = data.toString();
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  if (firstBarkMessage) {
    console.log(
      "[bark] Connection info received (skipped):",
      JSON.stringify(parsed, null, 2),
    );
    firstBarkMessage = false;
  }

  if (!parsed._id) return;

  const authorHandle = parsed.tags?.AUTHOR_HANDLE;
  if (authorHandle && authorHandle.toLowerCase() !== "steffqing") return;

  const tweetId = getBarkTweetId(parsed);
  if (tweetId) {
    const receivedAt = Date.now();
    manager.record({ source: "bark", tweetId, receivedAt });
  }
});

barkWs.on("error", (err) => console.error(`[bark] Error: ${err.message}`));
barkWs.on("close", () => console.log("[bark] Disconnected"));

allConnections.push(barkWs);

console.log("Benchmark running. Press Ctrl+C to stop.");
