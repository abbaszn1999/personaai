import * as React from "react";
import { BotMessageSquare, MessageCircle, Hash } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { WorkspaceAnalyticsPayload } from "../types";

interface AssistantInsightsProps {
  payload: WorkspaceAnalyticsPayload | null;
}

/** Avg. messages per session and top shopper-stated topics — logged by the widget itself as
 *  each chat turn is sent/completed (see chat-events.ts). Falls back to an honest empty state
 *  when no shopper has chatted yet in this range, mirroring TryOnInsights. */
export function AssistantInsights({ payload }: AssistantInsightsProps) {
  const d = payload?.assistantInsights;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg gradient-unwearable flex items-center justify-center">
          <BotMessageSquare className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Assistant Insights</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Unwearable workspace only</p>
        </div>
      </div>

      {!d ? (
        <EmptyState
          icon={<MessageCircle className="h-6 w-6" />}
          title="No conversations yet"
          description="Once a shopper chats with the Shopping Assistant, message and topic insights will show up here."
          className="py-10"
        />
      ) : (
        <>
          {/* Avg messages per session */}
          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[var(--color-brand-light)] flex items-center justify-center shrink-0">
              <MessageCircle className="h-4 w-4 text-[var(--color-brand)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Avg. messages per session</p>
              <p className="text-xl font-bold text-[var(--color-text-primary)]">{d.avgMessagesPerSession}</p>
            </div>
          </div>

          {/* Top topics */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Hash className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Top Shopper Topics</span>
            </div>
            {d.topTopics.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">No topics captured yet.</p>
            ) : (
              <div className="space-y-2">
                {d.topTopics.map((t, i) => {
                  const max = d.topTopics[0].count;
                  const pct = (t.count / max) * 100;
                  return (
                    <div key={t.topic} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--color-text-secondary)]">
                          <span className="text-[var(--color-text-muted)] mr-1.5">{i + 1}.</span>
                          {t.topic}
                        </span>
                        <span className="font-semibold text-[var(--color-text-primary)]">{t.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--color-surface-base)]">
                        <div
                          className="h-full rounded-full gradient-unwearable transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
