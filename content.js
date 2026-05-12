// content.js — floating pet + task-complete reaction.

(() => {
  if (window.__riloPetInjected) return;
  window.__riloPetInjected = true;

  const PET_ID = "rilo-pet-root";
  const BUBBLE_ID = "rilo-pet-bubble";
  const STORAGE_KEY = "riloPetPosition";
  const SIZE_KEY = "riloPetSize";
  const CHIME_KEY = "riloPetChime";

  if (window.top !== window.self) return;
  if (/(^|\.)rilo\.studio$/.test(location.hostname)) return;

  // ---- Safe wrappers for chrome.* APIs ----------------------------------
  // After an extension reload, old content scripts on already-open tabs lose
  // their extension context. Every chrome.* call from that old script throws
  // "Extension context invalidated." Wrap them so they fail silently and we
  // can detach our observers/listeners.
  let contextAlive = true;
  function isContextAlive() {
    if (!contextAlive) return false;
    try {
      // Touching chrome.runtime.id throws if context is invalidated.
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      contextAlive = false;
      return false;
    }
  }
  function safeSendMessage(payload) {
    if (!isContextAlive()) return;
    try {
      chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError);
    } catch (e) {
      contextAlive = false;
    }
  }
  function safeStorageSet(obj) {
    if (!isContextAlive()) return;
    try {
      chrome.storage.local.set(obj, () => void chrome.runtime.lastError);
    } catch (e) {
      contextAlive = false;
    }
  }
  async function safeStorageGet(keys) {
    if (!isContextAlive()) return {};
    try {
      return await chrome.storage.local.get(keys);
    } catch {
      contextAlive = false;
      return {};
    }
  }
  function safeGetURL(path) {
    if (!isContextAlive()) return "";
    try {
      return chrome.runtime.getURL(path);
    } catch {
      contextAlive = false;
      return "";
    }
  }
  // -----------------------------------------------------------------------

  function ensureRoot() {
    let root = document.getElementById(PET_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = PET_ID;
    root.setAttribute("role", "button");
    root.setAttribute("aria-label", "Open rilo.studio");
    root.setAttribute("tabindex", "0");
    root.title = "rilo.studio — click to open · drag to move";

    // Video pet inside a circular clip wrapper.
    const clip = document.createElement("div");
    clip.id = "rilo-pet-clip";

    const video = document.createElement("video");
    video.id = "rilo-pet-video";
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.disablePictureInPicture = true;
    video.disableRemotePlayback = true;
    video.preload = "auto";
    // Poster shows instantly while video buffers + serves as fallback if video can't decode.
    const stillUrl = safeGetURL("pet-still.png");
    if (stillUrl) video.poster = stillUrl;

    const webmUrl = safeGetURL("pet.webm");
    if (webmUrl) {
      const s1 = document.createElement("source");
      s1.src = webmUrl;
      s1.type = "video/webm";
      video.appendChild(s1);
    }

    // Final fallback: SVG mascot, only shown if video failed to load.
    const fallbackImg = document.createElement("img");
    fallbackImg.id = "rilo-pet-fallback";
    fallbackImg.alt = "";
    fallbackImg.draggable = false;
    fallbackImg.src = safeGetURL("pet-default.svg");
    fallbackImg.style.display = "none";

    video.addEventListener("error", () => {
      // Video failed entirely — show SVG fallback instead.
      video.style.display = "none";
      fallbackImg.style.display = "";
    });

    // Some browsers/policies block autoplay even for muted video. Retry on first interaction.
    const tryPlay = () => video.play && video.play().catch(() => {});
    tryPlay();
    document.addEventListener("pointerdown", tryPlay, { once: true, capture: true });

    clip.appendChild(video);
    clip.appendChild(fallbackImg);
    root.appendChild(clip);

    (document.documentElement || document.body).appendChild(root);
    wireInteractions(root);
    return root;
  }

  function ensureBubble() {
    let bubble = document.getElementById(BUBBLE_ID);
    if (bubble) return bubble;
    bubble = document.createElement("div");
    bubble.id = BUBBLE_ID;
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");
    bubble.innerHTML = `
      <div class="rilo-bubble-inner">
        <strong>Rilo is ready</strong>
        <span>Your task just finished. Click me to jump in.</span>
      </div>
      <button class="rilo-bubble-close" aria-label="Dismiss">×</button>
    `;
    (document.documentElement || document.body).appendChild(bubble);

    bubble.querySelector(".rilo-bubble-close").addEventListener("click", (e) => {
      e.stopPropagation();
      hideBubble();
    });
    bubble.addEventListener("click", () => {
      safeSendMessage({ type: "RILO_PET_CLICK" });
      hideBubble();
    });
    return bubble;
  }

  function positionBubble() {
    const root = document.getElementById(PET_ID);
    const bubble = document.getElementById(BUBBLE_ID);
    if (!root || !bubble) return;
    const rect = root.getBoundingClientRect();
    // Place bubble to the LEFT of the pet, vertically centered, with a 12px gap.
    // If there's no room on the left, flip to the right.
    bubble.style.visibility = "hidden";
    bubble.style.display = "block";
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    let left = rect.left - bw - 12;
    let placement = "left";
    if (left < 8) {
      left = rect.right + 12;
      placement = "right";
    }
    let top = rect.top + rect.height / 2 - bh / 2;
    top = Math.max(8, Math.min(window.innerHeight - bh - 8, top));
    bubble.style.left = left + "px";
    bubble.style.top = top + "px";
    bubble.dataset.placement = placement;
    bubble.style.visibility = "";
  }

  let hideTimer = null;
  function showBubble() {
    const bubble = ensureBubble();
    bubble.classList.remove("rilo-bubble-hidden");
    bubble.classList.add("rilo-bubble-visible");
    positionBubble();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBubble, 12000); // auto-dismiss after 12s
  }
  function hideBubble() {
    const bubble = document.getElementById(BUBBLE_ID);
    if (!bubble) return;
    bubble.classList.remove("rilo-bubble-visible");
    bubble.classList.add("rilo-bubble-hidden");
  }

  async function playChime() {
    try {
      const s = await safeStorageGet([CHIME_KEY]);
      if (!s[CHIME_KEY]) return; // off by default
      const url = safeGetURL("chime.mp3");
      if (!url) return;
      const audio = new Audio(url);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}
  }

  function celebrate() {
    const root = ensureRoot();
    root.classList.remove("rilo-pet-celebrate");
    // force reflow so the class re-application restarts the animation
    void root.offsetWidth;
    root.classList.add("rilo-pet-celebrate");
    showBubble();
    playChime();
    setTimeout(() => root.classList.remove("rilo-pet-celebrate"), 2400);
  }

  function wireInteractions(root) {
    let dragging = false;
    let moved = false;
    let startX = 0, startY = 0;
    let originX = 0, originY = 0;
    const DRAG_THRESHOLD = 4;

    root.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX; startY = e.clientY;
      const rect = root.getBoundingClientRect();
      originX = rect.left; originY = rect.top;
      root.setPointerCapture?.(e.pointerId);
      root.classList.add("rilo-pet-dragging");
      e.preventDefault();
    });

    root.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) moved = true;
      if (!moved) return;
      const left = clamp(originX + dx, 0, window.innerWidth - root.offsetWidth);
      const top = clamp(originY + dy, 0, window.innerHeight - root.offsetHeight);
      root.style.left = left + "px";
      root.style.top = top + "px";
      root.style.right = "auto"; root.style.bottom = "auto";
      positionBubble();
    });

    root.addEventListener("pointerup", (e) => {
      if (!dragging) return;
      dragging = false;
      root.classList.remove("rilo-pet-dragging");
      root.releasePointerCapture?.(e.pointerId);
      if (moved) {
        const rect = root.getBoundingClientRect();
        safeStorageSet({ [STORAGE_KEY]: { left: rect.left, top: rect.top } });
      } else {
        safeSendMessage({ type: "RILO_PET_CLICK" });
        hideBubble();
      }
    });

    root.addEventListener("pointercancel", () => {
      dragging = false;
      root.classList.remove("rilo-pet-dragging");
    });

    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        safeSendMessage({ type: "RILO_PET_CLICK" });
      }
    });

    window.addEventListener("resize", () => {
      const rect = root.getBoundingClientRect();
      root.style.left = clamp(rect.left, 0, window.innerWidth - root.offsetWidth) + "px";
      root.style.top = clamp(rect.top, 0, window.innerHeight - root.offsetHeight) + "px";
      positionBubble();
    });

    window.addEventListener("scroll", positionBubble, { passive: true });
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  async function restorePosition(root) {
    try {
      const data = await safeStorageGet([STORAGE_KEY, SIZE_KEY]);
      if (data[SIZE_KEY]) {
        const s = parseInt(data[SIZE_KEY], 10);
        if (s >= 32 && s <= 256) {
          root.style.width = s + "px";
          root.style.height = s + "px";
        }
      }
      const pos = data[STORAGE_KEY];
      if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
        root.style.left = clamp(pos.left, 0, window.innerWidth - root.offsetWidth) + "px";
        root.style.top = clamp(pos.top, 0, window.innerHeight - root.offsetHeight) + "px";
        root.style.right = "auto"; root.style.bottom = "auto";
      }
    } catch {}
  }

  function setVisible(visible) {
    const root = document.getElementById(PET_ID);
    if (!root) return;
    root.style.display = visible ? "" : "none";
  }

  function refreshVisibility() {
    setVisible(!/(^|\.)rilo\.studio$/.test(location.hostname));
  }

  if (isContextAlive()) {
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === "RILO_PET_STATE_CHANGED") refreshVisibility();
        if (msg?.type === "RILO_PET_TASK_COMPLETE") celebrate();
      });
    } catch { contextAlive = false; }

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        const root = document.getElementById(PET_ID);
        if (!root) return;
        if (changes[SIZE_KEY]) {
          const s = parseInt(changes[SIZE_KEY].newValue, 10);
          if (s >= 32 && s <= 256) {
            root.style.width = s + "px";
            root.style.height = s + "px";
            positionBubble();
          }
        }
      });
    } catch { contextAlive = false; }
  }

  const root = ensureRoot();
  restorePosition(root);
  refreshVisibility();
})();
