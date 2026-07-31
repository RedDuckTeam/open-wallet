import { browser } from "wxt/browser";

const ALARM = "openwallet.autolock";
const MINUTES = 15;

export interface AutoLock {
  // (Re)start the inactivity countdown. Called on unlock and each activity.
  arm(): void;
  disarm(): void;
}

// Uses chrome.alarms, not setTimeout, so it survives the MV3 worker being evicted.
export function createAutoLock(onFire: () => void): AutoLock {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) onFire();
  });
  return {
    arm() {
      void browser.alarms.create(ALARM, { delayInMinutes: MINUTES });
    },
    disarm() {
      void browser.alarms.clear(ALARM);
    },
  };
}
