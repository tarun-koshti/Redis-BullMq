import express from 'express';
import mongoose from 'mongoose';
import { config } from './config/config';
import { QUEUE_NAMES, QUEUE_CONFIG } from './constants/appConstants';
import { orderRoutes } from './routes/orderRoutes';
import { errorHandler } from './middlewares/errorHandler';
import { verifyRedisConnection } from './services/queue';
import './services/worker'; // importing starts the worker in this process

const app = express();
app.use(express.json());

app.use('/orders', orderRoutes);

// Global error handler — must be registered after the routes.
app.use(errorHandler);

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  await verifyRedisConnection(config.redisStartupTimeoutMs);
  console.log('Redis connected');

  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
    console.log(`Reminder delay: ${QUEUE_CONFIG[QUEUE_NAMES.ORDER_REMINDERS].delay}ms`);
  });
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
