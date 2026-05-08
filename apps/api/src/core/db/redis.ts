import { Redis } from 'ioredis';
import type { Logger } from '../logger/logger.js';

export function createRedis(url: string, logger: Logger): Redis {
  const r = new Redis(url, { maxRetriesPerRequest: null });
  r.on('connect', () => logger.info('Redis connected'));
  r.on('error', (err) => logger.error({ err }, 'Redis error'));
  r.on('end', () => logger.warn('Redis connection closed'));
  return r;
}
