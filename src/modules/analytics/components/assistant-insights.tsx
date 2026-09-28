import { MessageSquare } from "lucide-react";
import type { WorkspaceAnalyticsPayload } from "../types";

/** Style assistant activity. Renders nothing when no shopper used the assistant in range. */
export function AssistantInsights({ payload }: { payload: WorkspaceAnalyticsPayload | null }) {
  const data = payload?.assistantInsights;
  if (!data) return null;
  const max = data.topTopics[0]?.count ?? 0;

  return (
    <div className="card-base p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg gradient-brand flex items-center justify-center">
          <MessageSquare className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Assistant insights</h3>
          <p className="text-xs text-[var(--color-text-muted)]">What shoppers asked Persona</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
          <p className="text-[10px] text-[var(--color-text-muted)]">Messages</p>
          <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{data.totalMessages.toLocaleString()}</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
          <p className="text-[10px] text-[var(--color-text-muted)]">Avg. messages / session</p>
          <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">{data.avgMessagesPerSession}</p>
        </div>
      </div>
      {data.topTopics.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Top topics</span>
          {data.topTopics.map((topic) => (
            <div key={topic.topic} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="min-w-0 truncate text-[var(--color-text-secondary)]">{topic.topic}</span>
                <span className="ml-3 font-semibold text-[var(--color-text-primary)]">{topic.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-surface-base)]">
                <div className="h-full rounded-full gradient-brand" style={{ width: `${max > 0 ? (topic.count / max) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
