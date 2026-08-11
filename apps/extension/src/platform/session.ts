import { browser } from "wxt/browser";

const KEY = "openwallet.session";

/**
 * Keeps the wallet unlocked across a Manifest V3 service-worker eviction.
 *
 * The problem this solves is structural, not cosmetic: the background worker
 * is killed whenever it goes idle, and the unlocked keyring lives only in its
 * memory. Without this, the user is thrown back to the password screen every
 * time the browser decides to reclaim the worker — often within a minute of
 * inactivity — which trains people to type their password constantly, the
 * exact habit a wallet should not be building.
 *
 * The tradeoff is real and worth stating plainly. `chrome.storage.session` is
 * memory-only: it is never written to disk and is cleared when the browser
 * closes. But while the browser is open, the material here is enough to
 * unlock the vault, so this trades "locked whenever the worker dies" for
 * "unlocked until auto-lock fires or the browser closes". That is the same
 * bargain MetaMask makes, and it is why auto-lock (`auto-lock.ts`, backed by
 * `chrome.alarms` so it survives eviction too) clears this on every fire.
 *
 * Access is restricted to trusted extension contexts, so a content script on
 * a page cannot read it.
 */
export class SessionUnlock {
  async save(password: string): Promise<void> {
    await this.#restrictAccess();
    await browser.storage.session.set({ [KEY]: password });
  }

  async load(): Promise<string | null> {
    const result = await browser.storage.session.get(KEY);
    const value = result[KEY] as string | undefined;
    return value ?? null;
  }

  async clear(): Promise<void> {
    await browser.storage.session.remove(KEY);
  }

  /**
   * `TRUSTED_CONTEXTS` is already the default, but it is set explicitly
   * because the whole safety argument rests on it — a future change that
   * opened session storage to content scripts would silently expose this.
   * Wrapped because not every browser build implements the call.
   */
  async #restrictAccess(): Promise<void> {
    try {
      await browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    } catch {
      // Older/alternative engines default to trusted-only anyway.
    }
  }
}
