"use client";

import * as React from "react";
import { ArrowUp, ChevronDown, ChevronUp, GripVertical, MessageCircle } from "lucide-react";
import type { UseTryOnAgentReturn } from "../hooks/use-try-on-agent";
import type { Product } from "@/modules/commerce/types";
import { PinnedAnchorBar, PinnedBundleBar, WearableChatMessage, WearableScanningIndicator, WearableTypingIndicator } from "./wearable-chat-message";
import { AvatarMannequinPanel } from "./avatar-mannequin-panel";
import { ProfileSwitcher } from "./profile-switcher";
import { useEmbedShopperSession } from "../hooks/embed-shopper-session";
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

/** Mobile sheet header / launcher don't have room for the full workspace name. A leading
 *  "Autommerce" is the product prefix, not the agent — strip it so "Autommerce Persona"
 *  reads as "Persona". Any other custom name is left intact. */
function compactChatLabel(name: string): string {
  const compact = name.replace(/^autommerce\s+/i, "").trim();
  return compact || name;
}

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
const AVATAR_PANEL_WIDTH_STORAGE_KEY = "wearable-agent:avatar-panel-width";
const RESIZE_KEY_STEP = 24;

function readStoredPanelWidth(): number {
  if (typeof window === "undefined") return AVATAR_PANEL_DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(AVATAR_PANEL_WIDTH_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return AVATAR_PANEL_DEFAULT_WIDTH;
  return Math.min(AVATAR_PANEL_MAX_WIDTH, Math.max(AVATAR_PANEL_MIN_WIDTH, parsed));
}

/** Drag-to-resize the avatar panel by grabbing the divider between the two columns. Width
 *  persists across sessions (desktop dashboard preview only — embeds always default) so a
 *  merchant testing the layout doesn't have to redo it on every reload. */
function useResizablePanel() {
  const [width, setWidth] = React.useState(AVATAR_PANEL_DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragState = React.useRef({ startX: 0, startWidth: AVATAR_PANEL_DEFAULT_WIDTH });

  React.useEffect(() => {
    setWidth(readStoredPanelWidth());
  }, []);

  const persist = React.useCallback((next: number) => {
    try {
      window.localStorage.setItem(AVATAR_PANEL_WIDTH_STORAGE_KEY, String(next));
    } catch {
      // Storage can throw in locked-down/incognito contexts — resizing still works for the
      // session, it just won't be remembered next time.
    }
  }, []);

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

  const onPointerUp = () => {
    setIsDragging(false);
    persist(width);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Left/Right move the divider itself; since dragging it left *grows* the panel, Left
    // grows and Right shrinks to match the pointer behavior above.
    let delta = 0;
    if (e.key === "ArrowLeft") delta = RESIZE_KEY_STEP;
    else if (e.key === "ArrowRight") delta = -RESIZE_KEY_STEP;
    else if (e.key === "Home") delta = AVATAR_PANEL_MAX_WIDTH;
    else if (e.key === "End") delta = -AVATAR_PANEL_MAX_WIDTH;
    else return;
    e.preventDefault();
    setWidth((w) => {
      const next = Math.min(AVATAR_PANEL_MAX_WIDTH, Math.max(AVATAR_PANEL_MIN_WIDTH, w + delta));
      persist(next);
      return next;
    });
  };

  return { width, isDragging, onPointerDown, onPointerMove, onPointerUp, onKeyDown };
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
      onSaveMeasurements={agent.saveMeasurements}
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
    <div className="relative flex h-full min-h-0 overflow-hidden">
      {agent.cartSyncError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="max-w-[90%] rounded-2xl bg-red-500/95 px-4 py-2.5 text-xs font-medium leading-relaxed text-white shadow-lg backdrop-blur-sm">
            {agent.cartSyncError}
          </div>
        </div>
      )}
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
        aria-label="Resize avatar panel"
        aria-valuenow={resizer.width}
        aria-valuemin={AVATAR_PANEL_MIN_WIDTH}
        aria-valuemax={AVATAR_PANEL_MAX_WIDTH}
        tabIndex={0}
        onPointerDown={resizer.onPointerDown}
        onPointerMove={resizer.onPointerMove}
        onPointerUp={resizer.onPointerUp}
        onKeyDown={resizer.onKeyDown}
        className="group relative w-4 shrink-0 cursor-col-resize flex items-center justify-center touch-none focus-visible:outline-none"
      >
        <div
          className={cn(
            "h-14 w-[5px] rounded-full transition-colors",
            resizer.isDragging
              ? "bg-[var(--color-brand)]"
              : "bg-[var(--color-border)] group-hover:bg-[var(--color-brand)]/60 group-focus-visible:bg-[var(--color-brand)]"
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

function ChatProfileSwitcher({ agent }: { agent: UseTryOnAgentReturn }) {
  const shopper = useEmbedShopperSession();
  return (
    <ProfileSwitcher
      profiles={agent.profiles}
      activeProfileId={agent.activeProfileId}
      maxProfiles={agent.maxProfiles}
      onSwitch={agent.switchProfile}
      onAdd={agent.addProfile}
      onRename={agent.renameProfile}
      onSignOut={shopper?.signOut}
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

  return (
    <div className={cn(
      "flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden backdrop-blur-xl",
      compact
        ? "rounded-none border-0 bg-[var(--color-surface-card)]"
        : "rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)]"
    )}>
      {/* Header — the profile switcher sits where a logo would normally go (top-left), and the
          branding itself is centered, so the one interactive control in this row reads as the
          primary "you are here" anchor instead of competing off to one side. */}
      <div className={cn("flex items-center border-b border-[var(--color-border)] shrink-0", compact ? "px-3 py-3" : "px-5 py-4")}>
        <div className="flex flex-1 min-w-0 items-center justify-start">
          {embed && <ChatProfileSwitcher agent={agent} />}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 shadow-sm" />
          ) : (
            <AgentOrb size="sm" animated />
          )}
          <div className="min-w-0 text-left">
            <span className="text-base font-bold gradient-text-brand truncate block">{branding.agentName}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
              <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                {branding.statusText}
              </span>
            </div>
          </div>
        </div>
        <div className="flex-1" aria-hidden />
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
      {canShowQuickReplies && branding.quickReplies.length > 0 && (
        <div className={cn("flex flex-wrap gap-2 shrink-0", compact ? "px-3 pb-2" : "px-5 pb-2")}>
          {branding.quickReplies.map((qr) => (
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
          className="flex-1 h-10 px-4 text-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-xl)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand)] transition-colors"
          placeholder={branding.inputPlaceholder}
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
            "h-10 w-10 rounded-full gradient-brand text-[var(--color-brand-contrast)] flex items-center justify-center shrink-0 transition-all",
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
  // The full header bar (title, profile switcher, grab handle) only makes sense once there's
  // an actual panel underneath it to be the header *of* — at rest, collapsed, it used to
  // render that same edge-to-edge bar with nothing open below it, which read as a flat,
  // slightly-broken strip glued to the bottom of the screen rather than an intentional
  // control. Mid-drag is treated as "chrome" too so the bar doesn't pop between the two
  // looks while the sheet is visibly resizing under the shopper's finger.
  const showSheetChrome = sheet.expanded || sheet.isDragging;

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
          onSaveMeasurements={agent.saveMeasurements}
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

      {agent.cartSyncError && (
        <div
          className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: `calc(${SHEET_H} + 10px)` }}
        >
          <div className="max-w-[90%] rounded-2xl bg-red-500/95 px-4 py-2.5 text-xs font-medium leading-relaxed text-white shadow-lg backdrop-blur-sm">
            {agent.cartSyncError}
          </div>
        </div>
      )}

      {/* ── Layer 1: Bottom sheet chat ── */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[30] flex flex-col backdrop-blur-2xl",
          showSheetChrome ? cn("rounded-t-[var(--radius-2xl)] border-t", styles.sheet) : "border-t border-transparent bg-transparent",
          !sheet.isDragging &&
            "transition-[height,background-color,border-color] duration-300 ease-out motion-reduce:transition-none"
        )}
        style={{ height: SHEET_H }}
      >
        {/* ── Grab handle + header row. The whole row is the drag surface, so the sheet can be
             flicked between snap points from anywhere along it, not just the 40px pill.
             At rest and collapsed, this is a floating launcher button instead — see
             showSheetChrome above for why the two need to look nothing alike. ── */}
        <div
          ref={sheet.headerRef}
          {...sheet.handleProps}
          className={cn(
            "relative flex touch-none items-center shrink-0",
            showSheetChrome ? cn("gap-2 px-3 pt-3 pb-3", styles.headerPress) : "justify-center px-3 pt-2 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.75rem))]"
          )}
        >
          {showSheetChrome ? (
            <>
              <div className={cn("pointer-events-none absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full", styles.grabber)} />
              {/* Profile switcher takes the logo's old top-left spot; the branding itself moves
                  to the center of the header button below. Only reachable once the sheet has
                  actually opened — the collapsed launcher button below is chat-only, on
                  purpose, so it stays a single, unambiguous action. */}
              {embed && (
                <div className="mt-1 shrink-0">
                  <ChatProfileSwitcher agent={agent} />
                </div>
              )}
              <button
                type="button"
                aria-expanded={sheet.expanded}
                aria-label={sheet.expanded ? "Collapse chat" : "Expand chat"}
                onClick={() => {
                  if (!sheet.consumedDrag()) sheet.toggle();
                }}
                className="relative mt-1 flex min-h-11 min-w-0 flex-1 items-center justify-center"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {branding.logoUrl ? (
                    <img src={branding.logoUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                  ) : (
                    <MessageCircle className="h-5 w-5 shrink-0 text-[var(--color-brand)]" />
                  )}
                  <span className={cn("truncate text-[14px] font-semibold", styles.headerTitle)}>
                    {compactChatLabel(branding.agentName)}
                  </span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
                </div>
                <div className={cn("absolute right-0 flex items-center gap-2", styles.headerMeta)}>
                  {sheet.expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                </div>
              </button>
            </>
          ) : (
            // Floating chat launcher — a self-contained pill (not an edge-to-edge bar) so it
            // reads as a deliberate, tappable control sitting *on* the photo rather than a
            // strip glued to the bottom of the screen. Drag-up from here still opens the
            // sheet (same handleProps as the expanded header), a plain tap snaps it to "half".
            <button
              type="button"
              aria-label="Open chat"
              onClick={() => {
                if (!sheet.consumedDrag()) sheet.toggle();
              }}
              className={cn(
                "relative flex min-h-14 items-center gap-2.5 rounded-full pl-2.5 pr-5 shadow-[0_10px_32px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition-transform active:scale-[0.97]",
                styles.launcher
              )}
            >
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-violet">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <MessageCircle className="h-[18px] w-[18px] text-white" />
                )}
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[var(--color-surface-base)] bg-[var(--color-error,#ef4444)] px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className={cn("text-[13px] font-semibold", styles.headerTitle)}>
                  {compactChatLabel(branding.agentName)}
                </span>
                <span className={cn("flex items-center gap-1 text-[11px]", styles.headerMeta)}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
                  {branding.launcherLabel}
                </span>
              </span>
            </button>
          )}
        </div>

        {/* ── Messages + quick replies + input (only visible when expanded) ── */}
        {sheet.expanded && (
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
            {canShowQuickReplies && branding.quickReplies.length > 0 && (
              <div className="flex flex-wrap gap-2 shrink-0 px-3 pb-2">
                {branding.quickReplies.map((qr) => (
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
                placeholder={branding.inputPlaceholder}
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
                  "h-11 w-11 rounded-full gradient-brand text-[var(--color-brand-contrast)] flex items-center justify-center shrink-0 transition-all",
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
