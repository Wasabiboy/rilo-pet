// integration-example.ts
// -----------------------------------------------------------
// Concrete examples of where to add emit() calls in a typical
// React/Next.js streaming chat app. Adapt to wherever your
// real task lifecycle code lives.
//
// Author: Phil Wesley-Brown — Decoded Digital
// License: MIT
// -----------------------------------------------------------

// ===========================================================
// Example 1: Chat hook that streams assistant messages
// ===========================================================

import { useChat } from "ai/react"; // or your equivalent

export function useRiloChat() {
  const chat = useChat({
    api: "/api/chat",

    onResponse: (response) => {
      // Stream started — Rilo is now "thinking"
      window.RiloCompanionBridge?.emit("rilo:task-started", {
        kind: "generation"
      });
    },

    onFinish: (message) => {
      // Stream complete — Rilo is done talking
      window.RiloCompanionBridge?.emit("rilo:task-complete", {
        summary: extractSummary(message.content),
        waitingFor: "message"
      });
    },

    onError: (error) => {
      window.RiloCompanionBridge?.emit("rilo:error", {
        message: error.message,
        fatal: false
      });
    }
  });

  return chat;
}

function extractSummary(content: string): string {
  // First ~80 chars of plain text, stripped of markdown.
  const plain = content.replace(/[*_`#>]/g, "").trim();
  return plain.length > 80 ? plain.slice(0, 77) + "..." : plain;
}

// ===========================================================
// Example 2: Decision card component
// ===========================================================

export function DecisionCard({ title, features, onConfirm }: Props) {
  useEffect(() => {
    // Fire when the card mounts (i.e. Rilo just asked for input)
    window.RiloCompanionBridge?.emit("rilo:awaiting-input", {
      summary: title,
      choices: features.map((f) => ({ label: f.name, id: f.id }))
    });
  }, [title]);

  return <div>...</div>;
}

// ===========================================================
// Example 3: Build/deploy lifecycle
// ===========================================================

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

// ===========================================================
// Example 4: One-time setup in app entry
// ===========================================================

// app/layout.tsx (Next.js) or wherever your root component lives:

import "@/lib/rilo-companion-bridge"; // side-effect import

export default function RootLayout({ children }) {
  useEffect(() => {
    window.RiloCompanionBridge?.init();
  }, []);

  return <html>...</html>;
}

// ===========================================================
// TypeScript declaration (optional but recommended)
// ===========================================================

// types/rilo-companion-bridge.d.ts
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
