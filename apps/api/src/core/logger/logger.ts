import pino from 'pino';
import type { Env } from '../../config/env.js';

export type Logger = pino.Logger;

export function createLogger(env: Env): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: 'api' },
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
    },
  });
}
