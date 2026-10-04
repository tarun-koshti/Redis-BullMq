import 'dotenv/config';

// Longest wait (ms) between Redis reconnect attempts. The client never gives up,
// so the app recovers by itself when Redis comes back after an outage.
const redisMaxRetryDelayMs = Number(process.env.REDIS_RETRY_DELAY_MS ?? 2000);

// Env only carries connection configuration. Queue tuning (delay, attempts,
// names) lives in src/constants/appConstants.ts.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/bullmq_demo',
  // How long startup waits for Redis before giving up and exiting.
  redisStartupTimeoutMs: Number(process.env.REDIS_STARTUP_TIMEOUT_MS ?? 20_000),
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    // Required by BullMQ for its blocking worker connection.
    maxRetriesPerRequest: null,
    // Keep reconnecting forever, waiting a little longer after each failed
    // attempt (200ms, 400ms, ...) up to REDIS_RETRY_DELAY_MS.
    retryStrategy: (times: number): number => Math.min(times * 200, redisMaxRetryDelayMs),
  },
};
