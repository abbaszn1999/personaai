"use client";

import Link from "next/link";
import { MessageCircle, KeySquare } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { useOpenaiApiKey } from "../hooks/use-openai-api-key";
import { CHAT_MESSAGES_THIS_CYCLE } from "../mocks/chat-usage";

export function ChatUsageSection() {
  const { hasKey, loading } = useOpenaiApiKey();
  const connected = !loading && hasKey;

  return (
    <SettingsSection
      title="Conversational Chat"
      description="Powered by your own OpenAI API key — billed directly by OpenAI"
      icon={<MessageCircle className="h-4 w-4" />}
      accent="wearable"
    >
      {connected ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-[var(--radius-xl)] bg-[var(--color-success-light)] px-5 py-3">
            <div className="flex items-center gap-2.5">
              <KeySquare className="h-4 w-4 text-[var(--color-success)]" />
              <span className="text-sm text-[var(--color-success)] font-medium">OpenAI API key connected</span>
            </div>
            <StatusPill status="connected" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricCard
              label="Messages Sent This Cycle"
              value={CHAT_MESSAGES_THIS_CYCLE.toLocaleString()}
              sub="Billed directly by OpenAI to your account"
              icon={<MessageCircle className="h-4 w-4" />}
              accent="wearable"
            />
          </div>

          <p className="text-xs text-[var(--color-text-muted)]">
            Text chat volume and cost are absorbed natively by your own OpenAI account — Autommerce does not
            meter or charge for conversational chat, and it never draws from your image generation credits.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center py-10 px-6">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl panel-glass text-[var(--color-text-muted)]">
            <KeySquare className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">No OpenAI API key connected</h3>
          <p className="mt-1.5 text-sm text-[var(--color-text-muted)] max-w-sm">
            The chat agent runs on your own OpenAI account. Add your API key to enable conversational chat —
            Autommerce never meters or bills this usage.
          </p>
          <Link href="/settings?section=api-keys" className="mt-5">
            <Button size="md">Add API Key</Button>
          </Link>
        </div>
      )}
    </SettingsSection>
  );
}
