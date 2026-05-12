# Rilo Companion Extension Bridge

A 30-line, dependency-free JavaScript snippet that lets browser extensions integrate cleanly with Rilo.

## What this enables

External tools (notification systems, desktop pets, status bars, IDE plugins, productivity dashboards, etc.) can hook into Rilo's task lifecycle without scraping the DOM. The integration is:

- **One-way only** — Rilo broadcasts, listeners can't talk back. No security surface added.
- **Same-origin only** — events never leave the rilo.studio origin.
- **Zero dependency** — pure browser `postMessage`. No SDK to install, no version coupling.
- **Zero cost when nobody's listening** — `postMessage` to nothing is a no-op.

## Why ship this

1. **Companion ecosystem.** Today, anyone wanting to build "ping me when Rilo finishes" has to scrape your DOM — fragile, breaks on every UI redesign. Publishing an event contract makes Rilo a friendlier platform.
2. **Better UX for users running multiple AI tools.** Many vibe-coding users keep Cursor, Lovable, v0, Rilo, and Claude open simultaneously. Whoever ships event hooks first wins the "I always know which AI is waiting for me" experience.
3. **Costs you nothing.** Five emit calls in your existing lifecycle code. No SDK, no maintenance.

Precedent: Linear, Notion, Slack, GitHub all publish similar event hooks. v0 (Vercel) recently shipped `v0:generation-complete` for the same reason.

## Integration (5 minutes)

### 1. Drop in the snippet

Add `rilo-companion-bridge.js` to your app — either as a separate file imported once at app startup, or inlined into your root layout component. The whole thing is ~80 lines including comments.

```ts
// src/lib/companionBridge.ts
import "./rilo-companion-bridge.js";

// In your app entry point:
window.RiloCompanionBridge.init();
```

### 2. Emit events from your existing lifecycle code

Five hook points, all optional but recommended:

```ts
// User submits a prompt → Rilo starts working
RiloCompanionBridge.emit("rilo:task-started", { kind: "generation" });

// Rilo finishes a text response
RiloCompanionBridge.emit("rilo:task-complete", {
  summary: "Built and ready",
  waitingFor: "message"
});

// Rilo shows a decision card (feature picker, A/B/C buttons, etc.)
RiloCompanionBridge.emit("rilo:awaiting-input", {
  summary: "Choose a feature set",
  choices: features.map(f => ({ label: f.name, id: f.id }))
});

// Build/deploy completes
RiloCompanionBridge.emit("rilo:task-complete", {
  summary: "Deployment ready",
  waitingFor: "none"
});

// Error path
RiloCompanionBridge.emit("rilo:error", {
  message: "Generation failed: timeout",
  fatal: false
});
```

That's the entire integration.

## Event schema

All events share the same envelope:

```ts
{
  source: "rilo-app",   // namespace marker — never change
  version: 1,           // schema version — bump if breaking changes
  type: string,         // event name (see below)
  payload: object       // event-specific data
}
```

| Event | When to fire | Payload |
|---|---|---|
| `rilo:bridge-ready` | Auto-fired on `.init()` — announces presence | `{ source, version }` |
| `rilo:task-started` | Long-running work begins (>~1s) | `{ taskId?, kind? }` |
| `rilo:task-complete` | Work is done, user can do something next | `{ taskId?, summary?, waitingFor? }` |
| `rilo:awaiting-input` | Specifically needs user choice from options | `{ summary?, choices? }` |
| `rilo:error` | Error the user should see | `{ message, fatal? }` |

`waitingFor` values: `"message"` (user types next prompt), `"decision"` (user picks from choices), `"none"` (terminal state — build complete, deploy done).

## Security considerations

- **Same-origin only.** Snippet posts to `window.location.origin`, not `"*"`. Messages never leave rilo.studio.
- **No sensitive data in payloads.** Treat like analytics events. Don't include user PII, auth tokens, or full prompt content. Short `summary` strings only.
- **Read-only protocol.** Listeners can't send messages back to Rilo. If you ever want bidirectional (e.g. extensions triggering Rilo actions), that's a separate proposal requiring auth and explicit allowlisting.

## Backward compatibility

Bumping the schema:
- **Non-breaking additions** (new event types, new optional payload fields): keep `version: 1`.
- **Breaking changes** (renamed events, changed payload shapes): bump to `version: 2`. Extensions can check the version field and adapt or downgrade gracefully.

## Testing

In DevTools console on any rilo.studio page after the bridge loads:

```js
RiloCompanionBridge.emit("rilo:task-complete", {
  summary: "Test fire",
  waitingFor: "message"
});
```

Any installed companion extension that listens for `source: "rilo-app"` messages will pick it up.

## License

MIT. Use freely.

## Author

**Phil Wesley-Brown** — Decoded Digital
Email: [phil@wesley-brown.com](mailto:phil@wesley-brown.com)

Built alongside the Rilo Pet browser extension as a reference companion implementation.
Happy to PR this directly into the Rilo codebase if useful — get in touch.
