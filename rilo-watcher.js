// rilo-watcher.js — runs only on rilo.studio.
//
// Operates in three modes (user-selectable in extension options):
//
//   "auto"   — Listen for postMessage events from Rilo's companion bridge.
//              If we hear "rilo:bridge-ready" within 2s of page load, we
//              suppress DOM watching. Otherwise we fall back to DOM watching.
//   "bridge" — Only listen for bridge events. Never DOM-watch.
//   "dom"    — Only DOM-watch. Ignore any bridge events that arrive.
//   "off"    — Detection disabled entirely.
//
// Detection signals (DOM mode):
//   1. Send button transitions to ready (violet/purple gradient + not disabled).
//   2. A decision card with a primary violet action button is added.
//   3. Document title changes to a "ready"-looking value.

(() => {
  if (window.__riloWatcherInjected) return;
  window.__riloWatcherInjected = true;
  if (window.top !== window.self) return;

  // ---- Tunables ---------------------------------------------------------
  const READY_GRADIENT_MARKERS = ["from-violet-500", "to-purple-600"];
  const PRIMARY_BTN_MARKERS = ["bg-violet-500", "hover:bg-violet-600"];
  const SEND_BUTTON_SELECTORS = [
    'button[aria-label="Send message"]',
    'button[aria-label*="Send" i]'
  ];
  const ACTION_BUTTON_LABELS = [
    "start designing", "continue", "confirm", "approve", "deploy",
    "next step", "let's go", "lets go", "build it", "looks good",
    "yes", "submit"
  ];
  const DEBOUNCE_MS = 3000;
  const BRIDGE_HANDSHAKE_WAIT_MS = 2000; // how long to wait for bridge-ready
  const MODE_KEY = "riloDetectionMode";  // "auto" | "bridge" | "dom" | "off"
  // -----------------------------------------------------------------------

  let mode = "auto";
  let bridgeDetected = false;
  let domWatchersActive = false;
  let lastFireAt = 0;

  // ---- Bridge listener (postMessage from rilo-companion-bridge.js) ------
  function startBridgeListener() {
    window.addEventListener("message", (event) => {
      // Same-origin only. Ignore cross-origin frames.
      if (event.source !== window) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.source !== "rilo-app") return;

      switch (data.type) {
        case "rilo:bridge-ready":
          bridgeDetected = true;
          if (mode === "auto" && domWatchersActive) {
            // Bridge showed up later than handshake window — disable DOM watching.
            stopDomWatchers();
          }
          break;
        case "rilo:task-complete":
        case "rilo:awaiting-input":
          if (mode === "dom" || mode === "off") return;
          fireTaskComplete("bridge:" + data.type, data.payload || {});
          break;
        // rilo:task-started and rilo:error are not used by this extension
        // but listening for them keeps room for future features.
      }
    });
  }

  // ---- DOM watching (fallback) ------------------------------------------
  let sawSendNotReadyOnce = false;
  let lastSendReady = null;
  let currentSendBtn = null;
  let sendObserver = null;
  const seenActionButtons = new WeakSet();
  let bootstrapDone = false;
  let bootstrapTimer = null;
  let treeObserver = null;
  let routeCheckInterval = null;
  let lastHref = location.href;

  function isSendReady(btn) {
    if (!btn) return false;
    if (btn.disabled) return false;
    if (btn.getAttribute("aria-disabled") === "true") return false;
    const cls = btn.className;
    if (typeof cls !== "string") return false;
    return READY_GRADIENT_MARKERS.every((m) => cls.includes(m));
  }

  function findSendButton() {
    for (const sel of SEND_BUTTON_SELECTORS) {
      const b = document.querySelector(sel);
      if (b) return b;
    }
    return null;
  }

  function attachSendObserver() {
    const btn = findSendButton();
    if (!btn || btn === currentSendBtn) return;
    if (sendObserver) sendObserver.disconnect();
    currentSendBtn = btn;
    lastSendReady = isSendReady(btn);
    if (!lastSendReady) sawSendNotReadyOnce = true;
    sendObserver = new MutationObserver(() => evaluateSend(btn));
    sendObserver.observe(btn, {
      attributes: true,
      attributeFilter: ["class", "disabled", "aria-disabled"]
    });
  }

  function evaluateSend(btn) {
    const ready = isSendReady(btn);
    if (ready === lastSendReady) return;
    const wasReady = lastSendReady;
    lastSendReady = ready;
    if (!ready) { sawSendNotReadyOnce = true; return; }
    if (wasReady) return;
    if (!sawSendNotReadyOnce) return;
    fireTaskComplete("dom:send-ready");
  }

  function isPrimaryActionButton(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.tagName !== "BUTTON") return false;
    const cls = el.className;
    if (typeof cls !== "string") return false;
    if (!PRIMARY_BTN_MARKERS.every((m) => cls.includes(m))) return false;
    if (el.getAttribute("aria-label") && /send/i.test(el.getAttribute("aria-label"))) return false;
    const text = (el.textContent || "").trim().toLowerCase();
    if (!text) return false;
    if (ACTION_BUTTON_LABELS.some((l) => text.includes(l))) return true;
    if (el.offsetWidth >= 200) return true;
    return false;
  }

  function scanForActionButtons(root) {
    if (!root || !root.querySelectorAll) return;
    const candidates = root.querySelectorAll("button");
    for (const btn of candidates) {
      if (seenActionButtons.has(btn)) continue;
      if (!isPrimaryActionButton(btn)) continue;
      seenActionButtons.add(btn);
      if (!bootstrapDone) continue;
      fireTaskComplete("dom:action-button:" + (btn.textContent || "").trim().slice(0, 40));
    }
  }

  let lastTitle = document.title;
  let titleObserver = null;
  function watchTitle() {
    const titleEl = document.querySelector("head > title");
    if (!titleEl) return;
    titleObserver = new MutationObserver(() => {
      if (document.title === lastTitle) return;
      const prev = lastTitle;
      lastTitle = document.title;
      const t = document.title.toLowerCase();
      if (/(✓|done|ready|complete|finished)/.test(t) &&
          !/(✓|done|ready|complete|finished)/.test(prev.toLowerCase())) {
        fireTaskComplete("dom:title:" + document.title.slice(0, 40));
      }
    });
    titleObserver.observe(titleEl, { childList: true });
  }

  function startDomWatchers() {
    if (domWatchersActive) return;
    domWatchersActive = true;
    bootstrapDone = false;
    bootstrapTimer = setTimeout(() => { bootstrapDone = true; }, 1500);

    treeObserver = new MutationObserver((mutations) => {
      attachSendObserver();
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          scanForActionButtons(node);
        }
      }
    });
    treeObserver.observe(document.documentElement, { childList: true, subtree: true });
    attachSendObserver();
    scanForActionButtons(document.body);
    watchTitle();
    routeCheckInterval = setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        attachSendObserver();
      }
    }, 1000);
  }

  function stopDomWatchers() {
    if (!domWatchersActive) return;
    domWatchersActive = false;
    try { treeObserver && treeObserver.disconnect(); } catch {}
    try { sendObserver && sendObserver.disconnect(); } catch {}
    try { titleObserver && titleObserver.disconnect(); } catch {}
    clearTimeout(bootstrapTimer);
    clearInterval(routeCheckInterval);
  }

  // ---- Fire path --------------------------------------------------------
  function fireTaskComplete(reason, payload) {
    const now = Date.now();
    if (now - lastFireAt < DEBOUNCE_MS) return;
    lastFireAt = now;
    try {
      if (!chrome?.runtime?.id) return;
      chrome.runtime.sendMessage(
        {
          type: "RILO_TASK_COMPLETE",
          reason,
          payload: payload || {},
          url: location.href,
          title: document.title,
          at: now
        },
        () => void chrome.runtime.lastError
      );
    } catch {
      stopDomWatchers();
    }
  }

  // ---- Mode application -------------------------------------------------
  function applyMode(newMode) {
    mode = newMode || "auto";
    if (mode === "off") {
      stopDomWatchers();
      return;
    }
    if (mode === "bridge") {
      stopDomWatchers();
      return;
    }
    if (mode === "dom") {
      startDomWatchers();
      return;
    }
    // auto: start DOM watchers immediately; if bridge announces itself
    // within the handshake window, the bridge listener will stop them.
    startDomWatchers();
    setTimeout(() => {
      if (bridgeDetected && domWatchersActive) stopDomWatchers();
    }, BRIDGE_HANDSHAKE_WAIT_MS);
  }

  // ---- Boot -------------------------------------------------------------
  startBridgeListener();

  // Read the mode from storage, then react to live changes.
  try {
    chrome.storage.local.get([MODE_KEY], (data) => {
      void chrome.runtime.lastError;
      applyMode(data && data[MODE_KEY] ? data[MODE_KEY] : "auto");
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[MODE_KEY]) applyMode(changes[MODE_KEY].newValue);
    });
  } catch {
    // Context invalidated (rare on this script); just start auto mode.
    applyMode("auto");
  }
})();
