import { redis } from "../lib/redis";
import { snowflakeTimestamp } from "../lib/latency-tracker";

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * (p / 100));
  return sorted[Math.min(idx, sorted.length - 1)];
}

const html = await Bun.file(import.meta.dir + "/dashboard.html").text();

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/api/vms") {
        const keys = await redis.keys("latency:*");
        const vms = (keys as string[])
          .map((k: string) => k.slice("latency:".length))
          .sort();
        return Response.json({ vms });
      }

      if (url.pathname === "/api/latency" || url.pathname === "/api/latency/") {
        const vmName = url.searchParams.get("vm") || "local-dev";
        const key = `latency:${vmName}`;
        const raw = await redis.hgetall(key);

        if (
          !raw ||
          typeof raw !== "object" ||
          !Object.keys(raw as object).length
        ) {
          return Response.json({
            vmName,
            tweetCount: 0,
            dataPointCount: 0,
            sources: {},
          });
        }

        const tweets = raw as Record<string, string>;
        const perSource: Record<string, number[]> = {};
        const uniqueTweets = new Set<string>();

        for (const [field, receivedAtStr] of Object.entries(tweets)) {
          const colonIdx = field.indexOf(":");
          if (colonIdx === -1) continue;
          const tweetId = field.slice(0, colonIdx);
          const source = field.slice(colonIdx + 1);
          const receivedAt = Number(receivedAtStr);
          const sft = snowflakeTimestamp(tweetId);
          const latency = receivedAt - sft;

          uniqueTweets.add(tweetId);
          if (!perSource[source]) perSource[source] = [];
          perSource[source].push(Math.abs(latency));
        }

        const sources: Record<string, any> = {};
        for (const [source, lats] of Object.entries(perSource)) {
          const sorted = lats.sort((a, b) => a - b);
          const n = sorted.length;
          sources[source] = {
            count: n,
            avg: Math.round(sorted.reduce((a, b) => a + b, 0) / n),
            min: sorted[0],
            max: sorted[n - 1],
            p50: percentile(sorted, 50),
            p95: percentile(sorted, 95),
            p99: percentile(sorted, 99),
          };
        }

        return Response.json({
          vmName,
          tweetCount: uniqueTweets.size,
          dataPointCount: Object.keys(tweets).length,
          sources,
        });
      }

      if (url.pathname === "/api/tweets" || url.pathname === "/api/tweets/") {
        const vmName = url.searchParams.get("vm") || "local-dev";
        const sourceFilter = url.searchParams.get("source") || "";
        const key = `latency:${vmName}`;
        const raw = await redis.hgetall(key);

        if (
          !raw ||
          typeof raw !== "object" ||
          !Object.keys(raw as object).length
        ) {
          return Response.json({ vmName, entries: [] });
        }

        const tweets = raw as Record<string, string>;
        const entries: Array<{
          tweetId: string;
          source: string;
          receivedAt: number;
          latency: number;
        }> = [];

        for (const [field, receivedAtStr] of Object.entries(tweets)) {
          const colonIdx = field.indexOf(":");
          if (colonIdx === -1) continue;
          const tweetId = field.slice(0, colonIdx);
          const source = field.slice(colonIdx + 1);
          if (sourceFilter && source !== sourceFilter) continue;
          const receivedAt = Number(receivedAtStr);
          const sft = snowflakeTimestamp(tweetId);
          entries.push({
            tweetId,
            source,
            receivedAt,
            latency: Math.abs(receivedAt - sft),
          });
        }

        return Response.json({ vmName, entries });
      }
    } catch (e) {
      console.error("API error:", url.pathname, e);
      return Response.json({ error: String(e) }, { status: 500 });
    }

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log("Dashboard: http://localhost:3000");
