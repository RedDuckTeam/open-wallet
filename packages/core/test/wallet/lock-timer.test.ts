import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockTimer } from "../../src/wallet/lock-timer.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LockTimer", () => {
  it("fires onTimeout after the configured inactivity period", () => {
    const onTimeout = vi.fn();
    const timer = new LockTimer(onTimeout, 1000);
    timer.start();

    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("pushes the deadline back out on activity", () => {
    const onTimeout = vi.fn();
    const timer = new LockTimer(onTimeout, 1000);
    timer.start();

    vi.advanceTimersByTime(600);
    timer.activity();
    vi.advanceTimersByTime(600);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("never fires once stopped", () => {
    const onTimeout = vi.fn();
    const timer = new LockTimer(onTimeout, 1000);
    timer.start();
    timer.stop();

    vi.advanceTimersByTime(10_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(timer.isRunning).toBe(false);
  });
});
