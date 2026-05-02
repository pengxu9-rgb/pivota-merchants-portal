"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  async function copyMarkdown() {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      className="merchant-button-secondary"
      onClick={copyMarkdown}
      disabled={!markdown}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      <span>{copied ? "Copied" : "Copy report as Markdown"}</span>
    </button>
  );
}
