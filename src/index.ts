import express from 'express';
import mongoose from 'mongoose';
import { config } from './config/config';
import { QUEUE_NAMES, QUEUE_CONFIG, SCHEDULER_NAMES } from './constants/appConstants';
import { orderRoutes } from './routes/orderRoutes';
import { reportRoutes } from './routes/reportRoutes';
import { errorHandler } from './middlewares/errorHandler';
import { verifyRedisConnection, upsertScheduler, getScheduler } from './services/queue';
import './services/worker'; // importing starts the worker in this process
import './services/reportWorker';

const app = express();
app.use(express.json());

app.use('/orders', orderRoutes);
app.use('/reports', reportRoutes);

// Global error handler — must be registered after the routes.
app.use(errorHandler);

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  await verifyRedisConnection(config.redisStartupTimeoutMs);
  console.log('Redis connected');

  // Safe on every start: upserting keeps one schedule, however many times (or
  // in however many instances) the app starts.
  await upsertScheduler(SCHEDULER_NAMES.ORDER_REPORTS);
  const scheduler = await getScheduler(SCHEDULER_NAMES.ORDER_REPORTS);
  console.log(
    `Order report scheduled: '${scheduler?.pattern}' (${scheduler?.tz}), next run ${
      scheduler?.next ? new Date(scheduler.next).toISOString() : 'unknown'
    }`,
  );

  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
    console.log(`Reminder delay: ${QUEUE_CONFIG[QUEUE_NAMES.ORDER_REMINDERS].delay}ms`);
  });
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
