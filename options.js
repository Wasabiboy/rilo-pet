const SIZE_KEY = "riloPetSize";
const POS_KEY = "riloPetPosition";
const NOTIFY_KEY = "riloNotifyOS";
const CHIME_KEY = "riloPetChime";
const MODE_KEY = "riloDetectionMode";

const $ = (id) => document.getElementById(id);

async function load() {
  const data = await chrome.storage.local.get([SIZE_KEY, NOTIFY_KEY, CHIME_KEY, MODE_KEY]);
  const s = parseInt(data[SIZE_KEY], 10);
  if (!Number.isNaN(s)) {
    $("size").value = String(s);
    $("sizeValue").textContent = String(s);
  }
  $("notifyOS").checked = data[NOTIFY_KEY] !== false;
  $("chime").checked = !!data[CHIME_KEY];
  $("detectionMode").value = data[MODE_KEY] || "auto";
}

$("detectionMode").addEventListener("change", () => {
  chrome.storage.local.set({ [MODE_KEY]: $("detectionMode").value });
});

$("size").addEventListener("input", () => {
  $("sizeValue").textContent = $("size").value;
  chrome.storage.local.set({ [SIZE_KEY]: parseInt($("size").value, 10) });
});

$("notifyOS").addEventListener("change", () => {
  chrome.storage.local.set({ [NOTIFY_KEY]: $("notifyOS").checked });
});

$("chime").addEventListener("change", () => {
  chrome.storage.local.set({ [CHIME_KEY]: $("chime").checked });
});

$("resetPos").addEventListener("click", () => {
  chrome.storage.local.remove(POS_KEY);
  $("resetPos").textContent = "Position reset ✓";
  setTimeout(() => ($("resetPos").textContent = "Reset position"), 1400);
});

$("testNotify").addEventListener("click", () => {
  chrome.notifications.create("rilo-task-complete-test", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Rilo is ready",
    message: "This is a test — real notifications fire when a Rilo task finishes."
  });
});

load();
