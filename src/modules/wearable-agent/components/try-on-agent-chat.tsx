"use client";

import * as React from "react";
import { ArrowUp, ChevronDown, ChevronUp, GripVertical, MessageCircle } from "lucide-react";
import type { UseTryOnAgentReturn } from "../hooks/use-try-on-agent";
import { WearableChatMessage, WearableScanningIndicator, WearableTypingIndicator } from "./wearable-chat-message";
import { AvatarMannequinPanel } from "./avatar-mannequin-panel";
import { WEARABLE_QUICK_REPLIES } from "../mocks/responses";
import { MOCK_WEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";
import { AgentOrb } from "@/components/ui/agent-orb";
import { cn } from "@/lib/utils/cn";
import type { PreviewViewportMode } from "./preview-viewport-toggle";

interface TryOnAgentChatProps {
  agent: UseTryOnAgentReturn;
  viewportMode?: PreviewViewportMode;
}

// The avatar photo itself renders at a constant ~520px (fixed 780px-tall, 2:3 frame) so it
// never rescales while dragging — resizing only changes how much background canvas + the
// ~260px info column show around it. Min width keeps the figure and cards from overlapping.
const AVATAR_PANEL_DEFAULT_WIDTH = 860;
const AVATAR_PANEL_MIN_WIDTH = 820;
const AVATAR_PANEL_MAX_WIDTH = 1100;

/** Drag-to-resize the avatar panel by grabbing the divider between the two columns. */
function useResizablePanel() {
  const [width, setWidth] = React.useState(AVATAR_PANEL_DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragState = React.useRef({ startX: 0, startWidth: AVATAR_PANEL_DEFAULT_WIDTH });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = { startX: e.clientX, startWidth: width };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    // Divider sits to the left of the avatar panel — dragging left grows it.
    const delta = dragState.current.startX - e.clientX;
    const next = Math.min(
      AVATAR_PANEL_MAX_WIDTH,
      Math.max(AVATAR_PANEL_MIN_WIDTH, dragState.current.startWidth + delta)
    );
    setWidth(next);
  };

  const onPointerUp = () => setIsDragging(false);

  return { width, isDragging, onPointerDown, onPointerMove, onPointerUp };
}

export function TryOnAgentChat({ agent, viewportMode = "desktop" }: TryOnAgentChatProps) {
  const outfitItemIds = agent.outfitItems.map((o) => o.id);
  const resizer = useResizablePanel();
  const isMobile = viewportMode === "mobile";

  const avatarPanelDesktop = (
    <AvatarMannequinPanel
      profile={agent.profile}
      outfitItems={agent.outfitItems}
      tryOnImages={agent.tryOnImages}
      currentImageIndex={agent.currentImageIndex}
      currentTryOn={agent.currentTryOn}
      isGenerating={agent.isGenerating}
      isRegeneratingAvatar={agent.isRegeneratingAvatar}
      cartItems={agent.cartItems}
      onPrev={agent.prevImage}
      onNext={agent.nextImage}
      onSelectImage={agent.selectImage}
      onRemoveFromOutfit={agent.removeFromOutfit}
      onRegenerateAvatar={agent.regenerateAvatar}
      onAddToCart={agent.addToCart}
    />
  );

  if (isMobile) {
    return (
      <MobileChatLayout agent={agent} outfitItemIds={outfitItemIds} />
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <StyleChatPanel agent={agent} outfitItemIds={outfitItemIds} />

      {/* Drag handle to resize the avatar panel */}
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={resizer.onPointerDown}
        onPointerMove={resizer.onPointerMove}
        onPointerUp={resizer.onPointerUp}
        className="group relative w-4 shrink-0 cursor-col-resize flex items-center justify-center touch-none"
      >
        <div
          className={cn(
            "h-14 w-[5px] rounded-full transition-colors",
            resizer.isDragging
              ? "bg-[var(--color-brand)]"
              : "bg-[var(--color-border)] group-hover:bg-[var(--color-brand)]/60"
          )}
        />
        <GripVertical
          className={cn(
            "absolute h-4 w-4 pointer-events-none transition-opacity",
            resizer.isDragging ? "opacity-100 text-[var(--color-brand)]" : "opacity-0 group-hover:opacity-60 text-[var(--color-text-muted)]"
          )}
        />
      </div>

      <div style={{ width: resizer.width }} className="shrink-0 h-full min-h-0">
        {avatarPanelDesktop}
      </div>
    </div>
  );
}

interface StyleChatPanelProps {
  agent: UseTryOnAgentReturn;
  outfitItemIds: string[];
  compact?: boolean;
}

function StyleChatPanel({ agent, outfitItemIds, compact = false }: StyleChatPanelProps) {
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const cartItemIds = agent.cartItems.map((p) => p.id);
  const canShowQuickReplies =
    agent.intakeIndex === null && !agent.isScanning && !agent.isTyping && !agent.isGenerating;

  React.useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [agent.messages, agent.isTyping, agent.isScanning]);

  return (
    <div className={cn(
      "flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden backdrop-blur-xl",
      compact
        ? "rounded-none border-0 bg-[var(--color-surface-card)]"
        : "rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)]"
    )}>
      {/* Header */}
      <div className={cn("flex items-center gap-3 border-b border-[var(--color-border)] shrink-0", compact ? "px-3 py-3" : "px-5 py-4")}>
        <AgentOrb mode="wearable" size="sm" animated />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold gradient-text-brand">Style</span>
            <span className="text-base font-bold text-[var(--color-text-primary)]">Assistant</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
            <span className="text-xs text-[var(--color-text-muted)]">
              Online — personalised for your profile
            </span>
          </div>
        </div>
      </div>

      {/* Messages — only this area scrolls as the conversation grows */}
      <div ref={messagesRef} className={cn("flex-1 overflow-y-auto space-y-4 min-h-0", compact ? "px-3 py-3" : "px-5 py-4")}>
        {agent.messages.map((msg, idx) => {
          const msgProducts = MOCK_WEARABLE_PRODUCTS.filter((p) =>
            (msg.productRecommendations ?? []).includes(p.id)
          );
          return (
            <WearableChatMessage
              key={msg.id}
              message={msg}
              isLast={idx === agent.messages.length - 1}
              userPhotoUrl={agent.profile.photoUrl}
              inlineProducts={msgProducts.length > 0 ? msgProducts : undefined}
              outfitItemIds={outfitItemIds}
              cartItemIds={cartItemIds}
              isGenerating={agent.isGenerating}
              onWearItem={agent.wearItem}
              onAddToCart={agent.addToCart}
              onQuickOption={(label) => agent.sendMessage(label)}
              onRenderBundle={agent.wearBundle}
              onAddBundleToCart={agent.addBundleToCart}
            />
          );
        })}
        {agent.isTyping && <WearableTypingIndicator />}
        {agent.isScanning && <WearableScanningIndicator stageIndex={agent.scanStageIndex} />}
      </div>

      {/* Quick replies */}
      {canShowQuickReplies && (
        <div className={cn("flex flex-wrap gap-2 shrink-0", compact ? "px-3 pb-2" : "px-5 pb-2")}>
          {WEARABLE_QUICK_REPLIES.map((qr) => (
            <button
              key={qr.label}
              type="button"
              onClick={() => agent.sendMessage(qr.query)}
              className="text-xs rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-all"
            >
              {qr.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className={cn("border-t border-[var(--color-border)] flex gap-2 shrink-0", compact ? "px-3 py-3" : "px-5 py-4")}>
        <input
          className="flex-1 h-10 px-4 text-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-full)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand)] transition-colors"
          placeholder="Ask about clothes, style, sizing…"
          value={agent.input}
          onChange={(e) => agent.setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agent.sendMessage()}
          disabled={agent.isTyping || agent.isGenerating || agent.isScanning}
        />
        <button
          type="button"
          onClick={() => agent.sendMessage()}
          disabled={!agent.input.trim() || agent.isTyping || agent.isGenerating || agent.isScanning}
          className={cn(
            "h-10 w-10 rounded-full gradient-brand text-white flex items-center justify-center shrink-0 transition-all",
            "disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[var(--shadow-glow)]"
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Mobile: Avatar fills full frame, chat is a bottom sheet ─────────────────
interface MobileChatLayoutProps {
  agent: UseTryOnAgentReturn;
  outfitItemIds: string[];
}

/** On mobile the avatar fills 100% of the phone frame and the chat panel
 *  floats as a collapsible bottom sheet so the full model body is always visible. */
function MobileChatLayout({ agent, outfitItemIds }: MobileChatLayoutProps) {
  const [sheetExpanded, setSheetExpanded] = React.useState(false);
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const cartItemIds = agent.cartItems.map((p) => p.id);
  const canShowQuickReplies =
    agent.intakeIndex === null && !agent.isScanning && !agent.isTyping && !agent.isGenerating;

  React.useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [agent.messages, agent.isTyping, agent.isScanning]);

  // Auto-expand sheet when new agent messages arrive so user can read them
  React.useEffect(() => {
    if (agent.messages.length > 1) setSheetExpanded(true);
  }, [agent.messages.length]);

  /** Height of the collapsed sheet handle — avatar is inset by this amount so
   *  the model's feet are always fully above the sheet, never hidden under it. */
  const SHEET_HANDLE_H = 72;

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#0d0b14]">
      {/* ── Layer 0: Avatar fills from top down to just above the sheet handle ──
           This guarantees feet are always visible regardless of sheet state. */}
      <div className="absolute inset-x-0 top-0" style={{ bottom: SHEET_HANDLE_H }}>
        <AvatarMannequinPanel
          profile={agent.profile}
          outfitItems={agent.outfitItems}
          tryOnImages={agent.tryOnImages}
          currentImageIndex={agent.currentImageIndex}
          currentTryOn={agent.currentTryOn}
          isGenerating={agent.isGenerating}
          isRegeneratingAvatar={agent.isRegeneratingAvatar}
          cartItems={agent.cartItems}
          onPrev={agent.prevImage}
          onNext={agent.nextImage}
          onSelectImage={agent.selectImage}
          onRemoveFromOutfit={agent.removeFromOutfit}
          onRegenerateAvatar={agent.regenerateAvatar}
          onAddToCart={agent.addToCart}
          mobile
        />
      </div>

      {/* ── Layer 1: Bottom sheet chat ── */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[30] flex flex-col",
          "rounded-t-[22px] border-t border-white/[0.10]",
          "bg-[#0d0c12]/92 backdrop-blur-2xl",
          "transition-[height] duration-300 ease-out"
        )}
        style={{ height: sheetExpanded ? "62%" : `${SHEET_HANDLE_H}px` }}
      >
        {/* ── Sheet handle + header row ── */}
        <button
          type="button"
          onClick={() => setSheetExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 pt-3 pb-2 shrink-0"
        >
          {/* Drag handle pill */}
          <div className="absolute left-1/2 top-2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/20" />

          <div className="flex items-center gap-2 mt-1">
            <MessageCircle className="h-4 w-4 text-[#f76d01]" />
            <span className="text-[13px] font-semibold text-white">Style Assistant</span>
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse-dot" />
          </div>

          <div className="mt-1 text-white/40">
            {sheetExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </div>
        </button>

        {/* ── Messages + quick replies + input (only visible when expanded) ── */}
        {sheetExpanded && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Messages */}
            <div ref={messagesRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
              {agent.messages.map((msg, idx) => {
                const msgProducts = MOCK_WEARABLE_PRODUCTS.filter((p) =>
                  (msg.productRecommendations ?? []).includes(p.id)
                );
                return (
                  <WearableChatMessage
                    key={msg.id}
                    message={msg}
                    isLast={idx === agent.messages.length - 1}
                    userPhotoUrl={agent.profile.photoUrl}
                    inlineProducts={msgProducts.length > 0 ? msgProducts : undefined}
                    outfitItemIds={outfitItemIds}
                    cartItemIds={cartItemIds}
                    isGenerating={agent.isGenerating}
                    onWearItem={agent.wearItem}
                    onAddToCart={agent.addToCart}
                    onQuickOption={(label) => agent.sendMessage(label)}
                    onRenderBundle={agent.wearBundle}
                    onAddBundleToCart={agent.addBundleToCart}
                  />
                );
              })}
              {agent.isTyping && <WearableTypingIndicator />}
              {agent.isScanning && <WearableScanningIndicator stageIndex={agent.scanStageIndex} />}
            </div>

            {/* Quick replies */}
            {canShowQuickReplies && (
              <div className="flex flex-wrap gap-1.5 shrink-0 px-3 pb-1">
                {WEARABLE_QUICK_REPLIES.map((qr) => (
                  <button
                    key={qr.label}
                    type="button"
                    onClick={() => agent.sendMessage(qr.query)}
                    className="text-[11px] rounded-full border border-white/[0.15] px-2.5 py-1 text-white/60 hover:border-[#f76d01]/60 hover:text-[#f76d01] transition-all"
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2 shrink-0 px-3 py-3 border-t border-white/[0.06]">
              <input
                className="flex-1 h-9 px-3 text-[13px] bg-white/[0.07] border border-white/[0.12] rounded-full text-white placeholder:text-white/30 focus:outline-none focus:border-[#f76d01]/60 transition-colors"
                placeholder="Ask about style, sizing…"
                value={agent.input}
                onChange={(e) => agent.setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && agent.sendMessage()}
                disabled={agent.isTyping || agent.isGenerating || agent.isScanning}
              />
              <button
                type="button"
                onClick={() => agent.sendMessage()}
                disabled={!agent.input.trim() || agent.isTyping || agent.isGenerating || agent.isScanning}
                className={cn(
                  "h-9 w-9 rounded-full gradient-brand text-white flex items-center justify-center shrink-0 transition-all",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
