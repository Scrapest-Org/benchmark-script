# benchmark-script

Tweet-arrival latency benchmark. Measures, for a single test account, how quickly each of our regional push-listener VMs surfaces a new tweet compared to a reference feed (`bark`).

For every tweet posted by the test account, the benchmark records the wall-clock time at which it was received from each source, compares those against the tweet's snowflake-derived "true" publish time, and emits a Markdown report into `results/`.

## What it measures

For each tweet, an arrival timestamp is recorded from up to 11 sources:

- `us-east1:mozilla`, `us-east1:fcm`
- `us-east4:mozilla`, `us-east4:fcm`
- `us-west1:mozilla`, `us-west1:fcm`
- `eu-west2:mozilla`, `eu-west2:fcm`
- `eu-central2:mozilla`, `eu-central2:fcm`
- `bark` (reference feed)

The five regional VMs each expose two transport channels (Mozilla web push and Firebase Cloud Messaging), so the cross-product gives 10 VM source labels. `bark` is a separate WebSocket feed used as the upstream baseline.

**Latency** is reported as `receivedAt − snowflakeTimestamp(tweetId)` in milliseconds. The snowflake epoch offset used is `1288834974657` (Twitter's snowflake epoch); see `latency-tracker.ts`.

## Project layout

| File | Purpose |
|---|---|
| `benchmark.ts` | Entry point. Opens a WebSocket to each VM and to `bark`, records arrivals, writes a report on `SIGINT`/`SIGTERM`. |
| `setup.ts` | One-shot: POSTs `{ sid: TEST_ACCOUNT }` to `<vm>/track` on every VM so they start watching the test account. Run this before `benchmark.ts`. |
| `bark-latency.ts` | Bark-only probe. Computes `min` / `p50` / `p95` / `p99` / `max` / `avg` latency for the reference feed. |
| `latency-tracker.ts` | Snowflake-ID timestamp decoder plus a per-source latency summary helper. |
| `results-manager.ts` | In-memory store keyed by tweet ID. Marks a tweet complete once all 11 sources report or after a 30s timeout, then fires an `onComplete` callback. |
| `report.ts` | Generates the Markdown table written to `results/report-<unix-ms>.md`. |
| `env.ts` | Loads `benchmark.env`, validates required keys. |
| `sft.ts` | Small CLI helper: converts an `HH:MM:SS.mmm` log timestamp to Unix ms for offline diffing. |
| `results/` | Generated reports (gitignored). |
| `benchmark.env` | Local credentials and VM URLs (gitignored). See `benchmark.env.example`. |

## Setup

Requires [Bun](https://bun.sh) (project uses `@types/bun` and `Bun.file`/`Bun.write`).

```bash
bun install
cp benchmark.env.example benchmark.env
# edit benchmark.env — fill in the five VM URLs, bark URL/key, your API key, and the test account handle
```

`benchmark.env` keys:

| Key | What it is |
|---|---|
| `VM_US_EAST1` | HTTP URL of the us-east1 listener VM, e.g. `http://1.2.3.4:6969`. |
| `VM_US_EAST4` | HTTP URL of the us-east4 ("closest-to-mozilla") listener VM. |
| `VM_US_WEST1` | HTTP URL of the us-west1 listener VM. |
| `VM_EU_WEST2` | HTTP URL of the eu-west2 (London) listener VM. |
| `VM_EU_CENT2` | HTTP URL of the eu-central2 (Warsaw) listener VM. |
| `BARK_WS_URL` | `wss://…` endpoint for the bark reference feed. |
| `BARK_API_KEY` | Bark login token (sent as `login <key>` on the first WS message). |
| `MY_API_KEY` | API key for our own VMs (sent as `x-api-key` header). |
| `TEST_ACCOUNT` | The Twitter handle being tracked (e.g. `steffqing`). Used by `setup.ts` and to filter the bark feed. |

`benchmark.env.example` is committed; the live `benchmark.env` is gitignored.

## How to run

```bash
# 1. Tell every VM to start tracking the test account.
bun run setup.ts

# 2. Start the benchmark. Leave it running while the test account posts.
bun run benchmark.ts

# 3. When you've collected enough samples, Ctrl+C. The script flushes
#    a Markdown report into results/report-<unix-ms>.md before exiting.
```

### Bark-only probe

```bash
bun run bark-latency.ts
# Ctrl+C prints a percentile summary (min / p50 / p95 / p99 / max / avg).
```

### Log-time helper

```bash
bun run sft.ts 14:32:07.412
# → prints the Unix ms timestamp for today at 14:32:07.412 local time.
```

## How a report is structured

Each row is one tweet. Each column is one source. Cells contain the absolute Unix-ms arrival time. The final row, `Avg latency`, is `arrivalTime − snowflakeTimestamp(tweetId)` averaged across rows — so a smaller number means the source delivered the tweet sooner after it was published.

Example (excerpt from the most recent report):

```
| Tweet ID | us-east1:mozilla | us-east1:fcm | … | bark |
| 2053499283098235306 | 1778427356186 | 1778427356208 | … | 1778427356116 |
| **Avg latency** | 322ms | 336ms | … | 276ms |
```

A negative average latency means our local clock is ahead of the snowflake-derived timestamp (clock skew between the consumer machine and Twitter's snowflake epoch), not that we received the tweet before it was posted. Run on an NTP-synced host.

## Implementation notes

- `ResultsManager` tracks 11 expected sources and considers a tweet "complete" when all 11 have reported. Anything still missing after 30s is finalized anyway so a single missing source doesn't hold up the report.
- The VM-side `vmName` field is remapped on the consumer (`benchmark.ts` -> `VM_NAME_TO_SOURCE`): the bookkeeping name (`x-atlanta`, `closest-to-mozilla`, …) is converted to its GCP region label.
- The bark feed is filtered to messages whose `tags.AUTHOR_HANDLE` matches `TEST_ACCOUNT` (case-insensitive). Other tweets on the feed are ignored.
- The consumer subscribes to each VM with `?useFastX=true&ignoreFullPayload=true` to skip serialization of unused fields.

## Gotchas

- The benchmark writes a report **only on graceful shutdown** (`SIGINT`/`SIGTERM`). Killing with `SIGKILL` loses the run.
- The test account must actually be tweeting for there to be anything to measure.
- `setup.ts` must run after any VM restart so the VMs re-register the tracked handle.
