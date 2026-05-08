import mongoose from 'mongoose';
import type { Logger } from '../logger/logger.js';

export async function connectMongo(uri: string, logger: Logger): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('connected', () => logger.info('Mongo connected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'Mongo error'));
  mongoose.connection.on('disconnected', () => logger.warn('Mongo disconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose;
}
