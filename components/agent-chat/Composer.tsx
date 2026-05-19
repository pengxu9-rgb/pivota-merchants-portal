"use client";

import { Send, Paperclip } from "lucide-react";
import { useState } from "react";

interface ComposerProps {
  placeholder?: string;
  onSubmit?: (text: string) => void;
  disabled?: boolean;
}

/**
 * Bottom-pinned message composer. In v1 the agent drives the flow via
 * action chips, so free-text input is decorative for most screens — but
 * Screen 05 (bulk free-text, v2) and ad-hoc questions will use it.
 *
 * Disabled until the user types something.
 */
export function Composer({
  placeholder = "Reply to Pivota…",
  onSubmit,
  disabled,
}: ComposerProps) {
  const [text, setText] = useState("");
  const canSubmit = !disabled && text.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    onSubmit?.(text.trim());
    setText("");
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        background: "var(--p-surface)",
        border: "0.5px solid var(--p-border)",
        borderRadius: "var(--p-radius-pill)",
        boxShadow: "var(--p-shadow-sm)",
      }}
    >
      <button
        type="button"
        aria-label="Attach"
        disabled
        style={{
          background: "none",
          border: "none",
          color: "var(--p-neutral-400)",
          cursor: "not-allowed",
          padding: 4,
        }}
      >
        <Paperclip size={16} strokeWidth={1.8} />
      </button>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          font: "inherit",
          fontSize: 13,
          color: "var(--p-neutral-900)",
        }}
      />
      <button
        type="button"
        aria-label="Send"
        onClick={submit}
        disabled={!canSubmit}
        style={{
          background: canSubmit ? "var(--p-primary)" : "var(--p-surface-muted)",
          color: canSubmit ? "var(--p-primary-fg)" : "var(--p-neutral-400)",
          border: "none",
          borderRadius: 999,
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: canSubmit ? "pointer" : "not-allowed",
          transition: "background 180ms var(--p-easing)",
        }}
      >
        <Send size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
