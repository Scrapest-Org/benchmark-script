import Redis from "ioredis";

const url = process.env.REDIS_URL || "redis://localhost:6379";
export const redis = new Redis(url);

redis.on("connect", () => console.log("[redis] Connected"));
redis.on("error", (err) => console.error("[redis] Error:", err.message));
