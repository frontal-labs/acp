/** A promise whose resolution can be controlled by a test. */
export interface TestDeferred<TValue> {
  promise: Promise<TValue>;
  reject: (reason?: unknown) => void;
  resolve: (value: TValue | PromiseLike<TValue>) => void;
}

/** Creates a deferred promise for coordinating asynchronous test steps. */
export function createDeferred<TValue>(): TestDeferred<TValue> {
  let resolve!: (value: TValue | PromiseLike<TValue>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

/** Waits for a predicate to become true, polling at a deterministic interval. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const intervalMs = options.intervalMs ?? 10;
  const timeoutMs = options.timeoutMs ?? 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    // biome-ignore lint/performance/noAwaitInLoops: Polling must observe each predicate result in order.
    if (await predicate()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Test condition did not become true within ${timeoutMs}ms`);
}
