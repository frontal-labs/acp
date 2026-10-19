import type { Clock } from "./types.js";

/** Uses the host process clock and timers. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  schedule(delayMs: number, callback: () => void | Promise<void>): NodeJS.Timeout {
    return setTimeout(
      async () => {
        await callback();
      },
      Math.max(0, delayMs),
    );
  }

  cancel(handle: unknown): void {
    clearTimeout(handle as NodeJS.Timeout);
  }
}

/** Deterministic clock for tests and simulated workflows. */
export class ManualClock implements Clock {
  private current: Date;
  private nextTimerId = 1;
  private readonly timers = new Map<
    number,
    { dueAt: number; callback: () => void | Promise<void> }
  >();

  constructor(startAt = new Date()) {
    this.current = new Date(startAt);
  }

  now(): Date {
    return new Date(this.current);
  }

  schedule(delayMs: number, callback: () => void | Promise<void>): number {
    const id = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.set(id, { callback, dueAt: this.current.getTime() + Math.max(0, delayMs) });
    return id;
  }

  cancel(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  async advanceBy(delayMs: number): Promise<void> {
    this.current = new Date(this.current.getTime() + Math.max(0, delayMs));

    while (this.timers.size > 0) {
      const due = [...this.timers.entries()]
        .filter(([, candidate]) => candidate.dueAt <= this.current.getTime())
        .sort(([, left], [, right]) => left.dueAt - right.dueAt)
        .at(0);
      if (!due) {
        return;
      }

      const [id, timer] = due;
      this.timers.delete(id);
      // biome-ignore lint/performance/noAwaitInLoops: Timers must run in due-time order.
      await timer.callback();
    }
  }
}
