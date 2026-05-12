# Rilo Pet — v1.5.1

A floating browser companion icon for [rilo.studio](https://rilo.studio) that **notifies you the moment Rilo needs your attention** — whether that's a finished task, a question to answer, or a decision card with buttons.

> 📂 For project framing, license, contact, and the broader context of this repo (extension + integration proposal for the Rilo team), see the [top-level README](../README.md).

## What's new in 1.5.x

- **v1.5.5** — New toolbar/store icons generated from the real pet mascot (was using the placeholder geometric icon from v1.0). Added 32×32 variant for crisper rendering at common menu sizes.
- **v1.5.4** — Added "Thinking…" indicator detection. When Rilo's loading bubble disappears, that's now treated as a definitive task-complete signal — the most reliable of all detection paths.
- **v1.5.3** — Send-button detection rewritten to survive React DOM-node replacement (was missing transitions when Rilo's UI swapped the button node mid-render).
- **v1.5.2** — Decision-card detector broadened to catch radio-style prompts (5 options, no commit button) in addition to button-style cards.
- **v1.5.1** — Description trimmed for Chrome Web Store; version bumps for resubmission.
- **v1.5.0** — White background removed via chroma key; the pet's natural silhouette is the shape (no more circular avatar frame).
- **v1.4.1** — Default pet size 58 px (was 96 px); animated WebM loop made seamless via boomerang technique.
- **v1.4.0** — Replaced static icon with animated WebM video pet.

## Detection: bridge vs. DOM watching

This extension supports **two detection methods**:

1. **Rilo Companion Bridge (preferred)** — If rilo.studio embeds the small `rilo-companion-bridge.js` snippet (see `rilo-integration/`), the extension listens for first-party `postMessage` events. This is rock-solid and survives any UI redesign.

2. **DOM watching (fallback)** — If the bridge isn't present, the extension scrapes the page for visual signals (Send button state, decision cards, title changes). Works today, but fragile to UI changes.

The default mode is **Auto**: bridge if available within 2 seconds of page load, DOM otherwise. Switch in Options if you prefer to force one.

**For the Rilo team:** see [`rilo-integration/README.md`](./rilo-integration/README.md) — five lines of integration unlocks reliable companion-extension support.

---

## What it does

- **Click the pet** → opens or focuses your `rilo.studio` tab anywhere across all windows.
- **Drag** to reposition. Position is remembered across pages and sessions.
- **Hides** automatically when you're on `rilo.studio` itself.
- **Detects when Rilo is waiting for you** via three independent signals (any one triggers the notification):
  1. **Send button turns ready** — its class transitions to the violet/purple gradient
  2. **A decision card appears** — Rilo shows you choices like *"Start Designing / Ask More / Deep Research"* or feature checkboxes with action buttons
  3. **Tab title changes** to something like *"Done"* / *"Ready"* / *"✓"*

When detection fires, the pet:
  - Bounces and glows on whatever tab you're currently viewing
  - Shows a speech bubble: *"Rilo is ready — your task just finished"*
  - Fires a native OS notification (only if you're not currently on rilo.studio)
  - Optionally plays a chime sound

## How detection works

`rilo-watcher.js` runs only on `rilo.studio`. It listens for three independent signals:

**Signal 1: Send button ready**
```html
<button aria-label="Send message" class="... from-violet-500 to-purple-600 ...">
```
A `MutationObserver` watches the button's class/disabled attributes. Transition from busy → ready triggers a fire.

**Signal 2: Decision card primary action button**
When Rilo asks you to pick between options (feature checklists, "Start Designing / Ask More / Deep Research", etc.), it inserts a card with a primary violet button. The watcher catches newly-inserted `<button>` nodes that have both `bg-violet-500` and `hover:bg-violet-600` classes AND either a known action label OR a width ≥ 200px (rules out small icon buttons).

**Signal 3: Title change**
Conservative safety net — fires only when the tab title transitions to contain words like *"Done"*, *"Ready"*, *"Complete"*, or a *✓* character.

All three feed a single 3-second debounced fire path, so simultaneous triggers collapse into one notification.

### Anti-noise built in

- **No fire on initial page load** — pre-existing decision cards on the page count as "already there", not "new", and are seeded into a seen-set during a 1.5s bootstrap window.
- **Send button needs to go busy first** — won't fire if the button is ready from the moment you arrive.
- **Already-handled buttons are remembered** via a WeakSet so re-renders of the same card don't re-fire.
- **3-second global debounce** between any fires.
- **OS notifications suppressed when rilo tab is focused** — you can already see it.
- **Re-attaches across SPA navigation** — Next.js can swap DOM subtrees and the watcher keeps working.

### If detection misfires or misses something

Top of `rilo-watcher.js` has all the tunables:

```js
const READY_GRADIENT_MARKERS = ["from-violet-500", "to-purple-600"];
const PRIMARY_BTN_MARKERS = ["bg-violet-500", "hover:bg-violet-600"];
const ACTION_BUTTON_LABELS = ["start designing", "continue", "confirm", ...];
const DEBOUNCE_MS = 3000;
```

Add new labels to `ACTION_BUTTON_LABELS` when you spot Rilo using new ones, or update the class markers if Rilo rebrands.

## Install

### Chrome / Edge / Brave / Opera
1. Unzip to a permanent location (Chrome reads files live — not Downloads).
2. Go to `chrome://extensions` → toggle **Developer mode** (top right).
3. Click **Load unpacked** → choose the `rilo-pet/` folder.
4. Open any page. Pet appears bottom-right.
5. First time a notification fires, your browser/OS will ask permission.

### Firefox
1. Rename `manifest.firefox.json` → `manifest.json` (replacing the Chromium one).
2. Go to `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on**.
3. Pick `manifest.json` inside the folder.

## Settings (right-click pet icon in toolbar → Options)

- **Pet size**: 48–200 px
- **System notification**: on by default. Fires only when you're not on the rilo tab.
- **Chime**: off by default. Add a `chime.mp3` to the folder to enable.
- **Test notification** button to verify your OS notification settings
- **Reset position** to return the pet to bottom-right

## Adding your own pet GIF / sound

- Drop `pet.gif` (recommended 128×128, transparent background) into the folder. Falls back to the built-in animated SVG mascot if missing.
- Drop `chime.mp3` (short, ≤2s recommended) into the folder. Enable the chime toggle in Options.

## Files

```
rilo-pet/
├── manifest.json              ← Chromium (V3)
├── manifest.firefox.json      ← Firefox (rename to use)
├── background.js              ← service worker: tab focus + notifications
├── content.js                 ← injects pet into every non-rilo page
├── content.css                ← pet + speech bubble styles
├── rilo-watcher.js            ← runs only on rilo.studio: detects task complete
├── options.html / .css / .js  ← settings page
├── pet-default.svg            ← built-in animated mascot
├── pet.gif                    ← (optional) your custom pet
├── chime.mp3                  ← (optional) notification sound
└── icons/                     ← toolbar icons (16/48/128)
```

## What this can NOT do

- Can't appear on `chrome://` pages, the Chrome Web Store, or the new-tab page (browser security).
- Can't detect task completion if you close all rilo.studio tabs — the watcher only runs while a rilo tab is open.
- Can't truly run "in the background" forever — Manifest V3 service workers idle out after ~30s. That's fine here because detection runs in the rilo tab itself, not the worker.

## If Rilo ships the Companion Bridge

The extension already supports it — see `rilo-integration/` for the snippet and integration guide that's ready to send to the Rilo team. Once they adopt it, switch the **Detection method** in Options from *Auto* to *Bridge only* for maximum reliability.

---

## Author

**Phil Wesley-Brown** — Decoded Digital
Email: [phil@wesley-brown.com](mailto:phil@wesley-brown.com)

Built as a personal tool and reference companion for vibe-coding workflows.
