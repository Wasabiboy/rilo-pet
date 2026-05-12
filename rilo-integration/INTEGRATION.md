# Rilo Companion Bridge — Integration Guide

**Audience:** Rilo Studio engineering team
**Estimated effort:** 15 minutes
**Risk:** Effectively zero (broadcast-only, no inbound surface, no dependencies)

---

## What this is

A ~80-line, dependency-free JavaScript snippet you embed once in the Rilo app shell. It broadcasts task-lifecycle events via `window.postMessage` so companion browser extensions can react to them without scraping your DOM.

**One-way only.** External code can listen, but cannot send messages *back* to Rilo. There is no security surface added.

**Same-origin only.** Posts to `window.location.origin`, never to `"*"`. Messages never leave the rilo.studio origin.

**Zero runtime cost when no one is listening.** `postMessage` to nothing is a no-op.

---

## Why ship it

The "Rilo Pet" extension (an unofficial companion: https://github.com/Wasabiboy/rilo-pet) currently detects task completion by watching the DOM:

- Watching the Send button's class for the violet-purple gradient transition
- Listening for newly-inserted primary action buttons in decision cards
- Reacting to title changes

This works today, but breaks every time you redesign the UI. Publishing an event contract means:

1. Companion tools integrate cleanly. No DOM scraping.
2. You ship UI changes freely without breaking third-party integrations.
3. You join the same pattern Linear, Notion, Slack, and v0 use (event hooks → integration ecosystem).

---

## Files in this package

| File | Purpose |
|---|---|
| `rilo-companion-bridge.js` | The actual snippet. Drop-in, no dependencies. |
| `integration-example.ts` | TypeScript reference showing where the five emit calls land in a typical Next.js streaming-chat app. |
| `README.md` (this file) | Integration steps, event contract, FAQ. |

---

## Step-by-step integration

### Step 1 — Add the snippet to your app

Two ways to do this:

**Option A: Import it as a module** (recommended)

1. Copy `rilo-companion-bridge.js` into your project, e.g. `src/lib/rilo-companion-bridge.js`.
2. Import it once at app startup (it self-registers on `window`):

   ```ts
   // app/layout.tsx (or wherever your root layout/component is)
   import "@/lib/rilo-companion-bridge";

   // Then, once the app mounts:
   useEffect(() => {
     window.RiloCompanionBridge?.init();
   }, []);
   ```

**Option B: Inline it in your root layout** (if you'd rather not add a new module)

Paste the contents of `rilo-companion-bridge.js` into a `<script>` block in your root document head. Then call `window.RiloCompanionBridge.init()` from any client-side entry point.

### Step 2 — Add a TypeScript declaration (optional but recommended)

Drop this anywhere your `tsconfig` picks it up, e.g. `types/rilo-companion-bridge.d.ts`:

```ts
declare global {
  interface Window {
    RiloCompanionBridge?: {
      version: number;
      init(): void;
      emit(
        type:
          | "rilo:task-started"
          | "rilo:task-complete"
          | "rilo:awaiting-input"
          | "rilo:error"
          | string,
        payload?: Record<string, any>
      ): void;
    };
  }
}
export {};
```

This gives you compile-time autocomplete on `window.RiloCompanionBridge.emit(...)` and stops TS from flagging the usage.

### Step 3 — Add emit() calls in your existing lifecycle code

There are five hook points. All optional — you can ship a partial subset and revisit later. **The most important one is `rilo:task-complete`** since that's what notification extensions hook into.

Below are concrete examples assuming you're using the Vercel AI SDK's `useChat`. Adapt to your actual stack — the principle is the same wherever your lifecycle callbacks live.

#### 3a. When a generation starts

```ts
const chat = useChat({
  onResponse: () => {
    window.RiloCompanionBridge?.emit("rilo:task-started", {
      kind: "generation"
    });
  },
  // ...
});
```

#### 3b. When a generation finishes (MOST IMPORTANT)

```ts
const chat = useChat({
  onFinish: (message) => {
    window.RiloCompanionBridge?.emit("rilo:task-complete", {
      summary: extractSummary(message.content),
      waitingFor: "message"
    });
  },
  // ...
});

// Helper: first ~80 chars of plain text
function extractSummary(content: string): string {
  const plain = content.replace(/[*_`#>]/g, "").trim();
  return plain.length > 80 ? plain.slice(0, 77) + "..." : plain;
}
```

#### 3c. When a decision card mounts

If your decision cards (feature pickers, A/B/C choices, "Start Designing / Ask More / Deep Research" etc.) are React components, fire from their `useEffect`:

```tsx
export function DecisionCard({ title, choices }: Props) {
  useEffect(() => {
    window.RiloCompanionBridge?.emit("rilo:awaiting-input", {
      summary: title,
      choices: choices.map((c) => ({ label: c.label, id: c.id }))
    });
  }, [title]);

  return <div>...</div>;
}
```

If you'd rather not differentiate "task complete with text response" from "task complete with decision card", you can skip this event entirely — the extension will treat both as `rilo:task-complete` for notification purposes.

#### 3d. On build/deploy lifecycle (if applicable)

```ts
async function deployProject(projectId: string) {
  window.RiloCompanionBridge?.emit("rilo:task-started", {
    kind: "deploy",
    taskId: projectId
  });

  try {
    await runDeploy(projectId);
    window.RiloCompanionBridge?.emit("rilo:task-complete", {
      taskId: projectId,
      summary: "Deployment ready",
      waitingFor: "none"
    });
  } catch (err) {
    window.RiloCompanionBridge?.emit("rilo:error", {
      message: `Deploy failed: ${err.message}`,
      fatal: false
    });
  }
}
```

#### 3e. On errors users should see

```ts
window.RiloCompanionBridge?.emit("rilo:error", {
  message: "Generation failed: timeout",
  fatal: false
});
```

### Step 4 — Verify it works

Once the snippet is deployed (or running locally), open your DevTools console on any rilo.studio page and run:

```js
window.RiloCompanionBridge.emit("rilo:task-complete", {
  summary: "Manual test from console"
});
```

If you have the Rilo Pet extension installed, you'll see:
- The floating pet bounce on whatever tab you're viewing (open a non-Rilo tab first to see this)
- A desktop notification

If you don't have the extension and just want to confirm the bridge is broadcasting:

```js
window.addEventListener("message", (e) => {
  if (e.data?.source === "rilo-app") console.log("Event:", e.data);
});

window.RiloCompanionBridge.emit("rilo:task-complete", { summary: "test" });
// Expected console output: Event: { source: "rilo-app", version: 1, type: "rilo:task-complete", payload: { summary: "test" } }
```

---

## Event contract

All events share this envelope:

```ts
{
  source: "rilo-app",   // namespace — never change
  version: 1,           // schema version — bump if breaking change
  type: string,         // event name
  payload: object       // event-specific
}
```

### Events

| `type` | When to fire | Payload (all fields optional unless noted) |
|---|---|---|
| `rilo:bridge-ready` | Auto-fired by `init()` — announces presence. Don't fire manually. | `{ source, version }` |
| `rilo:task-started` | Long-running work begins (>~1s). | `{ taskId?, kind? }` where `kind` ∈ `"generation" \| "build" \| "deploy" \| ...` |
| `rilo:task-complete` | Work is done, user can do something next. **Most important event.** | `{ taskId?, summary?, waitingFor? }` where `waitingFor` ∈ `"message" \| "decision" \| "none"` |
| `rilo:awaiting-input` | Specifically needs user to pick from choices. Optional — can be folded into `task-complete`. | `{ summary?, choices?: Array<{ label, id? }> }` |
| `rilo:error` | Error the user should see. | `{ message: string, fatal?: boolean }` |

### `waitingFor` semantics

- `"message"` — user types their next prompt
- `"decision"` — user picks from a presented set of choices
- `"none"` — terminal state (build complete, deploy done, session ended)

---

## Security considerations

- **Same-origin only.** The snippet calls `postMessage(payload, window.location.origin)` — *not* `"*"`. Browsers enforce that messages never leave the rilo.studio origin.
- **Read-only protocol.** Listeners can't send messages back to Rilo. The bridge has no `addEventListener` for inbound messages. If you ever want bidirectional (e.g. extensions triggering Rilo actions), that's a separate proposal needing auth and explicit allowlisting — not in scope here.
- **No sensitive data in payloads.** Treat events like analytics. Don't include auth tokens, full prompts, generated code, file contents, or PII. Short `summary` strings only.
- **Same-origin postMessage doesn't trigger Trusted Types violations** in apps using strict CSP, because the message never crosses origins.

---

## Backward compatibility

Version field handling:

- **Non-breaking additions** (new event types, new optional payload fields): keep `version: 1`.
- **Breaking changes** (renamed events, changed payload shapes): bump to `version: 2`. Listeners read the version field and adapt or gracefully downgrade.

This means you can add new events anytime without coordinating with extension authors.

---

## FAQ

**Q: Will this slow down the app?**
No. `postMessage` is a microtask. When no listeners are attached, the browser drops it immediately. When listeners *are* attached, each listener gets the event in a separate microtask — they can't block your code.

**Q: Will users see anything different?**
No. The bridge is invisible. It only fires events; it doesn't render UI or modify the DOM.

**Q: What if the snippet breaks?**
It can't — it's pure broadcast with `try`/`catch` around the actual postMessage call. Worst case if something throws inside the snippet (it shouldn't), it fails silently and your app keeps working. There's no try/catch needed at the call sites.

**Q: Can I A/B test this? Roll out behind a flag?**
Yes. The snippet runs only if you call `RiloCompanionBridge.init()`. Gate the init call behind your feature flag system. Or skip `init()` and the snippet does nothing — calling `emit()` works fine without init, but extensions won't hear the `bridge-ready` announcement.

**Q: What if we don't want to ship this?**
Totally fair. The companion extension will keep working via DOM scraping. The downside is that any UI refactor on your end could silently break it. If you'd prefer a different shape entirely (REST callback, GraphQL subscription, something else), happy to discuss.

**Q: Can we modify the snippet before shipping?**
Yes, it's MIT licensed. Keep the `source: "rilo-app"` namespace and the schema structure so existing listeners (just the one extension today) keep working. Everything else is yours.

**Q: Why isn't this a npm package?**
Two reasons. First, it's 80 lines — adding a dependency is overkill. Second, hosting it in your own codebase means you control updates and don't need to track an external version.

---

## What's next

If you decide to ship this:

1. Drop the snippet into your codebase
2. Add 1-5 emit calls in your lifecycle code (start with just `rilo:task-complete`)
3. Push it
4. Mention in the next changelog: *"Companion extension event hooks — see github.com/Wasabiboy/rilo-pet/tree/main/rilo-pet/rilo-integration for details."* That signal alone may attract more companion-tool developers.

If you'd like to chat:

**Phil Wesley-Brown — Decoded Digital**
Email: phil@wesley-brown.com
Repo: https://github.com/Wasabiboy/rilo-pet

Happy to PR this directly into your codebase, jump on a 15-minute call, or revise the proposal based on what you'd prefer.
