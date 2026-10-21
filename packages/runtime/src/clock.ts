import type { Clock } from "./types.js";

/** A scheduled callback held by `ManualClock` until its due time is reached. */
interface ManualTimer {
  callback: () => void | Promise<void>;
  dueAt: number;
  id: number;
}

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
  /** Pending timers in scheduling order; a linear scan beats hashing at test-sized timer counts. */
  private readonly timers: ManualTimer[] = [];

  constructor(startAt = new Date()) {
    this.current = new Date(startAt);
  }

  now(): Date {
    return new Date(this.current);
  }

  schedule(delayMs: number, callback: () => void | Promise<void>): number {
    const id = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.push({ callback, dueAt: this.current.getTime() + Math.max(0, delayMs), id });
    return id;
  }

  cancel(handle: unknown): void {
    const index = this.timers.findIndex((timer) => timer.id === handle);
    if (index !== -1) {
      this.timers.splice(index, 1);
    }
  }

  async advanceBy(delayMs: number): Promise<void> {
    this.current = new Date(this.current.getTime() + Math.max(0, delayMs));

    for (let due = this.takeNextDue(); due; due = this.takeNextDue()) {
      // biome-ignore lint/performance/noAwaitInLoops: Timers must run in due-time order.
      await due.callback();
    }
  }

  /** Removes and returns the earliest-due timer; ties keep scheduling order. */
  private takeNextDue(): ManualTimer | undefined {
    const now = this.current.getTime();
    let nextIndex = -1;
    for (let index = 0; index < this.timers.length; index += 1) {
      const timer = this.timers[index];
      if (timer.dueAt <= now && (nextIndex === -1 || timer.dueAt < this.timers[nextIndex].dueAt)) {
        nextIndex = index;
      }
    }
    if (nextIndex === -1) {
      return undefined;
    }
    const [timer] = this.timers.splice(nextIndex, 1);
    return timer;
  }
}
