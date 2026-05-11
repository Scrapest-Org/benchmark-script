import { snowflakeTimestamp } from "./latency-tracker";
import { SOURCES } from "./results-manager";

export function generateReport(
  completedTweets: Map<string, Map<string, number>>,
): string {
  const rows: Array<{ tweetId: string; sources: Map<string, number> }> = [];
  for (const [tweetId, sources] of completedTweets) {
    rows.push({ tweetId, sources });
  }

  const header = `| Tweet ID | ${SOURCES.join(" | ")} |`;
  const sep = `|${"-".repeat(10)}|${SOURCES.map(() => "-".repeat(10)).join("|")}|`;

  const lines: string[] = [header, sep];

  for (const row of rows) {
    const timestamps = SOURCES.map((s) => {
      const t = row.sources.get(s);
      return t !== undefined ? String(t) : "-";
    });
    lines.push(`| ${row.tweetId} | ${timestamps.join(" | ")} |`);
  }

  if (rows.length > 0) {
    const totals: Record<string, number[]> = {};
    for (const s of SOURCES) totals[s] = [];

    for (const row of rows) {
      const fastest = snowflakeTimestamp(row.tweetId);
      for (const source of SOURCES) {
        const ts = row.sources.get(source);
        if (ts !== undefined) {
          totals[source].push(ts - fastest);
        }
      }
    }

    const avgLatencies = SOURCES.map((s) => {
      const vals = totals[s];
      if (vals.length === 0) return "-";
      return `${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}ms`;
    });

    lines.push(`| **Avg latency** | ${avgLatencies.join(" | ")} |`);
  }

  return lines.join("\n");
}

export async function saveReport(content: string) {
  const timestamp = Date.now();
  const filename = `results/report-${timestamp}.md`;
  await Bun.write(filename, content);
  console.log(`Report saved to ${filename}`);
}
