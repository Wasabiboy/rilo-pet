# Privacy Policy — Rilo Pet

**Last updated: 12 May 2026**

This privacy policy describes how the **Rilo Pet** browser extension ("the extension", "we", "us") handles information when you use it. The extension is published by **Phil Wesley-Brown / Decoded Digital** ("the developer").

This policy is written in plain English. If anything is unclear, email [phil@wesley-brown.com](mailto:phil@wesley-brown.com).

---

## TL;DR

The extension **does not collect, transmit, sell, or share any personal information**. Everything the extension knows about you is stored locally in your own browser and never leaves your computer. There are no analytics, no trackers, no servers we operate, and no third-party services involved.

---

## What the extension does

Rilo Pet is a browser extension that:

1. Displays a small floating icon on web pages.
2. Opens or focuses your `rilo.studio` tab when you click the icon.
3. Watches `rilo.studio` for signals that a task has finished (changes in the page's interface, or events published by `rilo.studio` itself if it supports the Rilo Companion Bridge).
4. Shows a desktop notification when a Rilo task is ready for your attention.

That's everything. It does not interact with any other website's content beyond placing the floating icon on the screen.

---

## What information the extension accesses

To do its job, the extension requests these browser permissions:

### `tabs`
Used to find an existing `rilo.studio` tab anywhere across your browser windows, so clicking the icon focuses it instead of opening a duplicate. The extension reads tab URLs to find matches against `rilo.studio` only. **Tab URLs are not stored, logged, or transmitted.**

### `storage`
Used to remember your preferences in your browser's local storage. This includes: the floating icon's position on screen, its size, your chosen detection mode (Auto / Bridge / DOM / Off), and whether notifications and the optional chime are enabled. **This data never leaves your browser.**

### `notifications`
Used to display desktop notifications when a Rilo task completes. The notification content is generated locally — for example, *"Rilo is ready — your task just finished."* No data is sent anywhere as part of showing a notification.

### Host permissions for `rilo.studio`
Used to detect when a Rilo task completes. The extension's watcher script runs on `rilo.studio` pages and listens for visual or event-based completion signals. **No data is read from `rilo.studio`, copied, or transmitted.** The watcher only observes the state of specific UI elements to decide when to fire a local notification.

### Broad page access (`<all_urls>`)
Used to display the floating icon on whatever page you're currently viewing. The icon is a self-contained UI element inserted into the page — the extension does not read any of the page's content, form data, cookies, or anything else. **The only thing the extension does on non-rilo pages is render its own icon and listen for clicks on it.**

---

## What the extension does NOT do

- **No data collection.** The extension does not collect any personal information about you, your browsing history, or your activity on any website.
- **No analytics.** The extension does not include Google Analytics, Mixpanel, Amplitude, or any other usage tracking service.
- **No third-party servers.** The extension does not communicate with any external service, including any service operated by the developer. There is no backend.
- **No telemetry.** The extension does not "phone home" with usage metrics, error reports, or installation events.
- **No content reading.** The extension does not read the text, forms, passwords, or any other content on the pages where it appears.
- **No reading of Rilo's data.** The extension does not read your chat history, prompts, generated code, files, or any other data from `rilo.studio`. It only watches for UI state changes that indicate a task is complete.
- **No advertising.** The extension does not show ads, share data with advertisers, or participate in any advertising network.
- **No selling of data.** There is no data to sell; nothing is collected.

---

## Local data stored

The following items are stored using the browser's standard `chrome.storage.local` API, which keeps them on your computer and accessible only to this extension:

- The pet's position on screen (numeric pixel coordinates)
- The pet's size preference (a number between 32 and 200)
- Your selected detection mode ("auto", "bridge", "dom", or "off")
- Whether OS notifications are enabled (true/false)
- Whether the chime sound is enabled (true/false)

You can clear this data at any time by removing the extension or by clearing your browser's local storage for the extension.

---

## Children's privacy

The extension does not knowingly collect any data from anyone. It does not target children. It does not have an age gate because there is no data to gate.

---

## Changes to this policy

If the extension ever changes its data practices, this policy will be updated and the change will be noted at the top of the page. Any change that would expand the data accessed or transmitted by the extension will be made clear in the Chrome Web Store listing's update notes.

---

## Contact

Questions, concerns, or requests:

**Phil Wesley-Brown — Decoded Digital**
Email: [phil@wesley-brown.com](mailto:phil@wesley-brown.com)

---

*This extension is a personal/professional project by Phil Wesley-Brown. It is not affiliated with, endorsed by, or sponsored by Rilo Studio or its creators. "Rilo" and "rilo.studio" are trademarks of their respective owners.*
