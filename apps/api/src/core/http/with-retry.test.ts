import { describe, expect, it, vi, beforeEach } from 'vitest';
import { withRetry, type RetryPolicy } from './with-retry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns the value when the operation succeeds on first try', async () => {
    const policy: RetryPolicy = {
      maxRetries: 3,
      classify: () => ({ kind: 'retryable', waitMs: 10 }),
    };
    const fn = vi.fn().mockResolvedValue('hello');
    await expect(withRetry(fn, policy)).resolves.toBe('hello');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds on a later retry and reports the right number of attempts', async () => {
    const policy: RetryPolicy = {
      maxRetries: 3,
      classify: () => ({ kind: 'retryable', waitMs: 10 }),
    };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom 1'))
      .mockRejectedValueOnce(new Error('boom 2'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, policy);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxRetries+1 attempts and rethrows the final error', async () => {
    const policy: RetryPolicy = {
      maxRetries: 2,
      classify: () => ({ kind: 'retryable', waitMs: 10 }),
    };
    const finalErr = new Error('final boom');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom 1'))
      .mockRejectedValueOnce(new Error('boom 2'))
      .mockRejectedValueOnce(finalErr);

    const assertion = expect(withRetry(fn, policy)).rejects.toBe(finalErr);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('fatal classifier short-circuits and rethrows immediately', async () => {
    const policy: RetryPolicy = {
      maxRetries: 5,
      classify: (err) =>
        (err as Error).message === 'fatal' ? { kind: 'fatal' } : { kind: 'retryable', waitMs: 10 },
    };
    const fatalErr = new Error('fatal');
    const fn = vi.fn().mockRejectedValue(fatalErr);

    await expect(withRetry(fn, policy)).rejects.toBe(fatalErr);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires the onRetry hook with attempt + waitMs on each retryable failure', async () => {
    const onRetry = vi.fn();
    const policy: RetryPolicy = {
      maxRetries: 2,
      classify: (_err, attempt) => ({ kind: 'retryable', waitMs: attempt * 100 }),
      onRetry,
    };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('done');

    const promise = withRetry(fn, policy);
    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ attempt: 1, waitMs: 100 });
    expect(onRetry.mock.calls[1]![0]).toMatchObject({ attempt: 2, waitMs: 200 });
  });
});
