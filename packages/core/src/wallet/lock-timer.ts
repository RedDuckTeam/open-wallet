const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Fires `onTimeout` after `timeoutMs` of inactivity; every call to
 * `activity()` pushes the deadline back out. `Wallet` uses this to actually
 * lock on a schedule — declaring a timeout constant and never wiring it to
 * anything (a real bug found in the wild during the earlier audit of
 * concord-wallet) defeats the point of having one.
 *
 * This is a plain `setTimeout` timer — correct for Node and React Native,
 * but NOT sufficient on its own for a Manifest V3 browser extension: the
 * background service worker can be killed by the browser independently of
 * any timer running inside it. An MV3 platform layer additionally needs
 * `chrome.alarms` (which survives worker restarts) to guarantee the lock
 * fires; this class is the piece every platform shares, not the whole story
 * for extensions.
 */
export class LockTimer {
  #handle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onTimeout: () => void,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  start(): void {
    this.activity();
  }

  activity(): void {
    this.stop();
    this.#handle = setTimeout(() => {
      this.#handle = null;
      this.onTimeout();
    }, this.timeoutMs);
  }

  stop(): void {
    if (this.#handle !== null) {
      clearTimeout(this.#handle);
      this.#handle = null;
    }
  }

  get isRunning(): boolean {
    return this.#handle !== null;
  }
}
