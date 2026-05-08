import type { Server } from 'http';
import { Server as IoServer, type Socket } from 'socket.io';
import type { Env } from '../../../config/env.js';
import type { Logger } from '../../../core/logger/logger.js';
import { SINGLETON_TENANT_ID } from '../../../core/tenant.js';
import {
  SocketEvents,
  type MfaFailedPayload,
  type MfaRequiredPayload,
  type ScrapeProgressPayload,
} from '@sred/shared';

export class ScraperGateway {
  private io!: IoServer;

  constructor(
    private readonly env: Env,
    private readonly logger: Logger,
  ) {}

  attach(httpServer: Server): void {
    this.io = new IoServer(httpServer, {
      cors: { origin: this.env.WEB_ORIGIN, credentials: true },
      path: '/socket.io',
    });

    this.io.on('connection', (socket: Socket) => {
      socket.data.userId = SINGLETON_TENANT_ID;
      void socket.join(this.roomFor(SINGLETON_TENANT_ID));
      this.logger.info('socket connected');
      socket.on('disconnect', () => this.logger.info('socket disconnected'));
    });
  }

  emitMfaRequired(userId: string, payload: MfaRequiredPayload): void {
    this.io.to(this.roomFor(userId)).emit(SocketEvents.MFA_REQUIRED, payload);
  }

  emitMfaSuccess(userId: string): void {
    this.io.to(this.roomFor(userId)).emit(SocketEvents.MFA_SUCCESS, {});
  }

  emitMfaFailed(userId: string, payload: MfaFailedPayload): void {
    this.io.to(this.roomFor(userId)).emit(SocketEvents.MFA_FAILED, payload);
  }

  emitScrapeProgress(userId: string, payload: ScrapeProgressPayload): void {
    this.io.to(this.roomFor(userId)).emit(SocketEvents.SCRAPE_PROGRESS, payload);
  }

  private roomFor(userId: string): string {
    return `user:${userId}`;
  }
}
