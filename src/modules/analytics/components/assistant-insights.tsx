import * as React from "react";
import { BotMessageSquare, MessageCircle, Hash } from "lucide-react";
import { ASSISTANT_INSIGHTS } from "../mocks/analytics-data";

export function AssistantInsights() {
  const d = ASSISTANT_INSIGHTS;
  const max = d.topTopics[0].count;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg gradient-unwearable flex items-center justify-center">
          <BotMessageSquare className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Assistant Insights</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Unwearable workspace only</p>
        </div>
      </div>

      {/* Avg messages per conversion */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-[var(--color-info-light)] flex items-center justify-center shrink-0">
          <MessageCircle className="h-4 w-4 text-[var(--color-info)]" />
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Avg. messages before purchase</p>
          <p className="text-xl font-bold text-[var(--color-text-primary)]">{d.avgMessagesPerConversion}</p>
        </div>
      </div>

      {/* Top conversation topics */}
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Hash className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Top Conversation Topics</span>
        </div>
        <div className="space-y-2">
          {d.topTopics.map((t) => {
            const pct = (t.count / max) * 100;
            return (
              <div key={t.topic} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-text-secondary)]">{t.topic}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-text-muted)]">{t.count}</span>
                    <span className="font-semibold text-[var(--color-text-primary)] w-8 text-right">
                      {t.percentage}%
                    </span>
                  </div>
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
      </div>
    </div>
  );
}
