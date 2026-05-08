export type RetryDecision =
  | { kind: 'fatal' }
  | { kind: 'retryable'; waitMs: number };

export interface RetryPolicy {
  maxRetries: number;
  classify: (err: unknown, attempt: number) => RetryDecision;
  onRetry?: (info: { err: unknown; attempt: number; waitMs: number }) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, policy: RetryPolicy): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const decision = policy.classify(err, attempt);
      if (decision.kind === 'fatal' || attempt > policy.maxRetries) throw err;
      policy.onRetry?.({ err, attempt, waitMs: decision.waitMs });
      await sleep(decision.waitMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
