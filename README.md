# Rilo Pet 🐾

> **Unofficial third-party browser companion for [rilo.studio](https://rilo.studio).**
> Not affiliated with, endorsed by, or sponsored by Rilo Studio. *"Rilo"* and *"rilo.studio"* are trademarks of their respective owners.

A floating desktop-pet-style icon for your browser that:

- **Launches or focuses your [rilo.studio](https://rilo.studio) tab with one click**, from any page
- **Notifies you the moment a Rilo task finishes** — even when your browser is minimized or you're working in another app

Built as a personal tool to scratch a "did Rilo finish yet?" itch while vibe-coding alongside Cursor, Figma, and other workflows. Sharing it in case it's useful to anyone else.

---

## What's in this repo

The extension and a related integration proposal, kept together in one repo:

### Extension files (root of this repo)
A Chromium and Firefox extension (Manifest V3) that injects the floating pet into pages, watches `rilo.studio` for task-completion signals, and fires OS-level notifications. To install: clone or download this repo, then **Load unpacked** the root folder in `chrome://extensions`.

### `rilo-integration/` — a proposal for the Rilo team
The extension currently detects task completion by watching the DOM, which is fragile and breaks on UI redesigns. This folder contains an **~80-line, MIT-licensed JavaScript snippet** that would let Rilo (or any other vibe-coding tool) emit lifecycle events via `postMessage`, allowing companion extensions to integrate cleanly without scraping.

→ See [`rilo-integration/INTEGRATION.md`](rilo-integration/INTEGRATION.md) for step-by-step integration instructions with concrete code examples.
→ See [`rilo-integration/README.md`](rilo-integration/README.md) for the higher-level event contract and rationale.

**For the Rilo team specifically**: this is intended as a friendly contribution proposal, not a critique. Same pattern as Linear's, Notion's, v0's, and Slack's published event hooks. Zero runtime cost when no listeners are attached. Happy to PR it directly into your codebase — see contact below.

---

## Install (Chrome / Edge / Brave)

Until the extension is published on the Chrome Web Store (in review at time of writing), use the developer-mode install:

1. Download or clone this repo.
2. Open `chrome://extensions` and toggle **Developer mode** on (top right).
3. Click **Load unpacked** and pick the repo root folder.
4. The pet appears on the next webpage you load.

Full developer details (detection signals, options, troubleshooting) are kept in `rilo-integration/INTEGRATION.md` for the bridge proposal and inline in the source files for the extension itself.

---

## How it works (quick version)

```
                                            ┌─────────────────────────┐
   You click the pet  ──────────────────────│ background service      │
                                            │   - finds rilo tab      │
                                            │   - focuses or opens it │
                                            └─────────────────────────┘

                ┌─────────────────────────┐
   rilo task ──▶│ rilo-watcher.js         │──▶  notification system
   finishes     │   (runs on rilo.studio) │
                │  - watches DOM, OR      │
                │  - listens for bridge   │
                │    events if available  │
                └─────────────────────────┘
```

Detection is multi-modal: it tries to listen for first-party `postMessage` events from rilo.studio first (clean, robust). If those don't exist, it falls back to watching the DOM for the violet Send button, decision-card buttons, and title changes (fragile but works today).

---

## Privacy

The extension collects **no data**. Nothing leaves your browser. Full details: [`PRIVACY.md`](PRIVACY.md).

---

## Status

| | |
|---|---|
| **Latest version** | 1.5.1 |
| **Chrome Web Store** | Submitted (pending review) |
| **Firefox Add-ons** | Not yet — Load Temporary Add-on instructions in extension README |
| **Bridge adopted by Rilo?** | Not yet — extension uses DOM watching in the meantime |

---

## Contributing

Issues, suggestions, and PRs welcome. This is a personal weekend project that turned out useful enough to share, but it's not a polished product — expect rough edges.

**If you're from the Rilo team**: please get in touch before any public discussion of the bridge proposal. Happy to revise the proposal, scope it differently, or take it private if that's preferred.

---

## License

MIT — see [`LICENSE`](LICENSE).

The `rilo-integration/` snippet is MIT-licensed specifically so the Rilo team can adopt it without legal friction.

---

## Author

**Phil Wesley-Brown** — [Decoded Digital](https://decoded.digital)
Email: [phil@wesley-brown.com](mailto:phil@wesley-brown.com)

Built in Auckland, New Zealand 🇳🇿

---

## Trademark notice

This project is not affiliated with, endorsed by, sponsored by, or otherwise connected to Rilo Studio or the creators of rilo.studio. The name "Rilo Pet" is used descriptively to indicate the extension's purpose (a companion for users of rilo.studio). All trademarks remain the property of their respective owners. If the Rilo team would prefer this project use a different name, get in touch and I'll rename it.
