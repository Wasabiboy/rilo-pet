/**
 * Rilo Pet — Companion Extension Event Bridge
 * --------------------------------------------
 * Drop this into rilo.studio's app shell (or any page where you want
 * companion browser extensions to receive lifecycle events).
 *
 * It's a ~30-line, dependency-free, namespace-safe snippet that
 * broadcasts events via window.postMessage. Browser extensions can
 * listen for these events to build companion features (notifications,
 * desktop pets, status bars, etc.) without scraping your DOM.
 *
 * Author: Phil Wesley-Brown — Decoded Digital
 *         <phil@wesley-brown.com>
 * License: MIT — use freely, modify freely.
 * Version: 1.0.0
 *
 * ----------------------------------------------------------------------
 * EVENT CONTRACT
 * ----------------------------------------------------------------------
 * All events use window.postMessage with the same envelope:
 *
 *   {
 *     source: "rilo-app",      // <- identifier; do not change
 *     version: 1,              // <- bump if you change the schema
 *     type: "<event-name>",    // <- see below
 *     payload: { ... }         // <- event-specific data, may be empty
 *   }
 *
 * Events Rilo should emit:
 *
 *   "rilo:task-started"
 *     Fired when Rilo begins working on a user request
 *     (typing/generating/building anything that takes >~1s).
 *     payload: { taskId?: string, kind?: "generation"|"build"|"deploy"|... }
 *
 *   "rilo:task-complete"
 *     Fired when Rilo has finished a task and is waiting for the user.
 *     This is the most important event — it's what notification systems hook.
 *     payload: {
 *       taskId?: string,
 *       summary?: string,        // optional: short user-facing summary
 *       waitingFor?: "message"|"decision"|"none"
 *     }
 *
 *   "rilo:awaiting-input"
 *     Fired when Rilo specifically needs the user to choose between options
 *     (decision cards, button prompts, etc.). Optional — can be folded into
 *     task-complete if simpler. Useful if you want different notification
 *     copy for "Rilo finished" vs "Rilo needs your decision".
 *     payload: {
 *       summary?: string,
 *       choices?: Array<{ label: string, id?: string }>
 *     }
 *
 *   "rilo:error"
 *     Fired when Rilo encounters an error the user should see.
 *     payload: { message: string, fatal?: boolean }
 *
 * ----------------------------------------------------------------------
 * INTEGRATION
 * ----------------------------------------------------------------------
 * 1. Copy this file into your app shell (e.g. src/lib/companionBridge.ts
 *    or paste inline into your root layout component).
 *
 * 2. Initialize it once at app startup:
 *
 *      import { RiloCompanionBridge } from "./companionBridge";
 *      RiloCompanionBridge.init();
 *
 * 3. Emit events from your existing task lifecycle code. Examples:
 *
 *      // When you start a generation:
 *      RiloCompanionBridge.emit("rilo:task-started", { kind: "generation" });
 *
 *      // When the assistant finishes a message:
 *      RiloCompanionBridge.emit("rilo:task-complete", {
 *        summary: "Built and ready",
 *        waitingFor: "message"
 *      });
 *
 *      // When a decision card is shown:
 *      RiloCompanionBridge.emit("rilo:awaiting-input", {
 *        summary: "Pick a feature set",
 *        choices: featureOptions.map(f => ({ label: f.name, id: f.id }))
 *      });
 *
 * That's it. Zero extension dependency — if no companion extension
 * is installed, these postMessage calls are no-ops at zero cost.
 *
 * ----------------------------------------------------------------------
 * SECURITY NOTES
 * ----------------------------------------------------------------------
 * - postMessage is namespaced via the `source: "rilo-app"` field;
 *   extensions filter by this to ignore unrelated postMessage traffic.
 * - We post to window.origin only (not "*"), so messages never leave
 *   the same-origin context.
 * - Payloads should not contain sensitive data (auth tokens, PII).
 *   Treat them like analytics events — useful metadata only.
 * ----------------------------------------------------------------------
 */

(function (global) {
  "use strict";
  if (global.RiloCompanionBridge) return; // idempotent

  var VERSION = 1;
  var SOURCE = "rilo-app";

  var bridge = {
    version: VERSION,

    init: function () {
      // Reserved for future setup. Currently a no-op so callers can
      // depend on calling `.init()` without worrying about what it does.
      // Could later handshake with extensions, register feature flags, etc.
      this._announce();
    },

    /**
     * Emit a lifecycle event. Safe to call before init().
     * @param {string} type  e.g. "rilo:task-complete"
     * @param {object} [payload]
     */
    emit: function (type, payload) {
      if (!type || typeof type !== "string") return;
      try {
        global.postMessage(
          {
            source: SOURCE,
            version: VERSION,
            type: type,
            payload: payload || {}
          },
          global.location.origin
        );
      } catch (e) {
        // postMessage shouldn't throw, but guard anyway.
      }
    },

    /**
     * Tell any listening extension we're alive. Lets them switch from
     * fallback DOM-watching to event-driven mode without reloading.
     */
    _announce: function () {
      this.emit("rilo:bridge-ready", { source: SOURCE, version: VERSION });
    }
  };

  global.RiloCompanionBridge = bridge;
})(typeof window !== "undefined" ? window : globalThis);
