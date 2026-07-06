import * as React from "react";
import { Sparkles } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/modules/shopping-agent/types";
import { cn } from "@/lib/utils/cn";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessageBubble({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "flex items-end gap-2 animate-fade-in",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="h-7 w-7 rounded-full gradient-unwearable flex items-center justify-center shrink-0 mb-1">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[75%] rounded-[var(--radius-xl)] px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "gradient-brand text-white rounded-br-[var(--radius-sm)]"
            : "bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-bl-[var(--radius-sm)]"
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="h-7 w-7 rounded-full gradient-unwearable flex items-center justify-center shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)] px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-pulse-dot"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}
