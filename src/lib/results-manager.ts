export const SOURCES = [
  "us-east1:mozilla",
  "us-east1:fcm",
  "us-east4:mozilla",
  "us-east4:fcm",
  "us-west1:mozilla",
  "us-west1:fcm",
  "eu-west2:mozilla",
  "eu-west2:fcm",
  "eu-central2:mozilla",
  "eu-central2:fcm",
  "bark",
];

export interface ResultEntry {
  source: string;
  tweetId: string;
  receivedAt: number;
}

interface TweetState {
  sources: Map<string, number>;
  timeoutId?: ReturnType<typeof setTimeout>;
  completed: boolean;
}

export class ResultsManager {
  private tweets = new Map<string, TweetState>();
  private completed = new Map<string, Map<string, number>>();
  private onComplete: (tweetId: string, sources: Map<string, number>) => void;
  private timeoutMs: number;

  constructor(
    onComplete: (tweetId: string, sources: Map<string, number>) => void,
    timeoutMs = 30000,
  ) {
    this.onComplete = onComplete;
    this.timeoutMs = timeoutMs;
  }

  record(entry: ResultEntry) {
    const { tweetId, source, receivedAt } = entry;
    let state = this.tweets.get(tweetId);
    if (!state) {
      state = { sources: new Map(), completed: false };
      this.tweets.set(tweetId, state);
      state.timeoutId = setTimeout(() => {
        if (!state!.completed) this.finish(tweetId);
      }, this.timeoutMs);
    }
    if (!state.sources.has(source)) {
      state.sources.set(source, receivedAt);
    }
    if (state.sources.size === SOURCES.length && !state.completed) {
      this.finish(tweetId);
    }
  }

  private finish(tweetId: string) {
    const state = this.tweets.get(tweetId)!;
    if (state.completed) return;
    state.completed = true;
    if (state.timeoutId) clearTimeout(state.timeoutId);
    this.completed.set(tweetId, state.sources);
    this.onComplete(tweetId, state.sources);
  }

  getCompleted(): Map<string, Map<string, number>> {
    return this.completed;
  }

  getAll(): Map<string, Map<string, number>> {
    const all = new Map(this.completed);
    for (const [tweetId, state] of this.tweets) {
      if (!state.completed) {
        all.set(tweetId, state.sources);
      }
    }
    return all;
  }

  getPendingCount(): number {
    let count = 0;
    for (const [, state] of this.tweets) {
      if (!state.completed) count++;
    }
    return count;
  }
}
