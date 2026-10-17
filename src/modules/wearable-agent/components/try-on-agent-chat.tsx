"use client";

import * as React from "react";
import { ArrowUp, ChevronRight, GripVertical, MessageCircle, X } from "lucide-react";
import type { UseTryOnAgentReturn } from "../hooks/use-try-on-agent";
import type { ChatMessage, Product } from "@/modules/commerce/types";
import {
  ComposerAttachment,
  WearableChatMessage,
  WearableScanningIndicator,
  WearableTypingIndicator,
} from "./wearable-chat-message";
import { AvatarMannequinPanel } from "./avatar-mannequin-panel";
import { ProfileSwitcher } from "./profile-switcher";
import { useEmbedShopperSession } from "../hooks/embed-shopper-session";
import { useKeyboardInset } from "../hooks/use-keyboard-inset";
import { MAX_RENDERED_MESSAGES, takeLastMessages } from "../utils/chat-history";
import { CHAT_PANEL_SETTLE_MS, CHAT_PANEL_TRANSITION, MOBILE_SURFACE, NO_IOS_ZOOM_TEXT, SAFE_BOTTOM, SHEET_H } from "../mobile-surface";
import { AgentOrb } from "@/components/ui/agent-orb";
import { useVariantPicker } from "@/components/ui/variant-picker-popover";
import { cn } from "@/lib/utils/cn";
import type { PreviewViewportMode } from "./preview-viewport-toggle";
import { useWearableTheme, type WearableTheme } from "../theme-context";
import { useWearableBranding } from "../branding-context";
import { composerPlaceholder, useWidgetLocale, widgetStrings } from "../widget-strings";
import type { EmbedRuntimeConfig } from "../hooks/use-try-on-agent";
import type { TryOnProfile } from "../types";

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

/** Prefer in-memory bytes over an older revoked blob URL retained by a pre-fix session. */
function profilePhotoUrl(profile: TryOnProfile): string | null {
  return profile.photoBase64 && profile.photoMimeType
    ? `data:${profile.photoMimeType};base64,${profile.photoBase64}`
    : profile.photoUrl;
}

/** Long chats render only their newest messages until the shopper asks for the rest. */
function useVisibleMessages(messages: ChatMessage[]) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? messages : takeLastMessages(messages, MAX_RENDERED_MESSAGES);
  return { visible, hasEarlier: visible.length < messages.length, showEarlier: () => setShowAll(true) };
}

function ShowEarlierMessagesButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "text-xs rounded-full border px-3 py-1.5 hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-all",
          className ?? "border-[var(--color-border)] text-[var(--color-text-secondary)]"
        )}
      >
        Show earlier messages
      </button>
    </div>
  );
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
      onDelete={agent.removeProfile}
      onSignOut={shopper?.signOut}
    />
  );
}

function StyleChatPanel({ agent, outfitItemIds, compact = false, onAddToCart, embed }: StyleChatPanelProps) {
  const handleAddToCart = onAddToCart ?? agent.addToCart;
  const branding = useWearableBranding();
  const widgetLocale = useWidgetLocale();
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const cartItemIds = agent.cartItems.map((p) => p.id);
  // Quick replies are just a cold-start nudge — once the shopper has sent a real message,
  // showing them again below every subsequent turn is clutter, not a shortcut.
  const hasStartedChat = agent.messages.some((m) => m.role === "user");
  const canShowQuickReplies = !hasStartedChat && !agent.isScanning && !agent.isTyping && !agent.isGenerating;
  const chatBusy = agent.isTyping || agent.isScanning || agent.isReplying;
  const sendDisabled = agent.isTyping || agent.isGenerating || agent.isScanning || agent.isReplying;
  const messageList = useVisibleMessages(agent.messages);

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
        {messageList.hasEarlier && <ShowEarlierMessagesButton onClick={messageList.showEarlier} />}
        {messageList.visible.map((msg, idx) => {
          const msgProducts = (msg.productRecommendations ?? [])
            .map((id) => agent.knownProducts[id])
            .filter((p): p is NonNullable<typeof p> => !!p);
          return (
            <WearableChatMessage
              key={msg.id}
              message={msg}
              isLast={idx === messageList.visible.length - 1}
              userPhotoUrl={profilePhotoUrl(agent.profile)}
              inlineProducts={msgProducts.length > 0 ? msgProducts : undefined}
              outfitItemIds={outfitItemIds}
              cartItemIds={cartItemIds}
              pendingCartItemIds={agent.pendingCartItemIds}
              isGenerating={agent.isGenerating}
              onWearItem={agent.wearItem}
              onAddToCart={handleAddToCart}
              onRemoveFromCart={agent.removeFromCart}
              knownProducts={agent.knownProducts}
              attachedItemId={agent.attachment?.kind === "item" ? agent.attachment.product.id : null}
              attachedLookId={agent.attachment?.kind === "look" ? agent.attachment.look.id : null}
              isBusy={chatBusy}
              sendDisabled={sendDisabled}
              onRetry={msg.id === agent.retryMessageId ? agent.retryLastTurn : undefined}
              onAskAboutItem={agent.attachItem}
              onCompleteLook={agent.completeLook}
              onQuickOption={(label) => agent.sendMessage(label)}
              onRenderBundle={agent.wearBundle}
              onAddBundleToCart={agent.addBundleToCart}
              onRemoveBundleFromCart={agent.removeBundleFromCart}
              onAskAboutLook={agent.attachLook}
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
              dir="auto"
              onClick={() => agent.sendMessage(qr.query)}
              className="text-xs rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-all"
            >
              {qr.label}
            </button>
          ))}
        </div>
      )}

      {/* Input — what the shopper attached sits inside the composer, above the text field */}
      <div className={cn("border-t border-[var(--color-border)] flex flex-col gap-2.5 shrink-0", compact ? "px-3 py-3" : "px-5 py-4")}>
        {agent.attachment && (
          <ComposerAttachment attachment={agent.attachment} knownProducts={agent.knownProducts} onClear={agent.detach} />
        )}
        <div className="flex gap-2">
          <input
            dir="auto"
            className="flex-1 h-10 px-4 text-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-xl)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand)] transition-colors"
            placeholder={composerPlaceholder(widgetStrings(widgetLocale), agent.attachment?.kind, branding.inputPlaceholder)}
            value={agent.input}
            onChange={(e) => agent.setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agent.sendMessage()}
            disabled={sendDisabled}
          />
          <button
            type="button"
            onClick={() => agent.sendMessage()}
            disabled={!agent.input.trim() || sendDisabled}
            className={cn(
              "h-10 w-10 rounded-full gradient-brand text-[var(--color-brand-contrast)] flex items-center justify-center shrink-0 transition-all",
              "disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[var(--shadow-glow)]"
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile: avatar fills the frame, chat is a full-screen panel behind a side tab ───────────
interface MobileChatLayoutProps {
  agent: UseTryOnAgentReturn;
  outfitItemIds: string[];
  onAddToCart?: (product: Product) => void;
  onBulkAddToCart?: (product: Product) => void;
  embed?: EmbedRuntimeConfig;
  workspaceId?: string;
}

/** Two states, never a mix: the avatar with nothing over the body, or the chat over the whole
 *  screen. A tab on the left edge opens the chat; it slides in from the left and covers the
 *  avatar, and the close button (or tapping Wear) slides it away again. It opens by tap only —
 *  a swipe from the left edge is the browser's own "back" gesture on an iPhone. The panel stays
 *  mounted while closed, so the conversation, scroll position and half-typed message are all
 *  still there when it is reopened. */
function MobileChatLayout({ agent, outfitItemIds, onAddToCart, onBulkAddToCart, embed, workspaceId }: MobileChatLayoutProps) {
  const handleAddToCart = onAddToCart ?? agent.addToCart;
  const handleBulkAddToCart = onBulkAddToCart ?? agent.addToCart;
  const theme = useWearableTheme();
  const branding = useWearableBranding();
  const widgetLocale = useWidgetLocale();
  const strings = widgetStrings(widgetLocale);
  const panelBg = CHAT_PANEL_BG_BY_THEME[theme];
  const styles = MOBILE_SURFACE[theme];
  const keyboardInset = useKeyboardInset();
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const handleRemoveFromCart = agent.removeFromCart;

  const [open, setOpen] = React.useState(false);
  const [everOpened, setEverOpened] = React.useState(false);
  const [unread, setUnread] = React.useState(0);
  const openPanel = React.useCallback(() => {
    setOpen(true);
    setEverOpened(true);
    setUnread(0);
  }, []);
  const closePanel = React.useCallback(() => setOpen(false), []);
  // The tab shows over the avatar only: the live camera and the Details panels (reported by the
  // avatar panel) take the whole screen and the tab steps aside for them.
  const [tabHidden, setTabHidden] = React.useState(false);

  // Wearing something is about watching the avatar change, so the panel slides away the moment
  // Wear is pressed — for an item and for a whole bundle. The tab is there to bring it back.
  const wearItemAndClose = React.useCallback(
    (product: Product) => {
      setOpen(false);
      agent.wearItem(product);
    },
    [agent]
  );
  const wearBundleAndClose = React.useCallback(
    (productIds: string[]) => {
      setOpen(false);
      agent.wearBundle(productIds);
    },
    [agent]
  );

  const cartItemIds = agent.cartItems.map((p) => p.id);
  // Quick replies are just a cold-start nudge — once the shopper has sent a real message,
  // showing them again below every subsequent turn is clutter, not a shortcut.
  const hasStartedChat = agent.messages.some((m) => m.role === "user");
  const canShowQuickReplies = !hasStartedChat && !agent.isScanning && !agent.isTyping && !agent.isGenerating;
  const chatBusy = agent.isTyping || agent.isScanning || agent.isReplying;
  const sendDisabled = agent.isTyping || agent.isGenerating || agent.isScanning || agent.isReplying;
  const messageList = useVisibleMessages(agent.messages);

  // The two follow-ups below react to a change in the conversation by setting state while
  // rendering (the pattern React documents for "adjusting state when a prop changes"), not from
  // an effect, so the panel and the tab's badge are right on the very frame the message lands.
  const latestMessageId = agent.messages[agent.messages.length - 1]?.id ?? null;
  const [seenMessageId, setSeenMessageId] = React.useState(latestMessageId);
  if (latestMessageId !== seenMessageId) {
    setSeenMessageId(latestMessageId);
    // Wear slides the panel away to show the render; if the render then fails, the explanation
    // and its Retry button are in the chat, so the panel comes back for them.
    if (latestMessageId?.startsWith("msg-tryon-error-")) setOpen(true);
  }

  // While the panel is closed, replies are counted on the tab instead of stealing the screen,
  // so there is still a reason to look at it without forcing it open.
  const [seenCount, setSeenCount] = React.useState(agent.messages.length);
  if (agent.messages.length !== seenCount) {
    setSeenCount(agent.messages.length);
    const added = agent.messages.length - seenCount;
    if (!open && added > 0) setUnread((count) => count + added);
  }

  // The tab pulses a few seconds on a first visit so it is not mistaken for part of the page,
  // and stops for good once the shopper has opened the chat.
  const [hintDone, setHintDone] = React.useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setHintDone(true), 9_000);
    return () => window.clearTimeout(timer);
  }, []);
  const showHint = !open && !everOpened && !hintDone;

  // Scrolls the message list to the newest answer. A reply taller than the visible list is
  // aligned by its top, so the start of the answer and its first card are never cut off; any
  // other reply (and anything while the agent is still working) scrolls to the very end.
  const scrollMessages = React.useCallback((mode: "latest" | "end", behavior: ScrollBehavior) => {
    const list = messagesRef.current;
    if (!list) return;
    if (mode === "latest") {
      const nodes = list.querySelectorAll<HTMLElement>("[data-message-id]");
      const last = nodes[nodes.length - 1];
      if (last && last.dataset.messageRole === "assistant" && last.offsetHeight > list.clientHeight - 24) {
        const delta = last.getBoundingClientRect().top - list.getBoundingClientRect().top;
        list.scrollTo({ top: Math.max(0, list.scrollTop + delta - 8), behavior });
        return;
      }
    }
    list.scrollTo({ top: list.scrollHeight, behavior });
  }, []);

  // Runs once now and again when the panel's slide has finished: the first scroll is measured
  // while the panel is still moving, the second against the size it settled on.
  React.useEffect(() => {
    if (!open) return;
    const mode = agent.isTyping || agent.isScanning ? "end" : "latest";
    const frame = window.requestAnimationFrame(() => scrollMessages(mode, "smooth"));
    const settled = window.setTimeout(() => scrollMessages(mode, "smooth"), CHAT_PANEL_SETTLE_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settled);
    };
  }, [agent.messages, agent.isTyping, agent.isScanning, open, scrollMessages]);

  // "Ask about this" and "Complete the look" put a card above the composer, which shortens the
  // list under the shopper's thumb. Keep the end of the conversation in view instead of leaving
  // the card they tapped hidden behind it.
  const attachmentKey = agent.attachment
    ? agent.attachment.kind === "look"
      ? `look:${agent.attachment.look.id}`
      : `${agent.attachment.kind}:${agent.attachment.product.id}`
    : null;
  React.useEffect(() => {
    if (!attachmentKey) return;
    const frame = window.requestAnimationFrame(() => scrollMessages("end", "smooth"));
    const settled = window.setTimeout(() => scrollMessages("end", "smooth"), CHAT_PANEL_SETTLE_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settled);
    };
  }, [attachmentKey, scrollMessages]);

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden"
      // The avatar screen has no sheet to clear any more, only the home indicator: every control
      // layered over the avatar positions itself against this one variable.
      style={{ background: panelBg, "--sheet-h": "calc(env(safe-area-inset-bottom, 0px) + 8px)" } as React.CSSProperties}
    >
      {/* ── Layer 0: the avatar fills the whole frame. While the chat is open it is inert, so
           focus and screen readers stay in the panel that is covering it. ── */}
      <div className="absolute inset-0" inert={open} aria-hidden={open}>
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
          onChatTabHiddenChange={setTabHidden}
          embed={embed}
          workspaceId={workspaceId}
        />
      </div>

      {agent.cartSyncError && (
        <div
          className={cn("pointer-events-none absolute inset-x-0 z-50 flex justify-center px-4", open && "top-3")}
          style={open ? undefined : { bottom: `calc(${SHEET_H} + 10px)` }}
        >
          <div className="max-w-[90%] rounded-2xl bg-red-500/95 px-4 py-2.5 text-xs font-medium leading-relaxed text-white shadow-lg backdrop-blur-sm">
            {agent.cartSyncError}
          </div>
        </div>
      )}

      {/* ── Layer 1: the chat tab, on the left edge at mid-height. ── */}
      <button
        type="button"
        aria-label={strings.openChat}
        aria-expanded={open}
        aria-hidden={tabHidden}
        tabIndex={open || tabHidden ? -1 : 0}
        inert={tabHidden}
        onClick={openPanel}
        className={cn(
          "absolute left-0 top-1/2 z-[25] flex min-h-24 w-[52px] -translate-y-1/2 flex-col items-center justify-center gap-1.5 rounded-r-[22px] border border-l-0 py-3 pr-1 shadow-[0_10px_32px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
          "transition-[translate,opacity,scale] duration-300 ease-out motion-reduce:transition-none active:scale-95",
          styles.launcher,
          open || tabHidden ? "pointer-events-none -translate-x-full opacity-0" : "opacity-100"
        )}
      >
        {showHint && !tabHidden && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-r-[22px] border-2 border-[var(--color-brand)] opacity-60 motion-safe:animate-ping motion-reduce:hidden"
          />
        )}
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-violet">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <MessageCircle className="h-[18px] w-[18px] text-white" />
          )}
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[var(--color-surface-base)] bg-[var(--color-error,#ef4444)] px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        <span className={cn("text-[11px] font-semibold leading-none", styles.headerTitle)}>{strings.chatTab}</span>
        <ChevronRight className={cn("h-4 w-4", styles.headerMeta)} />
      </button>

      {/* ── Layer 2: the chat, a full-screen panel that slides in from the left. Always mounted,
           so the conversation is already laid out when it opens and nothing pops in at the end
           of the slide. While closed it is off-screen, inert and out of the tab order. ── */}
      <div
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "absolute inset-0 z-[30] flex flex-col",
          CHAT_PANEL_TRANSITION,
          open ? "translate-x-0 shadow-[8px_0_40px_rgba(0,0,0,0.35)]" : "-translate-x-full"
        )}
        style={{ background: panelBg }}
      >
        {/* Header — profile switcher where a logo would sit, the agent's branding in the
            middle, and the close button, which is the way back to the avatar. */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-b px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]",
            styles.panelBorder
          )}
        >
          <div className="flex min-w-0 flex-1 items-center justify-start">
            {embed && <ChatProfileSwitcher agent={agent} />}
          </div>
          <div className="flex min-w-0 shrink items-center gap-2">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : (
              <MessageCircle className="h-5 w-5 shrink-0 text-[var(--color-brand)]" />
            )}
            <span className={cn("truncate text-[15px] font-semibold", styles.headerTitle)}>
              {compactChatLabel(branding.agentName)}
            </span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end">
            <button
              type="button"
              aria-label={strings.closeChat}
              onClick={closePanel}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
                styles.panelClose
              )}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 scrollbar-none [-webkit-overflow-scrolling:touch]"
        >
          {messageList.hasEarlier && (
            <ShowEarlierMessagesButton onClick={messageList.showEarlier} className={styles.quickReply} />
          )}
          {messageList.visible.map((msg, idx) => {
            const msgProducts = (msg.productRecommendations ?? [])
              .map((id) => agent.knownProducts[id])
              .filter((p): p is NonNullable<typeof p> => !!p);
            return (
              <div key={msg.id} data-message-id={msg.id} data-message-role={msg.role}>
                <WearableChatMessage
                  message={msg}
                  paged
                  isLast={idx === messageList.visible.length - 1}
                  userPhotoUrl={profilePhotoUrl(agent.profile)}
                  inlineProducts={msgProducts.length > 0 ? msgProducts : undefined}
                  outfitItemIds={outfitItemIds}
                  cartItemIds={cartItemIds}
                  pendingCartItemIds={agent.pendingCartItemIds}
                  isGenerating={agent.isGenerating}
                  onWearItem={wearItemAndClose}
                  onAddToCart={handleAddToCart}
                  onRemoveFromCart={handleRemoveFromCart}
                  knownProducts={agent.knownProducts}
                  attachedItemId={agent.attachment?.kind === "item" ? agent.attachment.product.id : null}
                  attachedLookId={agent.attachment?.kind === "look" ? agent.attachment.look.id : null}
                  isBusy={chatBusy}
                  sendDisabled={sendDisabled}
                  onRetry={msg.id === agent.retryMessageId ? agent.retryLastTurn : undefined}
                  onAskAboutItem={agent.attachItem}
                  onCompleteLook={agent.completeLook}
                  onQuickOption={(label) => agent.sendMessage(label)}
                  onRenderBundle={wearBundleAndClose}
                  onAddBundleToCart={agent.addBundleToCart}
                  onRemoveBundleFromCart={agent.removeBundleFromCart}
                  onAskAboutLook={agent.attachLook}
                />
              </div>
            );
          })}
          {agent.isTyping && <WearableTypingIndicator stage={agent.typingStage} />}
          {agent.isScanning && <WearableScanningIndicator stageIndex={agent.scanStageIndex} resultCount={agent.scanResultCount} />}
        </div>

        {/* Quick replies */}
        {canShowQuickReplies && branding.quickReplies.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2 px-3 pb-2">
            {branding.quickReplies.map((qr) => (
              <button
                key={qr.label}
                type="button"
                dir="auto"
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

        {/* Input — lifted above the on-screen keyboard, and padded clear of the home indicator
            when there is no keyboard. What the shopper attached sits inside it, above the text
            field. */}
        <div
          className={cn("flex shrink-0 flex-col gap-2.5 border-t px-3 pt-3", styles.inputRow, !keyboardInset && SAFE_BOTTOM)}
          style={keyboardInset ? { paddingBottom: keyboardInset + 12 } : undefined}
        >
          {agent.attachment && (
            <ComposerAttachment
              attachment={agent.attachment}
              knownProducts={agent.knownProducts}
              onClear={agent.detach}
              tone={theme}
            />
          )}
          <div className="flex gap-2">
            <input
              dir="auto"
              className={cn(
                "h-11 min-w-0 flex-1 rounded-full border px-4 transition-colors focus:outline-none",
                NO_IOS_ZOOM_TEXT,
                styles.input
              )}
              placeholder={composerPlaceholder(strings, agent.attachment?.kind, branding.inputPlaceholder)}
              value={agent.input}
              onChange={(e) => agent.setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agent.sendMessage()}
              disabled={sendDisabled}
            />
            <button
              type="button"
              aria-label="Send message"
              onClick={() => agent.sendMessage()}
              disabled={!agent.input.trim() || sendDisabled}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full gradient-brand text-[var(--color-brand-contrast)] transition-all",
                "disabled:cursor-not-allowed disabled:opacity-40"
              )}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
