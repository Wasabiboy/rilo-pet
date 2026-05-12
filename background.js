// background.js — service worker.
// Handles open/focus tab behavior + task-complete events from rilo.studio.

const RILO_URL = "https://rilo.studio/";
const RILO_MATCH = "*://rilo.studio/*";
const RILO_WWW_MATCH = "*://*.rilo.studio/*";
const NOTIF_ID = "rilo-task-complete";

async function findRiloTab() {
  const tabs = await chrome.tabs.query({ url: [RILO_MATCH, RILO_WWW_MATCH] });
  return tabs && tabs.length ? tabs[0] : null;
}

async function openOrFocusRilo() {
  try {
    const existing = await findRiloTab();
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      if (typeof existing.windowId === "number") {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      return { action: "focused", tabId: existing.id };
    }
    const created = await chrome.tabs.create({ url: RILO_URL, active: true });
    return { action: "opened", tabId: created.id };
  } catch (err) {
    console.error("Rilo Pet: failed to open/focus tab", err);
    return { action: "error", error: String(err) };
  }
}

// Tell every pet-bearing tab to show its task-complete state.
function broadcastTaskComplete(payload) {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (!t.id) continue;
      chrome.tabs.sendMessage(
        t.id,
        { type: "RILO_PET_TASK_COMPLETE", payload },
        () => void chrome.runtime.lastError
      );
    }
  });
}

async function fireSystemNotification(payload) {
  try {
    const settings = await chrome.storage.local.get(["riloNotifyOS"]);
    if (settings.riloNotifyOS === false) return; // opted out
    chrome.notifications.create(NOTIF_ID, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "Rilo is ready",
      message: "Your task finished — click to jump back to rilo.studio.",
      priority: 2,
      requireInteraction: false
    });
  } catch (e) {
    // Some browsers (Firefox) ignore certain notification options;
    // try a minimal call if the first fails.
    try {
      chrome.notifications.create(NOTIF_ID, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: "Rilo is ready",
        message: "Your task finished — click to jump back to rilo.studio."
      });
    } catch {}
  }
}

chrome.notifications?.onClicked.addListener?.((id) => {
  if (id !== NOTIF_ID) return;
  chrome.notifications.clear(id);
  openOrFocusRilo();
});

// State broadcast (used by the floating pet to hide itself when rilo is focused).
function broadcastStateChange() {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (!t.id) continue;
      chrome.tabs.sendMessage(t.id, { type: "RILO_PET_STATE_CHANGED" }, () =>
        void chrome.runtime.lastError
      );
    }
  });
}

chrome.tabs.onActivated.addListener(broadcastStateChange);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === "complete" || info.url) broadcastStateChange();
});
chrome.windows.onFocusChanged.addListener(broadcastStateChange);

// Messages from content scripts.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "RILO_PET_CLICK") {
    openOrFocusRilo().then(sendResponse);
    return true;
  }
  if (msg?.type === "RILO_PET_QUERY_STATE") {
    (async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const onRilo = !!(activeTab && activeTab.url && /^https?:\/\/([^/]+\.)?rilo\.studio(\/|$)/.test(activeTab.url));
        sendResponse({ onRilo });
      } catch {
        sendResponse({ onRilo: false });
      }
    })();
    return true;
  }
  if (msg?.type === "RILO_TASK_COMPLETE") {
    // Don't notify if the rilo tab is currently focused — you can already see it.
    (async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const userOnRilo = !!(
        activeTab &&
        activeTab.url &&
        /^https?:\/\/([^/]+\.)?rilo\.studio(\/|$)/.test(activeTab.url)
      );
      // Show in-page bubble on all other tabs regardless.
      broadcastTaskComplete(msg);
      if (!userOnRilo) fireSystemNotification(msg);
    })();
    return false;
  }
});

chrome.action.onClicked.addListener(() => openOrFocusRilo());
