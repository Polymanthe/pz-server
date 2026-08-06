import { useState } from "react";

export default function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied outside a secure context. The value stays
      // selectable next to the button, so there is nothing to recover from.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="border-border-subtle hover:border-ink-muted cursor-pointer rounded-md border px-3 py-1 text-sm transition-colors"
    >
      {copied ? "Copié" : label}
    </button>
  );
}
