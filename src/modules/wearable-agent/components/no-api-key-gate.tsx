import Link from "next/link";
import { KeyRound } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface NoApiKeyGateProps {
  compact?: boolean;
}

/** Shown instead of the chat panel until the account has a saved Gemini API key — the
 *  Style Assistant is BYO-key (the shopper's own account pays for chat usage), so there's
 *  nothing to chat with until one is added. */
export function NoApiKeyGate({ compact = false }: NoApiKeyGateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 text-center",
        compact ? "px-4 py-6" : "px-8 py-10"
      )}
    >
      <div className="h-11 w-11 rounded-full gradient-wearable flex items-center justify-center shadow-sm">
        <KeyRound className="h-5 w-5 text-white" />
      </div>
      <div className="space-y-1 max-w-xs">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">Add your Gemini API key to chat</p>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          The Style Assistant uses your own Google Gemini account for chat, so we need your API key before it can respond.
        </p>
      </div>
      <Link
        href="/settings"
        className="text-xs font-semibold rounded-full gradient-brand text-white px-4 py-2 hover:opacity-90 transition-opacity"
      >
        Add API key in Settings
      </Link>
    </div>
  );
}
