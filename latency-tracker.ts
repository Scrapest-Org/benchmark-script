export function snowflakeTimestamp(tag: string | bigint): number {
  // return Number(
  //   ((BigInt(tag) >> BigInt(22)) & BigInt(2199023255551)) +
  //     BigInt(1288834974657),
  // );
  return Number((BigInt(tag) >> BigInt(22)) + BigInt(1288834974657));
}

export interface LatencyEntry {
  tweetId: string;
  source: string;
  snowflakeTs: number;
  serverTs: number | null;
  clientTs: number;
  postLatency: number | null;
  networkLatency: number | null;
  totalLatency: number;
}

const entries: LatencyEntry[] = [];

export function recordLatency(opts: {
  tweetId: string;
  source: string;
  serverTimestamp: number | null;
  clientTimestamp: number;
}): LatencyEntry {
  const sft = snowflakeTimestamp(opts.tweetId);
  const entry: LatencyEntry = {
    tweetId: opts.tweetId,
    source: opts.source,
    snowflakeTs: sft,
    serverTs: opts.serverTimestamp,
    clientTs: opts.clientTimestamp,
    postLatency:
      opts.serverTimestamp !== null ? opts.serverTimestamp - sft : null,
    networkLatency:
      opts.serverTimestamp !== null
        ? opts.clientTimestamp - opts.serverTimestamp
        : null,
    totalLatency: opts.clientTimestamp - sft,
  };
  entries.push(entry);

  const post = entry.postLatency !== null ? `${entry.postLatency}ms` : "?";
  const net = entry.networkLatency !== null ? `${entry.networkLatency}ms` : "?";
  console.log(
    `[${opts.source}] ${opts.tweetId}  post:${post}  net:${net}  total:${entry.totalLatency}ms`,
  );

  return entry;
}

export function getAll(): LatencyEntry[] {
  return entries;
}

export function printLatencySummary(): void {
  const bySource = new Map<string, LatencyEntry[]>();
  for (const e of entries) {
    const arr = bySource.get(e.source) ?? [];
    arr.push(e);
    bySource.set(e.source, arr);
  }

  console.log("\n=== Latency Summary ===");
  for (const [source, list] of bySource) {
    const n = list.length;
    const totalAvg = Math.round(
      list.reduce((a, e) => a + e.totalLatency, 0) / n,
    );
    const postAvg = list.some((e) => e.postLatency !== null)
      ? Math.round(
          list
            .filter((e) => e.postLatency !== null)
            .reduce((a, e) => a + e.postLatency!, 0) /
            list.filter((e) => e.postLatency !== null).length,
        )
      : null;
    const netAvg = list.some((e) => e.networkLatency !== null)
      ? Math.round(
          list
            .filter((e) => e.networkLatency !== null)
            .reduce((a, e) => a + e.networkLatency!, 0) /
            list.filter((e) => e.networkLatency !== null).length,
        )
      : null;
    const parts = [`total avg: ${totalAvg}ms`];
    if (postAvg !== null) parts.push(`post avg: ${postAvg}ms`);
    if (netAvg !== null) parts.push(`net avg: ${netAvg}ms`);
    console.log(`  ${source} (n=${n})  ${parts.join("  ")}`);
  }
}
