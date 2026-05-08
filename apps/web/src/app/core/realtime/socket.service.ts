import { DestroyRef, Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { Subject } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import {
  SocketEvents,
  type MfaFailedPayload,
  type MfaRequiredPayload,
  type ScrapeProgressPayload,
} from '@sred/shared';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;
  private readonly mfaRequired$ = new Subject<MfaRequiredPayload>();
  private readonly mfaSuccess$ = new Subject<void>();
  private readonly mfaFailed$ = new Subject<MfaFailedPayload>();
  private readonly scrapeProgress$ = new Subject<ScrapeProgressPayload>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  connect(): void {
    if (this.socket) return;
    this.socket = io({ withCredentials: true, path: '/socket.io', autoConnect: true });
    this.socket.on(SocketEvents.MFA_REQUIRED, (p: MfaRequiredPayload) => this.mfaRequired$.next(p));
    this.socket.on(SocketEvents.MFA_SUCCESS, () => this.mfaSuccess$.next());
    this.socket.on(SocketEvents.MFA_FAILED, (p: MfaFailedPayload) => this.mfaFailed$.next(p));
    this.socket.on(SocketEvents.SCRAPE_PROGRESS, (p: ScrapeProgressPayload) =>
      this.scrapeProgress$.next(p),
    );
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  mfaRequired(): Observable<MfaRequiredPayload> {
    return this.mfaRequired$.asObservable();
  }
  mfaSuccess(): Observable<void> {
    return this.mfaSuccess$.asObservable();
  }
  mfaFailed(): Observable<MfaFailedPayload> {
    return this.mfaFailed$.asObservable();
  }
  scrapeProgress(): Observable<ScrapeProgressPayload> {
    return this.scrapeProgress$.asObservable();
  }
}
