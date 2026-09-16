"use client";

import * as React from "react";
import { ArrowUp, ChevronDown, ChevronUp, GripVertical, MessageCircle } from "lucide-react";
import type { UseTryOnAgentReturn } from "../hooks/use-try-on-agent";
import type { Product } from "@/modules/shopping-agent/types";
import { PinnedAnchorBar, PinnedBundleBar, WearableChatMessage, WearableScanningIndicator, WearableTypingIndicator } from "./wearable-chat-message";
import { AvatarMannequinPanel } from "./avatar-mannequin-panel";
import { NoApiKeyGate } from "./no-api-key-gate";
import { ProfileSwitcher } from "./profile-switcher";
import { WEARABLE_QUICK_REPLIES } from "../mocks/responses";
import { useBottomSheet } from "../hooks/use-bottom-sheet";
import { MOBILE_SURFACE, NO_IOS_ZOOM_TEXT, SAFE_BOTTOM, SHEET_H } from "../mobile-surface";
import { AgentOrb } from "@/components/ui/agent-orb";
import { useVariantPicker } from "@/components/ui/variant-picker-popover";
import { cn } from "@/lib/utils/cn";
import type { PreviewViewportMode } from "./preview-viewport-toggle";
import { useWearableTheme, type WearableTheme } from "../theme-context";
import { useWearableBranding } from "../branding-context";
import type { EmbedRuntimeConfig } from "../hooks/use-try-on-agent";

const CHAT_PANEL_BG_BY_THEME: Record<WearableTheme, string> = { dark: "#0d0b14", light: "#f2f0f5" };

interface TryOnAgentChatProps {
  agent: UseTryOnAgentReturn;
  viewportMode?: PreviewViewportMode;
  embed?: EmbedRuntimeConfig;
  workspaceId?: string;
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

export function TryOnAgentChat({ agent, viewportMode = "desktop", embed, workspaceId }: TryOnAgentChatProps) {
  const outfitItemIds = agent.outfitItems.map((o) => o.id);
  const resizer = useResizablePanel();
  const isMobile = viewportMode === "mobile";
  // Picker for single-item "Add to Cart" clicks only — bulk actions ("Add all" in the avatar
  // panel, bundle "Add all" in chat) call `agent.addToCart`/`agent.addBundleToCart` directly and
  // keep today's auto-pick-first-in-stock-variant behavior, per the variant-selection plan.
  const picker = useVariantPicker(agent.addToCart);

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
      pendingCartItemIds={agent.pendingCartItemIds}
      onPrev={agent.prevImage}
      onNext={agent.nextImage}
      onSelectImage={agent.selectImage}
      onRemoveFromOutfit={agent.removeFromOutfit}
      onRegenerateAvatar={agent.regenerateAvatar}
      onAddToCart={picker.requestAddToCart}
      onBulkAddToCart={agent.addToCart}
      onChangeBackdrop={agent.changeBackdrop}
      onUploadBackdrop={agent.uploadCustomBackdrop}
      isUploadingBackdrop={agent.isUploadingBackdrop}
      backdropUploadError={agent.backdropUploadError}
      embed={embed}
      workspaceId={workspaceId}
    />
  );

  if (isMobile) {
    return (
      <>
        <MobileChatLayout
          agent={agent}
          outfitItemIds={outfitItemIds}
          onAddToCart={picker.requestAddToCart}
          onBulkAddToCart={agent.addToCart}
          embed={embed}
          workspaceId={workspaceId}
        />
        {picker.pickerElement}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <StyleChatPanel
        agent={agent}
        outfitItemIds={outfitItemIds}
        onAddToCart={picker.requestAddToCart}
        embed={embed}
      />

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
      {picker.pickerElement}
    </div>
  );
}

interface StyleChatPanelProps {
  agent: UseTryOnAgentReturn;
  outfitItemIds: string[];
  compact?: boolean;
  onAddToCart?: (product: Product) => void;
  embed?: EmbedRuntimeConfig;
}

function ChatProfileSwitcher({
  agent,
  menuPlacement,
}: {
  agent: UseTryOnAgentReturn;
  menuPlacement?: "down" | "up";
}) {
  return (
    <ProfileSwitcher
      profiles={agent.profiles}
      activeProfileId={agent.activeProfileId}
      maxProfiles={agent.maxProfiles}
      onSwitch={agent.switchProfile}
      onAdd={agent.addProfile}
      onRemove={agent.removeProfile}
      onRename={agent.renameProfile}
      menuPlacement={menuPlacement}
    />
  );
}

function StyleChatPanel({ agent, outfitItemIds, compact = false, onAddToCart, embed }: StyleChatPanelProps) {
  const handleAddToCart = onAddToCart ?? agent.addToCart;
  const branding = useWearableBranding();
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const cartItemIds = agent.cartItems.map((p) => p.id);
  // Quick replies are just a cold-start nudge — once the shopper has sent a real message,
  // showing them again below every subsequent turn is clutter, not a shortcut.
  const hasStartedChat = agent.messages.some((m) => m.role === "user");
  const canShowQuickReplies = !hasStartedChat && !agent.isScanning && !agent.isTyping && !agent.isGenerating;

  React.useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [agent.messages, agent.isTyping, agent.isScanning]);

  if (!agent.apiKeyLoading && !agent.hasApiKey) {
    return (
      <div className={cn(
        "flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden backdrop-blur-xl",
        compact
          ? "rounded-none border-0 bg-[var(--color-surface-card)]"
          : "rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)]"
      )}>
        <NoApiKeyGate />
      </div>
    );
  }

  return (
    <div className={cn(
      "flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden backdrop-blur-xl",
      compact
        ? "rounded-none border-0 bg-[var(--color-surface-card)]"
        : "rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)]"
    )}>
      {/* Header */}
      <div className={cn("flex items-center gap-3 border-b border-[var(--color-border)] shrink-0", compact ? "px-3 py-3" : "px-5 py-4")}>
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 shadow-sm" />
        ) : (
          <AgentOrb mode="wearable" size="sm" animated />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold gradient-text-brand truncate">{branding.agentName}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
            <span className="text-xs text-[var(--color-text-muted)]">
              Online — personalised for your profile
            </span>
          </div>
        </div>
        {embed && <ChatProfileSwitcher agent={agent} />}
      </div>

      {/* Messages — only this area scrolls as the conversation grows */}
      <div ref={messagesRef} className={cn("flex-1 overflow-y-auto space-y-4 min-h-0", compact ? "px-3 py-3" : "px-5 py-4")}>
        {agent.messages.map((msg, idx) => {
          const msgProducts = (msg.productRecommendations ?? [])
            .map((id) => agent.knownProducts[id])
            .filter((p): p is NonNullable<typeof p> => !!p);
          return (
            <WearableChatMessage
              key={msg.id}
              message={msg}
              isLast={idx === agent.messages.length - 1}
              userPhotoUrl={agent.profile.photoUrl}
              inlineProducts={msgProducts.length > 0 ? msgProducts : undefined}
              outfitItemIds={outfitItemIds}
              cartItemIds={cartItemIds}
              pendingCartItemIds={agent.pendingCartItemIds}
              isGenerating={agent.isGenerating}
              onWearItem={agent.wearItem}
              onAddToCart={handleAddToCart}
              knownProducts={agent.knownProducts}
              selectedAnchorId={agent.selectedAnchor?.id ?? null}
              onSelectItem={agent.selectItem}
              onQuickOption={(label) => agent.sendMessage(label)}
              onRenderBundle={agent.wearBundle}
              onAddBundleToCart={agent.addBundleToCart}
              onDiscussBundle={agent.discussBundle}
              discussedBundleId={agent.discussedBundle?.id ?? null}
            />
          );
        })}
        {agent.isTyping && <WearableTypingIndicator stage={agent.typingStage} />}
        {agent.isScanning && <WearableScanningIndicator stageIndex={agent.scanStageIndex} resultCount={agent.scanResultCount} />}
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

      {/* Pinned anchor — a single product and a whole outfit are mutually exclusive subjects,
          so at most one of these ever renders. */}
      {agent.selectedAnchor && (
        <div className={cn("shrink-0", compact ? "px-3 pb-2" : "px-5 pb-2")}>
          <PinnedAnchorBar product={agent.selectedAnchor} onClear={agent.clearAnchor} />
        </div>
      )}
      {agent.discussedBundle && (
        <div className={cn("shrink-0", compact ? "px-3 pb-2" : "px-5 pb-2")}>
          <PinnedBundleBar
            bundle={agent.discussedBundle}
            knownProducts={agent.knownProducts}
            onClear={agent.clearDiscussedBundle}
          />
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
  onAddToCart?: (product: Product) => void;
  onBulkAddToCart?: (product: Product) => void;
  embed?: EmbedRuntimeConfig;
  workspaceId?: string;
}

/** On mobile the avatar fills the whole frame and the chat is a drag-and-snap bottom sheet.
 *  The sheet's live height is published as `--sheet-h` by `useBottomSheet`, and every control
 *  layered over the avatar positions itself against it, so dragging the sheet open never
 *  strands the cart pill, the swatch rail or the mode toggle underneath it. */
function MobileChatLayout({ agent, outfitItemIds, onAddToCart, onBulkAddToCart, embed, workspaceId }: MobileChatLayoutProps) {
  const handleAddToCart = onAddToCart ?? agent.addToCart;
  const handleBulkAddToCart = onBulkAddToCart ?? agent.addToCart;
  const theme = useWearableTheme();
  const branding = useWearableBranding();
  const panelBg = CHAT_PANEL_BG_BY_THEME[theme];
  const styles = MOBILE_SURFACE[theme];
  const sheet = useBottomSheet();
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const cartItemIds = agent.cartItems.map((p) => p.id);
  // Quick replies are just a cold-start nudge — once the shopper has sent a real message,
  // showing them again below every subsequent turn is clutter, not a shortcut.
  const hasStartedChat = agent.messages.some((m) => m.role === "user");
  const canShowQuickReplies = !hasStartedChat && !agent.isScanning && !agent.isTyping && !agent.isGenerating;
  const showKeyGate = !agent.apiKeyLoading && !agent.hasApiKey;

  React.useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [agent.messages, agent.isTyping, agent.isScanning, sheet.snap]);

  // Open the sheet once, for the agent's first reply. Re-opening it on every later message
  // (what this used to do) yanks the sheet up over the avatar while the shopper is still
  // looking at a garment, and makes collapsing it impossible.
  const hasAutoOpened = React.useRef(false);
  const setSnap = sheet.setSnap;
  React.useEffect(() => {
    if (hasAutoOpened.current || agent.messages.length <= 1) return;
    hasAutoOpened.current = true;
    setSnap("half");
  }, [agent.messages.length, setSnap]);

  // While the sheet is collapsed, replies are announced on the handle instead of stealing
  // the screen, so there is still a reason to look down without forcing it open.
  const [unread, setUnread] = React.useState(0);
  const seenCount = React.useRef(agent.messages.length);
  React.useEffect(() => {
    const added = agent.messages.length - seenCount.current;
    seenCount.current = agent.messages.length;
    if (sheet.expanded) setUnread(0);
    else if (added > 0) setUnread((count) => count + added);
  }, [agent.messages.length, sheet.expanded]);

  return (
    <div
      ref={sheet.rootRef}
      className="relative h-full min-h-0 overflow-hidden"
      style={{ background: panelBg, "--sheet-h": "72px" } as React.CSSProperties}
    >
      {/* ── Layer 0: Avatar fills the whole frame and never reflows while the sheet moves —
           a height change here would rescale the photo on every pointer frame. ── */}
      <div className="absolute inset-0">
        <AvatarMannequinPanel
          profile={agent.profile}
          outfitItems={agent.outfitItems}
          tryOnImages={agent.tryOnImages}
          currentImageIndex={agent.currentImageIndex}
          currentTryOn={agent.currentTryOn}
          isGenerating={agent.isGenerating}
          isRegeneratingAvatar={agent.isRegeneratingAvatar}
          cartItems={agent.cartItems}
          pendingCartItemIds={agent.pendingCartItemIds}
          onPrev={agent.prevImage}
          onNext={agent.nextImage}
          onSelectImage={agent.selectImage}
          onRemoveFromOutfit={agent.removeFromOutfit}
          onRegenerateAvatar={agent.regenerateAvatar}
          onAddToCart={handleAddToCart}
          onBulkAddToCart={handleBulkAddToCart}
          onChangeBackdrop={agent.changeBackdrop}
          onUploadBackdrop={agent.uploadCustomBackdrop}
          isUploadingBackdrop={agent.isUploadingBackdrop}
          backdropUploadError={agent.backdropUploadError}
          mobile
          onRequestSpace={() => sheet.setSnap("peek")}
          embed={embed}
          workspaceId={workspaceId}
        />
      </div>

      {/* ── Layer 1: Bottom sheet chat ── */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[30] flex flex-col rounded-t-[22px] border-t backdrop-blur-2xl",
          styles.sheet,
          !sheet.isDragging && "transition-[height] duration-300 ease-out motion-reduce:transition-none"
        )}
        style={{ height: SHEET_H }}
      >
        {/* ── Grab handle + header row. The whole row is the drag surface, so the sheet can be
             flicked between snap points from anywhere along it, not just the 40px pill. ── */}
        <div
          ref={sheet.headerRef}
          {...sheet.handleProps}
          className={cn("relative flex touch-none items-center gap-2 px-4 pt-3 pb-3 shrink-0", styles.headerPress)}
        >
          <div className={cn("pointer-events-none absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full", styles.grabber)} />
          <button
            type="button"
            aria-expanded={sheet.expanded}
            aria-label={sheet.expanded ? "Collapse chat" : "Expand chat"}
            onClick={() => {
              if (!sheet.consumedDrag()) sheet.toggle();
            }}
            className="mt-1 flex min-h-11 min-w-0 flex-1 items-center justify-between"
          >
            <div className="flex min-w-0 items-center gap-2">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
              ) : (
                <MessageCircle className="h-5 w-5 shrink-0 text-[var(--color-brand)]" />
              )}
              <span className={cn("truncate text-[14px] font-semibold", styles.headerTitle)}>{branding.agentName}</span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
            </div>
            <div className={cn("flex items-center gap-2", styles.headerMeta)}>
              {!sheet.expanded && unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-brand)] px-1.5 text-[11px] font-bold text-white">
                  {unread}
                </span>
              )}
              {sheet.expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </div>
          </button>
          {embed && <ChatProfileSwitcher agent={agent} menuPlacement={sheet.snap === "full" ? "down" : "up"} />}
        </div>

        {/* ── Messages + quick replies + input (only visible when expanded) ── */}
        {sheet.expanded && showKeyGate ? (
          <NoApiKeyGate compact />
        ) : sheet.expanded && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Messages */}
            <div
              ref={messagesRef}
              className="flex-1 overflow-y-auto overscroll-contain scrollbar-none px-3 py-2 space-y-3 min-h-0 [-webkit-overflow-scrolling:touch]"
            >
              {agent.messages.map((msg, idx) => {
                const msgProducts = (msg.productRecommendations ?? [])
                  .map((id) => agent.knownProducts[id])
                  .filter((p): p is NonNullable<typeof p> => !!p);
                return (
                  <WearableChatMessage
                    key={msg.id}
                    message={msg}
                    isLast={idx === agent.messages.length - 1}
                    userPhotoUrl={agent.profile.photoUrl}
                    inlineProducts={msgProducts.length > 0 ? msgProducts : undefined}
                    outfitItemIds={outfitItemIds}
                    cartItemIds={cartItemIds}
                    pendingCartItemIds={agent.pendingCartItemIds}
                    isGenerating={agent.isGenerating}
                    onWearItem={agent.wearItem}
                    onAddToCart={handleAddToCart}
                    knownProducts={agent.knownProducts}
                    selectedAnchorId={agent.selectedAnchor?.id ?? null}
                    onSelectItem={agent.selectItem}
                    onQuickOption={(label) => agent.sendMessage(label)}
                    onRenderBundle={agent.wearBundle}
                    onAddBundleToCart={agent.addBundleToCart}
                    onDiscussBundle={agent.discussBundle}
                    discussedBundleId={agent.discussedBundle?.id ?? null}
                  />
                );
              })}
              {agent.isTyping && <WearableTypingIndicator stage={agent.typingStage} />}
              {agent.isScanning && <WearableScanningIndicator stageIndex={agent.scanStageIndex} resultCount={agent.scanResultCount} />}
            </div>

            {/* Quick replies */}
            {canShowQuickReplies && (
              <div className="flex flex-wrap gap-2 shrink-0 px-3 pb-2">
                {WEARABLE_QUICK_REPLIES.map((qr) => (
                  <button
                    key={qr.label}
                    type="button"
                    onClick={() => agent.sendMessage(qr.query)}
                    className={cn(
                      "flex min-h-9 items-center rounded-full border px-3 text-[12px] transition-all",
                      "hover:border-[var(--color-brand)]/60 hover:text-[var(--color-brand)]",
                      styles.quickReply
                    )}
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
            )}

            {/* Pinned anchor — mutually exclusive with the pinned outfit below. */}
            {agent.selectedAnchor && (
              <div className="shrink-0 px-3 pb-1.5">
                <PinnedAnchorBar product={agent.selectedAnchor} onClear={agent.clearAnchor} tone={theme} />
              </div>
            )}
            {agent.discussedBundle && (
              <div className="shrink-0 px-3 pb-1.5">
                <PinnedBundleBar
                  bundle={agent.discussedBundle}
                  knownProducts={agent.knownProducts}
                  onClear={agent.clearDiscussedBundle}
                  tone={theme}
                />
              </div>
            )}

            {/* Input — lifted above the on-screen keyboard, and padded clear of the home
                indicator when there is no keyboard. */}
            <div
              className={cn("flex gap-2 shrink-0 border-t px-3 pt-3", styles.inputRow, !sheet.keyboardInset && SAFE_BOTTOM)}
              style={sheet.keyboardInset ? { paddingBottom: sheet.keyboardInset + 12 } : undefined}
            >
              <input
                className={cn(
                  "flex-1 h-11 min-w-0 rounded-full border px-4 transition-colors focus:outline-none",
                  NO_IOS_ZOOM_TEXT,
                  styles.input
                )}
                placeholder="Ask about style, sizing…"
                value={agent.input}
                onChange={(e) => agent.setInput(e.target.value)}
                onFocus={() => sheet.setSnap("full")}
                onKeyDown={(e) => e.key === "Enter" && agent.sendMessage()}
                disabled={agent.isTyping || agent.isGenerating || agent.isScanning}
              />
              <button
                type="button"
                aria-label="Send message"
                onClick={() => agent.sendMessage()}
                disabled={!agent.input.trim() || agent.isTyping || agent.isGenerating || agent.isScanning}
                className={cn(
                  "h-11 w-11 rounded-full gradient-brand text-white flex items-center justify-center shrink-0 transition-all",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
