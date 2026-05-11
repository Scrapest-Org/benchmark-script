import { redis } from "bun";
import { snowflakeTimestamp } from "../lib/latency-tracker";

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * (p / 100));
  return sorted[Math.min(idx, sorted.length - 1)];
}

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/latency" || url.pathname === "/api/latency/") {
      const vmName = url.searchParams.get("vm") || "default";
      const key = `latence:${vmName}`;
      const raw = await redis.hgetall(key);

      if (!raw || typeof raw !== "object" || !Object.keys(raw as object).length) {
        return Response.json({ vmName, tweetCount: 0, sources: {} });
      }

      const tweets = raw as Record<string, string>;
      const perSource: Record<string, number[]> = {};

      for (const [field, receivedAtStr] of Object.entries(tweets)) {
        const colonIdx = field.indexOf(":");
        if (colonIdx === -1) continue;
        const tweetId = field.slice(0, colonIdx);
        const source = field.slice(colonIdx + 1);
        const receivedAt = Number(receivedAtStr);
        const sft = snowflakeTimestamp(tweetId);
        const latency = receivedAt - sft;

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
        tweetCount: Object.keys(tweets).length,
        sources,
      });
    }

    if (url.pathname === "/api/tweets" || url.pathname === "/api/tweets/") {
      const vmName = url.searchParams.get("vm") || "default";
      const sourceFilter = url.searchParams.get("source") || "";
      const key = `latence:${vmName}`;
      const raw = await redis.hgetall(key);

      if (!raw || typeof raw !== "object" || !Object.keys(raw as object).length) {
        return Response.json({ vmName, entries: [] });
      }

      const tweets = raw as Record<string, string>;
      const entries: Array<{ tweetId: string; source: string; receivedAt: number; latency: number }> = [];

      for (const [field, receivedAtStr] of Object.entries(tweets)) {
        const colonIdx = field.indexOf(":");
        if (colonIdx === -1) continue;
        const tweetId = field.slice(0, colonIdx);
        const source = field.slice(colonIdx + 1);
        if (sourceFilter && source !== sourceFilter) continue;
        const receivedAt = Number(receivedAtStr);
        const sft = snowflakeTimestamp(tweetId);
        entries.push({ tweetId, source, receivedAt, latency: Math.abs(receivedAt - sft) });
      }

      return Response.json({ vmName, entries });
    }

    return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
});

console.log("Dashboard: http://localhost:3000");

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Latency Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, -apple-system, sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; }
h1 { font-size: 1.5rem; margin-bottom: 16px; color: #f0f6fc; }
.controls { display: flex; gap: 8px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
.controls label { font-size: 0.85rem; color: #8b949e; }
.controls input { background: #161b22; border: 1px solid #30363d; color: #c9d1d9; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; width: 160px; }
.controls input:focus { border-color: #58a6ff; outline: none; }
.controls button { background: #238636; border: none; color: #fff; padding: 6px 16px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; }
.controls button:hover { background: #2ea043; }
.controls .status { font-size: 0.8rem; color: #8b949e; }
.badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; margin-left: 6px; }
.badge.good { background: #1f6f31; color: #7ee787; }
.badge.ok { background: #7a5a00; color: #d29922; }
.badge.slow { background: #7d0f0f; color: #ff7b72; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 4px; }
th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #21262d; color: #8b949e; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
td { padding: 7px 10px; border-bottom: 1px solid #21262d; }
tr:hover td { background: #161b22; }
.num { font-variant-numeric: tabular-nums; text-align: right; }
.section-title { font-size: 0.9rem; font-weight: 600; margin: 24px 0 4px 0; color: #f0f6fc; }
.summary-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin: 12px 0; }
.card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px; }
.card .source-name { font-weight: 600; font-size: 0.9rem; margin-bottom: 8px; color: #f0f6fc; word-break: break-all; }
.card .stat-row { display: flex; justify-content: space-between; font-size: 0.8rem; padding: 2px 0; }
.card .stat-row .label { color: #8b949e; }
.card .stat-row .value { font-variant-numeric: tabular-nums; }
.error { color: #ff7b72; background: #7d0f0f33; border: 1px solid #7d0f0f; border-radius: 6px; padding: 10px 14px; font-size: 0.85rem; margin: 8px 0; }
.loading { color: #8b949e; font-size: 0.85rem; margin: 8px 0; }
.empty { color: #8b949e; font-size: 0.85rem; margin: 8px 0; font-style: italic; }
.tweet-table-wrap { max-height: 400px; overflow-y: auto; border: 1px solid #30363d; border-radius: 8px; margin-top: 8px; }
.tweet-table-wrap table { margin-top: 0; }
.tweet-table-wrap th { position: sticky; top: 0; background: #0d1117; }
.bar-cell { display: flex; align-items: center; gap: 6px; }
.bar { height: 6px; border-radius: 3px; min-width: 4px; transition: width 0.3s; }
select { background: #161b22; border: 1px solid #30363d; color: #c9d1d9; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>⚡ Latency Dashboard</h1>
<div class="controls">
  <label>VM Name</label>
  <input id="vmInput" value="default" placeholder="VM name" />
  <button id="fetchBtn" onclick="load()">Refresh</button>
  <label style="margin-left:12px">Auto</label>
  <select id="intervalSelect" onchange="setInterval()">
    <option value="0">Off</option>
    <option value="5000">5s</option>
    <option value="10000" selected>10s</option>
    <option value="30000">30s</option>
    <option value="60000">60s</option>
  </select>
  <span class="status" id="status"></span>
</div>
<div id="content"></div>

<script>
let autoTimer = null;

function setInterval() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  const ms = parseInt(document.getElementById("intervalSelect").value);
  if (ms > 0) autoTimer = setInterval(load, ms);
}

async function load() {
  const vm = document.getElementById("vmInput").value.trim() || "default";
  const status = document.getElementById("status");
  const content = document.getElementById("content");
  status.textContent = "Loading...";

  try {
    const [summaryRes, tweetsRes] = await Promise.all([
      fetch("/api/latency?vm=" + encodeURIComponent(vm)),
      fetch("/api/tweets?vm=" + encodeURIComponent(vm)),
    ]);
    if (!summaryRes.ok || !tweetsRes.ok) throw new Error("API error");
    const summary = await summaryRes.json();
    const tweets = await tweetsRes.json();
    render(summary, tweets);
    status.textContent = "Updated " + new Date().toLocaleTimeString();
  } catch (e) {
    content.innerHTML = '<div class="error">Failed to load: ' + e.message + '</div>';
    status.textContent = "Error";
  }
}

function render(summary, tweets) {
  const vm = document.getElementById("vmInput").value.trim() || "default";
  const sources = summary.sources || {};
  const entries = tweets.entries || [];
  const sourceNames = Object.keys(sources);
  let html = "";

  if (sourceNames.length === 0) {
    html += '<div class="empty">No data for "' + vm + '". Run the benchmark with REDIS_URL set and VM_NAME=' + vm + '.</div>';
    document.getElementById("content").innerHTML = html;
    return;
  }

  // Summary cards
  html += '<div class="section-title">Summary (' + summary.tweetCount + ' data points)</div>';
  html += '<div class="summary-cards">';
  for (const src of sourceNames) {
    const s = sources[src];
    const badge = s.avg < 300 ? "good" : s.avg < 800 ? "ok" : "slow";
    html += '<div class="card">';
    html += '<div class="source-name">' + esc(src) + ' <span class="badge ' + badge + '">' + s.avg + 'ms</span></div>';
    html += '<div class="stat-row"><span class="label">Count</span><span class="value">' + s.count + '</span></div>';
    html += '<div class="stat-row"><span class="label">Average</span><span class="value">' + s.avg + 'ms</span></div>';
    html += '<div class="stat-row"><span class="label">Min</span><span class="value">' + s.min + 'ms</span></div>';
    html += '<div class="stat-row"><span class="label">P50</span><span class="value">' + s.p50 + 'ms</span></div>';
    html += '<div class="stat-row"><span class="label">P95</span><span class="value">' + s.p95 + 'ms</span></div>';
    html += '<div class="stat-row"><span class="label">P99</span><span class="value">' + s.p99 + 'ms</span></div>';
    html += '<div class="stat-row"><span class="label">Max</span><span class="value">' + s.max + 'ms</span></div>';
    html += '</div>';
  }
  html += '</div>';

  // Comparison table
  html += '<div class="section-title">Per-Source Comparison</div>';
  html += '<table><thead><tr><th>Source</th><th class="num">Count</th><th class="num">Avg</th><th class="num">Min</th><th class="num">P50</th><th class="num">P95</th><th class="num">P99</th><th class="num">Max</th></tr></thead><tbody>';
  const sorted = [...sourceNames].sort((a, b) => sources[a].avg - sources[b].avg);
  const best = sources[sorted[0]]?.avg || 1;
  for (const src of sorted) {
    const s = sources[src];
    const ratio = s.avg / best;
    const hue = Math.round(120 - Math.min(ratio - 1, 2) * 60);
    const barW = Math.min(s.avg / best * 100, 100);
    html += '<tr>';
    html += '<td>' + esc(src) + '</td>';
    html += '<td class="num">' + s.count + '</td>';
    html += '<td class="num"><div class="bar-cell"><div class="bar" style="width:' + barW + 'px;background:hsl(' + hue + ',70%,45%)"></div>' + s.avg + 'ms</div></td>';
    html += '<td class="num">' + s.min + 'ms</td>';
    html += '<td class="num">' + s.p50 + 'ms</td>';
    html += '<td class="num">' + s.p95 + 'ms</td>';
    html += '<td class="num">' + s.p99 + 'ms</td>';
    html += '<td class="num">' + s.max + 'ms</td>';
    html += '</tr>';
  }
  html += '</tbody></table>';

  // Tweet detail table
  if (entries.length > 0) {
    html += '<div class="section-title">Recent Tweets (' + entries.length + ')</div>';
    html += '<div style="margin:6px 0"><select id="sourceFilter" onchange="load()">';
    const allSources = [...new Set(entries.map(e => e.source))];
    const currentFilter = new URLSearchParams(window.location.search).get("source");
    html += '<option value="">All sources</option>';
    for (const src of allSources) {
      const sel = currentFilter === src ? "selected" : "";
      html += '<option value="' + esc(src) + '" ' + sel + '>' + esc(src) + '</option>';
    }
    html += '</select></div>';

    const filtered = currentFilter ? entries.filter(e => e.source === currentFilter) : entries;
    const recent = filtered.slice(-100).reverse();
    html += '<div class="tweet-table-wrap"><table><thead><tr><th>Tweet ID</th><th>Source</th><th class="num">Latency</th></tr></thead><tbody>';
    for (const e of recent) {
      const badge = e.latency < 300 ? "good" : e.latency < 800 ? "ok" : "slow";
      html += '<tr>';
      html += '<td style="font-family:monospace;font-size:0.8rem">' + e.tweetId + '</td>';
      html += '<td>' + esc(e.source) + '</td>';
      html += '<td class="num"><span class="badge ' + badge + '">' + e.latency + 'ms</span></td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  }

  document.getElementById("content").innerHTML = html;

  // wire source filter change
  const filter = document.getElementById("sourceFilter");
  if (filter) filter.addEventListener("change", () => load());
}

function esc(s) { return String(s).replace(/[&<>"']/g, function(m) {
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m];
}) }

load();
</script>
</body>
</html>`;
