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

  // Track Rilo's "Thinking..." indicator. When this transitions from visible
  // to gone, Rilo has finished generating a response — fires a task-complete.
  let thinkingVisible = false;
  function isThinkingIndicator(el) {
    if (!(el instanceof HTMLElement)) return false;
    // Signature: an element whose text content begins with "Thinking" AND
    // contains three sibling spans with animate-bounce (Rilo's loading dots).
    const text = (el.textContent || "").trim();
    if (!/^Thinking\b/i.test(text)) return false;
    const bouncyDots = el.querySelectorAll('.animate-bounce, [class*="animate-bounce"]');
    return bouncyDots.length >= 2;
  }
  function findThinkingIndicator() {
    // Cheap query: find anything with at least one animate-bounce, then check siblings.
    const candidates = document.querySelectorAll('.animate-bounce, [class*="animate-bounce"]');
    for (const dot of candidates) {
      // Walk up a couple of levels — Rilo's structure is dots > span > flex-row.
      let el = dot.parentElement;
      for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
        if (isThinkingIndicator(el)) return el;
      }
    }
    return null;
  }
  function evaluateThinking() {
    const present = !!findThinkingIndicator();
    if (present === thinkingVisible) return;
    const wasVisible = thinkingVisible;
    thinkingVisible = present;
    if (present) {
      // Thinking appeared — Rilo is busy. Mark this so the Send detector trusts the next ready.
      sawSendNotReadyOnce = true;
      return;
    }
    // Thinking disappeared. If we previously saw it, that's a clean task-complete.
    if (!wasVisible) return;          // never saw it; shouldn't happen but safe
    if (!bootstrapDone) return;        // page-load artifact — skip
    fireTaskComplete("dom:thinking-gone");
  }
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
    // Don't reset lastSendReady when we get a new node — we want continuity across
    // React's node swaps. We just observe whatever node is current for in-place
    // class mutations.
    sendObserver = new MutationObserver(() => evaluateSend());
    sendObserver.observe(btn, {
      attributes: true,
      attributeFilter: ["class", "disabled", "aria-disabled"]
    });
    // Re-evaluate immediately in case the new node arrived already-ready
    // after a busy period (e.g. React replaced the node mid-transition).
    evaluateSend();
  }

  // State-based detector that survives React node swaps.
  // We track ready-state by asking the document "is *any* send button ready right now",
  // not by holding a reference to a specific node.
  function evaluateSend() {
    const btn = findSendButton();
    if (!btn) return;
    const ready = isSendReady(btn);
    if (ready === lastSendReady) return;
    const wasReady = lastSendReady;
    lastSendReady = ready;
    if (!ready) {
      // Going busy. Mark that we've seen a busy state so we can trust the next ready transition.
      sawSendNotReadyOnce = true;
      return;
    }
    // Ready transition. We require having seen busy at least once to avoid firing on initial load.
    if (wasReady === true) return; // shouldn't happen given the early-return above, but safe
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

  // Track decision-card root panels we've already alerted on, to suppress
  // re-fires when React re-renders the same card.
  const seenDecisionCards = new WeakSet();

  // Detect Rilo's decision-card pattern:
  //   <div class="...rounded-xl border... shadow-md...">
  //     ...one of:
  //       - a primary violet action button (handled by isPrimaryActionButton)
  //       - 3+ option rows each with a circular indicator + label
  //   </div>
  // This catches BOTH the button-style cards (VaultFlow "Start Designing") AND
  // the radio-prompt cards (5 options, no commit button).
  function isDecisionCard(el) {
    if (!(el instanceof HTMLElement)) return false;
    const cls = el.className;
    if (typeof cls !== "string") return false;
    // Outer panel signature: rounded-xl + border + shadow.
    // We're permissive here — any of these visual markers count.
    const looksLikePanel =
      cls.includes("rounded-xl") &&
      cls.includes("border") &&
      (cls.includes("shadow-md") || cls.includes("shadow-sm") || cls.includes("shadow-lg"));
    if (!looksLikePanel) return false;

    // Must contain something interactive: either a primary violet button OR
    // 3+ option rows with the circle-indicator pattern.
    const violetBtn = el.querySelector('button.bg-violet-500, button[class*="bg-violet-500"]');
    if (violetBtn && /hover:bg-violet-600/.test(violetBtn.className || "")) return true;

    // Option rows: look for any element that contains a small rounded-full
    // indicator AND sits inside a flex row inside this panel. 3+ such rows = decision card.
    const indicatorRows = el.querySelectorAll('div.rounded-full.border-2, div[class*="rounded-full"][class*="border-2"]');
    if (indicatorRows.length >= 3) return true;

    return false;
  }

  function scanForDecisionCards(root) {
    if (!root || !root.querySelectorAll) return;
    // Look for any panel-shaped element. Cheap query.
    const candidates = root.querySelectorAll('div[class*="rounded-xl"]');
    for (const panel of candidates) {
      if (seenDecisionCards.has(panel)) continue;
      if (!isDecisionCard(panel)) continue;
      seenDecisionCards.add(panel);
      if (!bootstrapDone) continue;
      // Compose a short reason string for debugging.
      const violetBtn = panel.querySelector('button[class*="bg-violet-500"]');
      const label = violetBtn ? (violetBtn.textContent || "").trim().slice(0, 30) : "radio-prompt";
      fireTaskComplete("dom:decision-card:" + label);
    }
  }

  function scanForActionButtons(root) {
    // Kept for backwards compatibility — also runs the broader card scanner.
    scanForDecisionCards(root);
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
      // Also re-evaluate Send button state on every tree mutation, in case
      // React replaced the node entirely (which the per-node mutation observer can't see).
      evaluateSend();
      // Watch the Thinking indicator at the document level — its appearance/
      // disappearance is the cleanest "Rilo busy/done" signal we have.
      evaluateThinking();
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
    // Seed Thinking state from current DOM so a page-load mid-task is handled gracefully.
    thinkingVisible = !!findThinkingIndicator();
    if (thinkingVisible) sawSendNotReadyOnce = true;
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
