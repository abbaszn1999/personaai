"use client";

import * as React from "react";
import type { ChatMessage } from "@/modules/shopping-agent/types";
import type { AvatarVariation, OnboardingPhase, TryOnProfile } from "@/modules/wearable-agent/types";
import type { BundleSuggestion, Product } from "@/modules/shopping-agent/types";
import type { IntakeState, WearableAgentEvent } from "@/lib/agents/wearable/persona";
import type { BundleState } from "@/lib/retrieval/types";
import { mergeRetrievalState, type RetrievalState } from "../utils/retrieval-state";
import { useGeminiApiKey } from "@/modules/billing/hooks/use-gemini-api-key";
import { AVATAR_GENERATION_STAGES } from "../constants";
import { INITIAL_WEARABLE_MESSAGE, SCAN_STAGE_DURATION_MS, SCAN_STAGES } from "../mocks/responses";
import {
  recommendSizesForProducts,
  buildFitNote,
  mergeGarmentIntoOutfit,
} from "@/lib/recommendations";
import { getOrCreateEmbedSessionId, loadEmbedState, saveEmbedState } from "@/lib/embed/client/embed-storage";
import { addItemToWooCommerceCart } from "@/lib/woocommerce/store-api-client";
import { addItemToShopifyCart } from "@/lib/shopify/ajax-cart-client";

const GENERIC_AVATAR_ERROR = "We couldn't generate your avatar. Please try again.";
const GENERIC_TRYON_ERROR = "Sorry, I couldn't generate your try-on preview. Please try again.";
const GENERIC_CHAT_ERROR = "Sorry, something went wrong on my end. Please try that again.";

/** Passed only when this hook is powering the public, no-login `/embed/[token]` page or
 *  widget.js — swaps every `/api/agents/*` call for its public `/api/embed/*` counterpart and
 *  includes the embed token (plus a per-shopper session id) on every request. */
export interface EmbedRuntimeConfig {
  apiBase: string;
  embedToken: string;
  /** Only true for the real `widget.js` snippet running on the merchant's own site — where
   *  "add to cart" can actually mutate the shopper's real WooCommerce cart (see
   *  store-api-client.ts for why that only works there and not on this app's own domain). */
  enableRealCart?: boolean;
}

/** Shape persisted to localStorage for an embedded session — deliberately a subset of the
 *  full in-memory state (no loading/animation flags, nothing already derivable from a fetch). */
interface PersistedEmbedState {
  profile: TryOnProfile;
  profileSubmitted: boolean;
  messages: ChatMessage[];
  outfitItems: Product[];
  cartItems: Product[];
  intakeAnswers: IntakeState;
  knownProducts: Record<string, Product>;
  tryOnImages: GeneratedTryOn[];
  currentImageIndex: number;
  selectedAvatarId: string | null;
  /** The pinned product survives a reload for the same reason the messages do — the shopper can
   *  see it, so losing it silently reads as the widget forgetting what they were discussing. */
  selectedAnchor: Product | null;
}

interface TryOnApiResponse {
  imageUrl?: string;
  error?: string;
}

/** Resolves a possibly-relative image URL to an absolute one the server can fetch;
 *  `data:` URLs are already self-contained and passed through unchanged. */
function toAbsoluteImageUrl(url: string): string {
  if (url.startsWith("data:")) return url;
  return new URL(url, window.location.origin).toString();
}

/** Rewrites root-relative asset paths (e.g. `/avatars/backgrounds/backdrop-1.png`, returned
 *  as-is by the server) to absolute URLs against the widget's real origin. Only matters for
 *  `widget.js` running inside a merchant's Shadow DOM — there, a bare `/avatars/...` `<img>`
 *  src resolves against the *host page's* origin instead of ours, rendering as a broken image.
 *  A no-op everywhere else (dashboard, and the same-origin `/embed/[token]` page). */
function resolveEmbedAssetUrl(url: string | null | undefined, embed?: EmbedRuntimeConfig): string | undefined {
  if (!url || !embed) return url ?? undefined;
  if (/^(data:|blob:|https?:\/\/)/.test(url)) return url;
  try {
    const origin = new URL(embed.apiBase, window.location.href).origin;
    return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
  } catch {
    return url;
  }
}

/**
 * Streams avatar variations from the server as SSE, calling `onVariation` the moment each one
 * finishes (rather than waiting for the whole batch) so the caller can show real progress and
 * reveal results incrementally. Gemini image calls can easily take 30s-2min+ each — one silent
 * blocking request for the whole batch is exactly the kind of thing some proxies/tunnels kill
 * before it ever resolves, on top of leaving the shopper staring at a static bar the whole time.
 */
async function streamAvatarVariations(
  profile: TryOnProfile,
  embed: EmbedRuntimeConfig | undefined,
  onVariation: (variation: AvatarVariation) => void,
  count?: number
): Promise<{ successCount: number } | { error: string }> {
  try {
    const res = await fetch(embed ? `${embed.apiBase}/persona/avatar` : "/api/agents/persona/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(embed ? { embedToken: embed.embedToken } : {}),
        photoBase64: profile.photoBase64,
        photoMimeType: profile.photoMimeType,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        chestCm: profile.chestCm,
        waistCm: profile.waistCm,
        shoeSizeEu: profile.shoeSizeEu,
        ...(count ? { count } : {}),
      }),
    });

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      return { error: data.error || GENERIC_AVATAR_ERROR };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let successCount = 0;
    let errorMessage: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { events, rest } = parseSseChunk<AvatarStreamEvent>(buffer);
      buffer = rest;

      for (const event of events) {
        if (event.type === "variation") {
          successCount += 1;
          onVariation({
            ...event.variation,
            imageUrl: resolveEmbedAssetUrl(event.variation.imageUrl, embed) ?? event.variation.imageUrl,
            backdropUrl: resolveEmbedAssetUrl(event.variation.backdropUrl, embed),
          });
        } else if (event.type === "error") {
          errorMessage = event.message;
        } else if (event.type === "done") {
          successCount = event.successCount;
        }
        // "variation_error" — a single style failing is expected/tolerated, nothing to surface.
      }
    }

    if (successCount === 0) {
      return { error: errorMessage || GENERIC_AVATAR_ERROR };
    }
    return { successCount };
  } catch {
    return { error: GENERIC_AVATAR_ERROR };
  }
}

const INITIAL_PROFILE: TryOnProfile = {
  photoUrl: null,
  photoBase64: null,
  photoMimeType: null,
  heightCm: null,
  weightKg: null,
  shoeSizeEu: null,
  chestCm: null,
  waistCm: null,
  hipsCm: null,
  avatarUrl: null,
  backdropUrl: null,
};

// A generated try-on snapshot
export interface GeneratedTryOn {
  id: string;
  imageUrl: string;
  outfitProducts: Product[];
  recommendedSizes: Record<string, string>;
  fitNotes: string;
  createdAt: string;
}

/** `thinking` covers the opening stretch before any tool has run, which is short. */
export type TypingStage = "thinking" | "searching" | "composing";

interface TryOnAgentState {
  profile: TryOnProfile;
  onboardingPhase: OnboardingPhase;
  profileSubmitted: boolean;
  generationProgress: number;
  generationStageIndex: number;
  avatarVariations: AvatarVariation[];
  /** Set when the real avatar generation request fails — cleared on the next attempt. */
  avatarGenerationError: string | null;
  selectedAvatarId: string | null;
  customAvatarUrl: string | null;
  messages: ChatMessage[];
  outfitItems: Product[];
  input: string;
  isTyping: boolean;
  /** What the agent is actually doing behind the typing indicator, so a turn that takes half a
   *  minute says which half it is in rather than showing the same three dots throughout. Driven
   *  entirely by real events — never a timer. */
  typingStage: TypingStage;
  isGenerating: boolean;
  isRegeneratingAvatar: boolean;
  tryOnImages: GeneratedTryOn[];
  currentImageIndex: number;
  cartItems: Product[];
  /** IDs currently mid-flight to the real store cart — surfaced so buttons can show a spinner
   *  instead of looking silently stuck during a slow (but working) sync. */
  pendingCartItemIds: string[];
  /** Preferences the chat agent has picked up conversationally (occasion/style/budget) — no
   *  longer driven by a fixed question stepper, just accumulated from record_intake_field
   *  tool calls as the shopper naturally mentions them. */
  intakeAnswers: IntakeState;
  isScanning: boolean;
  scanStageIndex: number;
  /** Real match count from the most recent search_catalog call, shown in place of the last
   *  cosmetic scanning stage once it resolves — null while no results have landed yet. */
  scanResultCount: number | null;
  /** Live products the agent has actually found via search_catalog this session, keyed by
   *  id — replaces the static mock catalog as the source of truth for anything the chat
   *  references (inline suggestion cards, bundles, "wear it"/"add to cart" resolution). */
  knownProducts: Record<string, Product>;
  /** The product the shopper picked with Select, shown pinned above the composer. Distinct from
   *  the server's own inferred anchor, which is never surfaced: this one they chose and can see,
   *  so it has to survive turns that resolve no anchor of their own. */
  selectedAnchor: Product | null;
  /** The outfit the shopper picked with "Discuss this bundle". Held as rendering state, not only
   *  in `retrievalStateRef`, because pinning a whole outfit has to be as visible as pinning a
   *  single product is — a control that changes what the next answer is about while leaving the
   *  screen identical is indistinguishable from a dead button. */
  discussedBundle: BundleSuggestion | null;
  isUploadingBackdrop: boolean;
  /** Set when a custom backdrop upload fails — cleared on the next attempt. */
  backdropUploadError: string | null;
  /** Transient — set when a real WooCommerce cart sync (widget.js only) fails, auto-clears
   *  after a few seconds. The local `cartItems` add always succeeds regardless, so the
   *  widget's own UI never looks broken even when the real store sync fails. */
  cartSyncError: string | null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProfileComplete(profile: TryOnProfile): boolean {
  return (
    !!profile.photoUrl &&
    profile.heightCm !== null &&
    profile.heightCm > 0 &&
    profile.weightKg !== null &&
    profile.weightKg > 0 &&
    profile.chestCm !== null &&
    profile.chestCm > 0 &&
    profile.waistCm !== null &&
    profile.waistCm > 0 &&
    profile.shoeSizeEu !== null &&
    profile.shoeSizeEu > 0
  );
}

/** Parses one `\n\n`-delimited SSE chunk buffer into whole `data:` frames, returning the
 *  parsed events plus whatever incomplete tail should be carried over to the next read. */
function parseSseChunk<T>(buffer: string): { events: T[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events: T[] = [];

  for (const frame of frames) {
    const line = frame.trim();
    if (!line.startsWith("data:")) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()) as T);
    } catch {
      // Ignore malformed frames rather than breaking the whole stream.
    }
  }

  return { events, rest };
}

/** SSE events emitted by `/api/agents/persona/avatar` and `/api/embed/persona/avatar` — see
 *  generateAvatarVariationsStream for why these stream in one at a time instead of arriving
 *  as one big JSON response. */
/**
 * The events that put something on screen the shopper can read. Everything else a turn emits is
 * bookkeeping, and treating it as an arrival is what made the chat look dead mid-turn.
 *
 * `product_recommendations` and `bundle` are in here even though both arrive after the closing
 * text has already cleared the indicator — they are genuinely visible, and a turn that ever
 * yields one without text should still end the wait.
 */
const SHOPPER_VISIBLE_EVENTS = new Set<WearableAgentEvent["type"]>([
  "text",
  "bundle",
  "product_recommendations",
  "try_on",
  "error",
]);

type AvatarStreamEvent =
  | { type: "variation"; variation: AvatarVariation; creditsRemaining: number }
  | { type: "variation_error"; label: string; message: string }
  | { type: "error"; message: string }
  | { type: "done"; successCount: number; creditsRemaining: number };

export function useTryOnAgent(embed?: EmbedRuntimeConfig, welcomeMessage?: string, workspaceId?: string) {
  // The embedded page has no shopper login, so there's no `/api/account/api-key` to check —
  // the server already guarantees the merchant has one configured before enabling the embed.
  const geminiKey = useGeminiApiKey(!embed);

  const persisted = embed ? loadEmbedState<PersistedEmbedState>(embed.embedToken) : null;

  const [state, setState] = React.useState<TryOnAgentState>({
    profile: persisted?.profile ?? INITIAL_PROFILE,
    onboardingPhase: "profile",
    profileSubmitted: persisted?.profileSubmitted ?? false,
    generationProgress: 0,
    generationStageIndex: 0,
    avatarVariations: [],
    avatarGenerationError: null,
    selectedAvatarId: persisted?.selectedAvatarId ?? null,
    customAvatarUrl: null,
    messages: persisted?.messages ?? [],
    outfitItems: persisted?.outfitItems ?? [],
    input: "",
    isTyping: false,
    typingStage: "thinking",
    isGenerating: false,
    isRegeneratingAvatar: false,
    tryOnImages: persisted?.tryOnImages ?? [],
    currentImageIndex: persisted?.currentImageIndex ?? 0,
    cartItems: persisted?.cartItems ?? [],
    pendingCartItemIds: [],
    intakeAnswers: persisted?.intakeAnswers ?? {},
    isScanning: false,
    scanStageIndex: 0,
    scanResultCount: null,
    knownProducts: persisted?.knownProducts ?? {},
    selectedAnchor: persisted?.selectedAnchor ?? null,
    discussedBundle: null,
    isUploadingBackdrop: false,
    backdropUploadError: null,
    cartSyncError: null,
  });

  const generationTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const scanTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const customAvatarUrlRef = React.useRef<string | null>(null);
  const selectedAvatarIdRef = React.useRef<string | null>(null);
  /** Stable per-shopper id for embedded sessions — lets the server key its ephemeral avatar
   *  cache per-browser instead of per-merchant (many shoppers can share one embed token). */
  const embedSessionIdRef = React.useRef<string | null>(
    embed ? getOrCreateEmbedSessionId(embed.embedToken) : null
  );
  /** Per-tab session id for the dashboard's own authenticated preview — chat events logged from
   *  here go through /api/agents/chat-event instead of the public embed endpoint (see
   *  logChatEvent). Doesn't need to persist across reloads like the embed session id does. */
  const dashboardSessionIdRef = React.useRef<string | null>(null);
  if (!embed && dashboardSessionIdRef.current === null) {
    dashboardSessionIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  /** Last avatarUrl we successfully shipped to the wearable agent — subsequent turns omit the
   *  (often multi-MB) data URL so the request stays under Next's body size limit. */
  const lastSentAvatarUrlRef = React.useRef<string | null>(null);

  const outfitRef = React.useRef<Product[]>(state.outfitItems);
  const profileRef = React.useRef<TryOnProfile>(state.profile);
  const intakeAnswersRef = React.useRef<IntakeState>(state.intakeAnswers);
  const knownProductsRef = React.useRef<Record<string, Product>>(state.knownProducts);
  const messagesRef = React.useRef<ChatMessage[]>(state.messages);
  /** Retrieval's cross-turn memory, echoed straight back to the server next turn. A ref rather
   *  than state: nothing renders from it, and it must be current the moment a turn starts. */
  const retrievalStateRef = React.useRef<RetrievalState>({
    anchorId: persisted?.selectedAnchor?.id ?? null,
    anchorPinned: persisted?.selectedAnchor != null,
    bundleState: null,
    shownProductIds: [],
  });
  // Serializes every real-cart mutation (across separate "Add to Cart" clicks, not just
  // products within one click) so they never hit the store's cart endpoint concurrently — see
  // syncProductsToRealCart for why that matters.
  const cartSyncQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  React.useEffect(() => {
    outfitRef.current = state.outfitItems;
    profileRef.current = state.profile;
    intakeAnswersRef.current = state.intakeAnswers;
    knownProductsRef.current = state.knownProducts;
    messagesRef.current = state.messages;
  }, [state.outfitItems, state.profile, state.intakeAnswers, state.knownProducts, state.messages]);

  React.useEffect(() => {
    customAvatarUrlRef.current = state.customAvatarUrl;
    return () => {
      if (customAvatarUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(customAvatarUrlRef.current);
      }
    };
  }, [state.customAvatarUrl]);

  React.useEffect(() => {
    selectedAvatarIdRef.current = state.selectedAvatarId;
  }, [state.selectedAvatarId]);

  React.useEffect(() => {
    return () => {
      if (generationTimerRef.current) clearInterval(generationTimerRef.current);
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };
  }, []);

  // Mirror the shopper-relevant slice of state into localStorage so an embedded session
  // survives a page reload without any login — this app is already fully client-state-driven
  // server-side, so this is a persistence wrapper, not a new state architecture.
  React.useEffect(() => {
    if (!embed) return;
    const snapshot: PersistedEmbedState = {
      profile: state.profile,
      profileSubmitted: state.profileSubmitted,
      messages: state.messages,
      outfitItems: state.outfitItems,
      cartItems: state.cartItems,
      intakeAnswers: state.intakeAnswers,
      knownProducts: state.knownProducts,
      tryOnImages: state.tryOnImages,
      currentImageIndex: state.currentImageIndex,
      selectedAvatarId: state.selectedAvatarId,
      selectedAnchor: state.selectedAnchor,
    };
    saveEmbedState(embed.embedToken, snapshot);
  }, [
    embed,
    state.profile,
    state.profileSubmitted,
    state.messages,
    state.outfitItems,
    state.cartItems,
    state.intakeAnswers,
    state.knownProducts,
    state.selectedAnchor,
    state.tryOnImages,
    state.currentImageIndex,
    state.selectedAvatarId,
  ]);

  /** Flushes `cartItems` to localStorage synchronously, bypassing the reactive effect above.
   *  Needed because adding to a real Shopify cart can now trigger a same-tick page reload (the
   *  Standard Storefront Action's default fallback on themes that don't support an in-place
   *  refresh — see addItemToShopifyCart) — if that reload lands before React's effect has had a
   *  chance to run, the just-added item's "in cart" state would otherwise never make it to
   *  localStorage and would appear lost after the reload even though the real cart mutation may
   *  have already succeeded. Every other field is read from whatever's already fresh (refs, or
   *  the calling render's `state` closure) since none of them race with this. */
  function persistCartItemsNow(nextCartItems: Product[]) {
    if (!embed) return;
    saveEmbedState<PersistedEmbedState>(embed.embedToken, {
      profile: profileRef.current,
      profileSubmitted: state.profileSubmitted,
      messages: messagesRef.current,
      outfitItems: outfitRef.current,
      cartItems: nextCartItems,
      intakeAnswers: intakeAnswersRef.current,
      knownProducts: knownProductsRef.current,
      tryOnImages: state.tryOnImages,
      currentImageIndex: state.currentImageIndex,
      selectedAvatarId: state.selectedAvatarId,
      selectedAnchor: state.selectedAnchor,
    });
  }

  function updateProfile(patch: Partial<TryOnProfile>) {
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  }

  function startAvatarGeneration() {
    if (!isProfileComplete(state.profile)) return;

    if (generationTimerRef.current) clearInterval(generationTimerRef.current);

    setState((s) => ({
      ...s,
      onboardingPhase: "generating",
      generationProgress: 0,
      generationStageIndex: 0,
      avatarVariations: [],
      avatarGenerationError: null,
    }));

    // The first few stages ("analyzing photo", "mapping measurements", "building body model")
    // are purely cosmetic scene-setting with no real signal to drive them — a short fake timer
    // covers those. Past that point, progress is driven by real variations actually streaming
    // back from the server (see streamAvatarVariations), so the bar never lies about a
    // multi-minute wait by pretending to be done at a fixed, made-up duration.
    const PREAMBLE_STAGE_COUNT = 3;
    const PREAMBLE_CAP = AVATAR_GENERATION_STAGES[PREAMBLE_STAGE_COUNT - 1].progress;
    const PREAMBLE_DURATION_MS = 2400;
    const startedAt = Date.now();

    const stopTimer = () => {
      if (generationTimerRef.current) clearInterval(generationTimerRef.current);
      generationTimerRef.current = null;
    };

    generationTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(PREAMBLE_CAP, (elapsed / PREAMBLE_DURATION_MS) * PREAMBLE_CAP);

      let stageIndex = 0;
      for (let i = PREAMBLE_STAGE_COUNT - 1; i >= 0; i--) {
        if (progress >= AVATAR_GENERATION_STAGES[i].progress) {
          stageIndex = i;
          break;
        }
      }

      if (progress >= PREAMBLE_CAP) stopTimer();

      setState((s) =>
        s.onboardingPhase === "generating"
          ? { ...s, generationProgress: progress, generationStageIndex: stageIndex }
          : s
      );
    }, 50);

    let receivedAny = false;

    // All 4 Gemini calls already fire in parallel (see generateAvatarVariationsStream) — the
    // remaining wait is each call's own latency, not a concurrency limit on our side. So rather
    // than making the shopper wait for the *slowest* of the 4 to finish before they can do
    // anything, unlock the picker screen the moment the *first* one lands; the other 2-3 just
    // keep streaming in and appending to the grid behind it (see the `!isFirst` branch below).
    void streamAvatarVariations(state.profile, embed, (variation) => {
      const isFirst = !receivedAny;
      receivedAny = true;
      if (isFirst) stopTimer();

      setState((s) => {
        const avatarVariations = [...s.avatarVariations, variation];
        if (isFirst && s.onboardingPhase === "generating") {
          return {
            ...s,
            onboardingPhase: "avatar-selection",
            generationProgress: 100,
            generationStageIndex: AVATAR_GENERATION_STAGES.length - 1,
            avatarVariations,
            selectedAvatarId: variation.id,
          };
        }
        return { ...s, avatarVariations };
      });
    }).then((result) => {
      stopTimer();

      // Only a real failure if literally nothing came back — if at least one variation
      // already landed and unlocked the picker, a later straggler failing is a non-event.
      if ("error" in result && !receivedAny) {
        setState((s) => ({ ...s, onboardingPhase: "profile", avatarGenerationError: result.error, avatarVariations: [] }));
      }
    });
  }

  function selectAvatar(id: string) {
    setState((s) => ({ ...s, selectedAvatarId: id }));
  }

  function uploadCustomAvatar(file: File) {
    const url = URL.createObjectURL(file);
    setState((s) => {
      if (s.customAvatarUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(s.customAvatarUrl);
      }
      return {
        ...s,
        customAvatarUrl: url,
        selectedAvatarId: "custom",
      };
    });
  }

  function confirmAvatar() {
    setState((s) => {
      const selectedVariation = s.avatarVariations.find((v) => v.id === s.selectedAvatarId);
      const avatarUrl = s.selectedAvatarId === "custom" ? s.customAvatarUrl : selectedVariation?.imageUrl ?? null;
      const backdropUrl = s.selectedAvatarId === "custom" ? null : selectedVariation?.backdropUrl ?? null;
      lastSentAvatarUrlRef.current = null;

      return {
        ...s,
        profileSubmitted: true,
        onboardingPhase: "profile",
        profile: { ...s.profile, avatarUrl, backdropUrl },
        messages: [
          welcomeMessage
            ? { ...INITIAL_WEARABLE_MESSAGE, content: welcomeMessage }
            : INITIAL_WEARABLE_MESSAGE,
        ],
      };
    });
  }

  /** Swaps the fixed backdrop plate rendered behind the avatar cutout — either one of the
   *  4 studio plates or a previously-uploaded custom backdrop URL. */
  function changeBackdrop(url: string) {
    setState((s) => ({ ...s, profile: { ...s.profile, backdropUrl: url } }));
  }

  /** Uploads a custom background photo. Stored server-side in a process-memory-only cache
   *  (see backdrop-cache.ts) — deliberately temporary, gone on the next server restart. */
  async function uploadCustomBackdrop(file: File) {
    // Custom backdrop uploads aren't part of the public embed API surface yet (Phase 2 only
    // covers chat/avatar/try-on) — decline gracefully rather than hitting an authenticated,
    // cookie-based route that would 401 for an anonymous shopper.
    if (embed) {
      setState((s) => ({
        ...s,
        backdropUploadError: "Custom backgrounds aren't available in this embedded widget yet — pick one of the presets instead.",
      }));
      return;
    }

    setState((s) => ({ ...s, isUploadingBackdrop: true, backdropUploadError: null }));

    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
      if (!match) throw new Error("Couldn't read that image file.");
      const [, mimeType, imageBase64] = match;

      const res = await fetch("/api/uploads/backdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      const data: { url?: string; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to upload background. Please try again.");
      }

      setState((s) => ({
        ...s,
        isUploadingBackdrop: false,
        profile: { ...s.profile, backdropUrl: data.url! },
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isUploadingBackdrop: false,
        backdropUploadError: err instanceof Error ? err.message : "Failed to upload background. Please try again.",
      }));
    }
  }

  function setInput(input: string) {
    setState((s) => ({ ...s, input }));
  }

  /** Applies new measurements and re-derives the standing avatar to match — used
   *  from the "Edit" popup on the Model Stats card once the shopper is already chatting.
   *  The shopper's fixed backdrop plate stays as-is — only the subject cutout changes. */
  async function regenerateAvatar(patch: Partial<TryOnProfile>) {
    setState((s) => ({
      ...s,
      profile: { ...s.profile, ...patch },
      isRegeneratingAvatar: true,
    }));

    // A custom-uploaded photo isn't AI-generated, so there's nothing to regenerate — just
    // acknowledge the new measurements were saved.
    if (selectedAvatarIdRef.current === "custom" && customAvatarUrlRef.current) {
      await sleep(1200);
      setState((s) => ({
        ...s,
        isRegeneratingAvatar: false,
        messages: [
          ...s.messages,
          {
            id: `msg-regen-${Date.now()}`,
            role: "assistant",
            content: "Got it — I've saved your updated measurements and refreshed your fit analysis and size recommendations!",
            timestamp: new Date().toISOString(),
          },
        ],
      }));
      return;
    }

    const nextProfile = { ...profileRef.current, ...patch };
    let regeneratedVariation: AvatarVariation | null = null;
    const result = await streamAvatarVariations(
      nextProfile,
      embed,
      (variation) => {
        regeneratedVariation = variation;
      },
      1
    );

    setState((s) => {
      if ("error" in result) {
        return {
          ...s,
          isRegeneratingAvatar: false,
          messages: [
            ...s.messages,
            {
              id: `msg-regen-error-${Date.now()}`,
              role: "assistant",
              content: result.error,
              timestamp: new Date().toISOString(),
            },
          ],
        };
      }

      const nextAvatarUrl = regeneratedVariation?.imageUrl ?? s.profile.avatarUrl;
      // Force the next chat turn to re-upload the new avatar to the server cache.
      lastSentAvatarUrlRef.current = null;
      const confirmMsg: ChatMessage = {
        id: `msg-regen-${Date.now()}`,
        role: "assistant",
        content:
          "I've updated your avatar with your new measurements — fit analysis and size recommendations are refreshed too!",
        timestamp: new Date().toISOString(),
      };

      return {
        ...s,
        isRegeneratingAvatar: false,
        profile: { ...s.profile, avatarUrl: nextAvatarUrl },
        messages: [...s.messages, confirmMsg],
      };
    });
  }

  async function generateTryOn(productsOverride?: Product[]) {
    const items = productsOverride ?? outfitRef.current;
    if (items.length === 0) return;

    setState((s) => ({ ...s, isGenerating: true }));

    const profile = profileRef.current;
    const avatarImageUrl = profile.avatarUrl;

    if (!avatarImageUrl) {
      setState((s) => ({
        ...s,
        isGenerating: false,
        messages: [
          ...s.messages,
          {
            id: `msg-tryon-error-${Date.now()}`,
            role: "assistant",
            content: GENERIC_TRYON_ERROR,
            timestamp: new Date().toISOString(),
          },
        ],
      }));
      return;
    }

    let imageUrl: string;
    try {
      const res = await fetch(embed ? `${embed.apiBase}/persona/try-on` : "/api/agents/persona/try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(embed ? { embedToken: embed.embedToken } : {}),
          avatarImageUrl: toAbsoluteImageUrl(avatarImageUrl),
          garmentImageUrls: items.map((p) => toAbsoluteImageUrl(p.imageUrl)),
        }),
      });
      const data: TryOnApiResponse = await res.json().catch(() => ({}));
      if (!res.ok || !data.imageUrl) {
        throw new Error(data.error || GENERIC_TRYON_ERROR);
      }
      imageUrl = data.imageUrl;
    } catch (err) {
      setState((s) => ({
        ...s,
        isGenerating: false,
        messages: [
          ...s.messages,
          {
            id: `msg-tryon-error-${Date.now()}`,
            role: "assistant",
            content: err instanceof Error ? err.message : GENERIC_TRYON_ERROR,
            timestamp: new Date().toISOString(),
          },
        ],
      }));
      return;
    }

    const recSizes = recommendSizesForProducts(
      {
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        chestCm: profile.chestCm,
        waistCm: profile.waistCm,
        shoeSizeEu: profile.shoeSizeEu,
        photoBase64: profile.photoBase64,
        photoMimeType: profile.photoMimeType,
        avatarUrl: profile.avatarUrl,
        isCustomAvatar: selectedAvatarIdRef.current === "custom",
      },
      items
    );

    const fitNotes = buildFitNote({
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      chestCm: profile.chestCm,
      waistCm: profile.waistCm,
      shoeSizeEu: profile.shoeSizeEu,
      photoBase64: profile.photoBase64,
      photoMimeType: profile.photoMimeType,
      avatarUrl: profile.avatarUrl,
      isCustomAvatar: selectedAvatarIdRef.current === "custom",
    });

    const snapshot: GeneratedTryOn = {
      id: `tryon-${Date.now()}`,
      imageUrl,
      outfitProducts: [...items],
      recommendedSizes: recSizes,
      fitNotes,
      createdAt: new Date().toISOString(),
    };

    const imageMsg: ChatMessage = {
      id: `msg-tryon-${Date.now()}`,
      role: "assistant",
      content: `Here's your virtual try-on preview! The outfit looks great on your profile. I've included personalized size recommendations for each item below.`,
      timestamp: new Date().toISOString(),
      tryOnImage: {
        imageUrl,
        items: items.map((p) => ({ productId: p.id, name: p.name, selectedVariant: recSizes[p.id] })),
        recommendedSizes: recSizes,
        fitNotes,
      },
    };

    setState((s) => ({
      ...s,
      isGenerating: false,
      tryOnImages: [...s.tryOnImages, snapshot],
      currentImageIndex: s.tryOnImages.length,
      messages: [...s.messages, imageMsg],
    }));
    logTryOnEvent(snapshot.outfitProducts, recSizes);
  }

  /** Fire-and-forget log of one chat turn — the shopper (or, for the dashboard's own preview,
   *  the merchant testing their workspace) already sent/saw it, this just tells the
   *  usage/analytics dashboards it happened. Embedded surfaces (preview link or real widget.js)
   *  go through the public `/api/embed/chat-event`; the dashboard's own authenticated preview
   *  goes through `/api/agents/chat-event` instead, keyed by workspaceId rather than an embed
   *  token — silently no-ops if neither is available (e.g. no workspaceId was ever passed in). */
  function logChatEvent(role: "user" | "assistant", topic?: string | null) {
    if (embed) {
      const sessionId = getOrCreateEmbedSessionId(embed.embedToken);
      void fetch(`${embed.apiBase}/chat-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedToken: embed.embedToken, sessionId, role, topic }),
      }).catch(() => {});
      return;
    }
    if (!workspaceId || !dashboardSessionIdRef.current) return;
    void fetch("/api/agents/chat-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, sessionId: dashboardSessionIdRef.current, role, topic }),
    }).catch(() => {});
  }

  function stopScanTicker() {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }

  /** Runs only for the server's explicit `activity: "bundle"` signal. Unlike the old behavior,
   * a generic search_catalog tool start cannot trigger this because that tool also handles
   * question-only intake turns where no catalog retrieval occurs. */
  function startBundleProgressTicker() {
    if (scanTimerRef.current) return;
    setState((s) => ({ ...s, isTyping: false, isScanning: true, scanStageIndex: 0, scanResultCount: null }));
    scanTimerRef.current = setInterval(() => {
      setState((s) => ({ ...s, scanStageIndex: Math.min(s.scanStageIndex + 1, SCAN_STAGES.length - 1) }));
    }, SCAN_STAGE_DURATION_MS);
  }

  /** Sends one turn to the real Wearable Chat Agent and streams the response, applying each
   *  SSE event to local state as it arrives — replaces the old keyword-matched mock reply. */
  async function streamChatTurn(history: ChatMessage[]) {
    setState((s) => ({ ...s, isTyping: true, typingStage: "thinking" }));

    const profile = profileRef.current;
    let assistantMessageId: string | null = null;
    // Retrieval may determine the allowed answers before the persona has written the question.
    // Hold them until the first text arrives; rendering them immediately creates the empty
    // assistant bubble seen during intake-only turns.
    let pendingQuickOptions: string[] | null = null;
    let sawAnyEvent = false;

    const ensureAssistantMessage = () => {
      if (assistantMessageId) return;
      assistantMessageId = `msg-${Date.now()}`;
      const id = assistantMessageId;
      setState((s) => ({
        ...s,
        messages: [...s.messages, { id, role: "assistant", content: "", timestamp: new Date().toISOString() }],
      }));
    };

    const patchAssistantMessage = (patch: Partial<ChatMessage>) => {
      ensureAssistantMessage();
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) => (m.id === assistantMessageId ? { ...m, ...patch } : m)),
      }));
    };

    const mergeKnownProducts = (products: Product[]) => {
      if (products.length === 0) return;
      setState((s) => {
        const next = { ...s.knownProducts };
        for (const product of products) next[product.id] = product;
        // Keep the ref in sync immediately so later events in the same SSE turn
        // (try_on / wearBundle) can resolve products without waiting for a re-render.
        knownProductsRef.current = next;
        return { ...s, knownProducts: next };
      });
    };

    try {
      // Keep the chat payload lean. Sending photoBase64 + avatar data URLs + try-on image
      // data on every turn exceeded Next.js's default 10MB body limit, which truncated the
      // JSON mid-parse — the model then saw empty/broken history and replied with generic
      // "Hi, I'm your Style Assistant" intros as if the conversation had just started.
      const avatarUrl = profile.avatarUrl;
      const shouldSendAvatar =
        !!avatarUrl &&
        (avatarUrl.startsWith("data:") ? lastSentAvatarUrlRef.current !== avatarUrl : true);

      const slimHistory = history.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        productRecommendations: m.productRecommendations,
        retrievalNote: m.retrievalNote,
        bundles: m.bundles,
        quickOptions: m.quickOptions,
        // Drop try-on image bytes — the model only needs the text; the UI already has the image.
        ...(m.tryOnImage
          ? {
              tryOnImage: {
                imageUrl: "[try-on-preview]",
                items: m.tryOnImage.items,
                recommendedSizes: m.tryOnImage.recommendedSizes,
                fitNotes: m.tryOnImage.fitNotes,
              },
            }
          : {}),
      }));

      const slimProducts = (products: Product[]) =>
        products.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description.slice(0, 280),
          price: p.price,
          currency: p.currency,
          imageUrl: p.imageUrl,
          categoryId: p.categoryId,
          tags: p.tags,
          variants: p.variants,
          rating: p.rating,
          reviewCount: p.reviewCount,
          inStock: p.inStock,
          // Carry the AI-classified slot back to the server so already-classified products
          // don't silently revert to keyword matching on turns where they aren't re-searched.
          garmentSlot: p.garmentSlot,
        }));

      const res = await fetch(embed ? `${embed.apiBase}/wearable` : "/api/agents/wearable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(embed ? { embedToken: embed.embedToken, sessionId: embedSessionIdRef.current } : {}),
          messages: slimHistory,
          profile: {
            heightCm: profile.heightCm,
            weightKg: profile.weightKg,
            chestCm: profile.chestCm,
            waistCm: profile.waistCm,
            shoeSizeEu: profile.shoeSizeEu,
            isCustomAvatar: selectedAvatarIdRef.current === "custom",
            // Only ship the avatar when it changed; the server caches it for try_on.
            ...(shouldSendAvatar ? { avatarUrl } : {}),
          },
          outfitItems: slimProducts(outfitRef.current),
          // Ids only. The catalog is indexed server-side now, so echoing whole product objects
          // back every turn just grows the request body with data the server already holds.
          knownProductIds: Object.keys(knownProductsRef.current),
          intake: intakeAnswersRef.current,
          retrievalState: retrievalStateRef.current,
        }),
      });

      if (res.ok && shouldSendAvatar && avatarUrl) {
        lastSentAvatarUrlRef.current = avatarUrl;
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || GENERIC_CHAT_ERROR);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const { events, rest } = parseSseChunk<WearableAgentEvent>(buffer);
        buffer = rest;

        for (const event of events) {
          sawAnyEvent = true;
          // Only a result the shopper can actually see ends the wait. Most events in a turn —
          // retrieved products, retrieval state, intake — change nothing on screen, and clearing
          // the indicator on those left the chat visibly dead from the moment retrieval finished
          // until the closing copy arrived, which on a product turn is two more model calls and
          // the longest part of the turn.
          if (SHOPPER_VISIBLE_EVENTS.has(event.type)) {
            setState((s) => (s.isTyping ? { ...s, isTyping: false } : s));
          }

          switch (event.type) {
            case "tool": {
              if (event.activity === "bundle" && event.status === "start") {
                startBundleProgressTicker();
              } else if (event.activity === "bundle" && event.status === "end") {
                stopScanTicker();
                setState((s) => ({ ...s, isTyping: true, isScanning: false, typingStage: "composing" }));
              } else if (event.tool === "try_on" && event.status === "start") {
                setState((s) => ({ ...s, isGenerating: true }));
              } else if (event.tool === "update_measurements" && event.status === "start") {
                setState((s) => ({ ...s, isRegeneratingAvatar: true }));
              } else if (event.tool === "search_catalog") {
                // `search_catalog` is the persona's orchestration tool: it can legitimately
                // resolve to a clarifying question rather than a catalog read, so the label says
                // what is being done, not what it will find. Once it returns, whatever it
                // returned, the model is writing the reply.
                setState((s) => ({ ...s, typingStage: event.status === "start" ? "searching" : "composing" }));
              }
              break;
            }
            case "products": {
              mergeKnownProducts(event.products);
              setState((s) => (s.isScanning ? { ...s, scanResultCount: event.products.length } : s));
              break;
            }
            case "text": {
              stopScanTicker();
              setState((s) => ({ ...s, isScanning: false }));
              ensureAssistantMessage();
              const quickOptions = pendingQuickOptions;
              pendingQuickOptions = null;
              setState((s) => ({
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: m.content + event.delta,
                        ...(quickOptions ? { quickOptions } : {}),
                      }
                    : m
                ),
              }));
              break;
            }
            case "product_recommendations": {
              patchAssistantMessage({
                // Merge across multiple search buckets (jackets + shoes) instead of letting
                // the last event overwrite the first — that was why only one category showed.
                productRecommendations: event.productIds,
                retrievalNote: event.note,
              });
              break;
            }
            case "quick_options": {
              pendingQuickOptions = event.options;
              break;
            }
            case "retrieval_state": {
              // Cross-turn memory without a server session: what the conversation is about,
              // how far a bundle has got, and what's already been shown.
              //
              // Merged rather than replaced, because of the anchor. A turn that resolves no
              // anchor of its own reports null, and taking that literally would silently discard
              // a selection the shopper made by clicking and can still see pinned above the
              // composer. The pin only moves when the server actually resolved a different
              // product — which it does when they name one outright.
              applyRetrievalState(event.anchorId, event.bundleState, event.shownProductIds);
              break;
            }
            case "bundle": {
              mergeKnownProducts(event.products);
              ensureAssistantMessage();
              const incomingIds = new Set(event.bundles.map((b) => b.id));
              setState((s) => ({
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        bundles: [...(m.bundles ?? []).filter((b) => !incomingIds.has(b.id)), ...event.bundles],
                      }
                    : m
                ),
              }));
              break;
            }
            case "try_on": {
              const snapshot: GeneratedTryOn = {
                id: `tryon-${Date.now()}`,
                imageUrl: event.imageUrl,
                outfitProducts: event.items
                  .map((i) => knownProductsRef.current[i.productId])
                  .filter((p): p is Product => !!p),
                recommendedSizes: event.recommendedSizes,
                fitNotes: event.fitNotes,
                createdAt: new Date().toISOString(),
              };
              setState((s) => ({
                ...s,
                isGenerating: false,
                tryOnImages: [...s.tryOnImages, snapshot],
                currentImageIndex: s.tryOnImages.length,
                outfitItems: snapshot.outfitProducts.length > 0 ? snapshot.outfitProducts : s.outfitItems,
              }));
              patchAssistantMessage({
                tryOnImage: { imageUrl: event.imageUrl, items: event.items, recommendedSizes: event.recommendedSizes, fitNotes: event.fitNotes },
              });
              logTryOnEvent(snapshot.outfitProducts, event.recommendedSizes);
              break;
            }
            case "add_to_cart": {
              mergeKnownProducts(event.products);
              // Computed inside the updater (not from the outer `state` closure, which can be
              // stale mid-stream) and stashed here so the real-cart sync fires with exactly the
              // same "actually new" set the optimistic UI update used, in the same tick.
              let toAdd: Product[] = [];
              let nextCartItems: Product[] = [];
              setState((s) => {
                const existingIds = new Set(s.cartItems.map((p) => p.id));
                toAdd = event.products.filter((p) => !existingIds.has(p.id));
                nextCartItems = toAdd.length > 0 ? [...s.cartItems, ...toAdd] : s.cartItems;
                return toAdd.length > 0 ? { ...s, cartItems: nextCartItems } : s;
              });
              if (toAdd.length > 0) {
                persistCartItemsNow(nextCartItems);
                syncProductsToRealCart(toAdd);
              }
              break;
            }
            case "intake": {
              setState((s) => ({ ...s, intakeAnswers: event.intake }));
              break;
            }
            case "profile": {
              if (typeof event.patch.avatarUrl === "string") {
                lastSentAvatarUrlRef.current = event.patch.avatarUrl;
              }
              setState((s) => ({
                ...s,
                profile: {
                  ...s.profile,
                  ...(typeof event.patch.heightCm === "number" ? { heightCm: event.patch.heightCm } : {}),
                  ...(typeof event.patch.weightKg === "number" ? { weightKg: event.patch.weightKg } : {}),
                  ...(typeof event.patch.chestCm === "number" ? { chestCm: event.patch.chestCm } : {}),
                  ...(typeof event.patch.waistCm === "number" ? { waistCm: event.patch.waistCm } : {}),
                  ...(typeof event.patch.shoeSizeEu === "number" ? { shoeSizeEu: event.patch.shoeSizeEu } : {}),
                  ...(typeof event.patch.avatarUrl === "string" ? { avatarUrl: event.patch.avatarUrl } : {}),
                },
                isRegeneratingAvatar: false,
              }));
              break;
            }
            case "error": {
              stopScanTicker();
              patchAssistantMessage({ content: event.message });
              setState((s) => ({ ...s, isScanning: false, isGenerating: false, isRegeneratingAvatar: false }));
              break;
            }
            case "done": {
              logChatEvent("assistant", intakeAnswersRef.current.occasion ?? null);
              break;
            }
            default:
              break;
          }
        }
      }
    } catch (err) {
      if (!sawAnyEvent) {
        setState((s) => ({
          ...s,
          messages: [
            ...s.messages,
            {
              id: `msg-chat-error-${Date.now()}`,
              role: "assistant",
              content: err instanceof Error ? err.message : GENERIC_CHAT_ERROR,
              timestamp: new Date().toISOString(),
            },
          ],
        }));
      }
    } finally {
      stopScanTicker();
      setState((s) => ({ ...s, isTyping: false, isScanning: false, typingStage: "thinking" }));
    }
  }

  async function sendMessage(text?: string) {
    const content = (text ?? state.input).trim();
    if (!content) return;
    setState((s) => ({ ...s, input: "" }));

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messagesRef.current, userMsg];
    setState((s) => ({ ...s, messages: nextHistory }));
    logChatEvent("user", intakeAnswersRef.current.occasion ?? null);

    await streamChatTurn(nextHistory);
  }

  /** Adds or replaces one garment slot in the working outfit, then immediately renders the
   *  resolved look — e.g. new shoes replace old shoes while keeping shirt/pants/jacket. */
  async function wearItem(product: Product) {
    const current = outfitRef.current;
    const nextOutfit = mergeGarmentIntoOutfit(current, [product]);

    if (nextOutfit !== current) {
      outfitRef.current = nextOutfit;
      setState((s) => ({ ...s, outfitItems: nextOutfit }));
    }
    await generateTryOn(nextOutfit);
  }

  /** Swaps the entire working outfit for a curated bundle and renders it as one look. */
  async function wearBundle(productIds: string[]) {
    const products = productIds
      .map((id) => knownProductsRef.current[id])
      .filter((p): p is Product => !!p);
    if (products.length === 0) return;
    setState((s) => ({ ...s, outfitItems: products }));
    await generateTryOn(products);
  }

  /** Fires the real store cart mutation for widget.js only (see EmbedRuntimeConfig).
   *  Never awaited by the caller — the widget's own `cartItems` list already updated
   *  optimistically, so a slow/failed store sync only surfaces as a transient error toast,
   *  it never blocks or reverts the shopper's own in-widget "added" state. Supports
   *  WordPress/WooCommerce Store API and Shopify Ajax `/cart/add.js`. `variantId` (Shopify
   *  only) is only meaningful for a single-product call — bulk adds keep today's
   *  auto-pick-first-in-stock-variant behavior.
   *
   *  Queued (not fired independently per call): the shopper's browser has no cart session
   *  cookie yet on their very first add, and Shopify's `/cart/add.js` (and WooCommerce's Store
   *  API nonce/cookie handshake) only reliably lands one `Set-Cookie` if requests are strictly
   *  sequential — two clicks fired close together as independent parallel requests can each
   *  get told "you have no cart, here's a new one," and whichever `Set-Cookie` the browser
   *  applies last silently orphans the other item (it looks added in the widget, which updates
   *  optimistically, but never lands in the real store cart until a refresh re-syncs). */
  function syncProductsToRealCart(products: Product[], variantId?: string) {
    if (!embed?.enableRealCart || products.length === 0) return;
    const origin = window.location.origin;
    const sessionId = getOrCreateEmbedSessionId(embed.embedToken);

    cartSyncQueueRef.current = cartSyncQueueRef.current.catch(() => {}).then(async () => {
      for (const product of products) {
        let success = false;
        let lastError: unknown = null;
        setState((s) => ({ ...s, pendingCartItemIds: [...s.pendingCartItemIds, product.id] }));
        // A one-shot mutation attempt can transiently fail on the very first real-cart sync
        // of a fresh session — e.g. Shopify's Standard Storefront Action script hasn't
        // finished initializing on the host page yet right after load — and a repeat attempt
        // moments later reliably works. Retry once automatically instead of surfacing an
        // error and forcing the shopper to click again themselves.
        const MAX_ATTEMPTS = 2;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !success; attempt++) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15_000);
            let res: Response;
            try {
              res = await fetch(`${embed.apiBase}/cart-item`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  embedToken: embed.embedToken,
                  productId: product.id,
                  ...(products.length === 1 && variantId ? { variantId } : {}),
                }),
                signal: controller.signal,
              });
            } finally {
              clearTimeout(timeout);
            }
            const data: { id?: number; platform?: string; error?: string } = await res.json().catch(() => ({}));
            if (!res.ok || typeof data.id !== "number") {
              throw new Error(data.error || "Couldn't add this to your cart.");
            }

            const result =
              data.platform === "shopify"
                ? await addItemToShopifyCart(origin, data.id, 1)
                : await addItemToWooCommerceCart(origin, data.id, 1);
            if (!result.ok) throw new Error(result.error || "Couldn't add this to your cart.");
            success = true;
            // Mark "Added" right now, synchronously, before the next item in this batch even
            // starts — not upfront for the whole batch (see addToCart/addBundleToCart). If a
            // same-tick page reload fires from here on out (e.g. the next item's own
            // Shopify.actions.updateCart call), this item's success is already durably recorded.
            let confirmedCartItems: Product[] = [];
            setState((s) => {
              confirmedCartItems = s.cartItems.some((p) => p.id === product.id) ? s.cartItems : [...s.cartItems, product];
              return { ...s, cartItems: confirmedCartItems };
            });
            persistCartItemsNow(confirmedCartItems);
          } catch (err) {
            lastError = err;
            console.error(`[use-try-on-agent] real cart sync attempt ${attempt} failed for "${product.name}"`, err);
            if (attempt < MAX_ATTEMPTS) {
              await new Promise((resolve) => setTimeout(resolve, 700));
            }
          }
        }
        if (!success) {
          const err = lastError;
          const isTimeout = err instanceof Error && err.name === "AbortError";
          const message = isTimeout
            ? "The store took too long to respond — please try again."
            : err instanceof Error
              ? err.message
              : "Couldn't add this to your cart.";
          // Roll back the optimistic "Added" mark — otherwise a one-time failure leaves the
          // button permanently stuck showing "Added" with nothing actually in the real cart,
          // and no way to ever retry it since addToCart/addBundleToCart both de-dupe against
          // cartItems.
          let rolledBackCartItems: Product[] = [];
          setState((s) => {
            rolledBackCartItems = s.cartItems.filter((p) => p.id !== product.id);
            return { ...s, cartItems: rolledBackCartItems, cartSyncError: message };
          });
          persistCartItemsNow(rolledBackCartItems);
          setTimeout(() => setState((s) => (s.cartSyncError === message ? { ...s, cartSyncError: null } : s)), 8000);
        }
        // Always runs, regardless of the outcome above (equivalent to a `finally`).
        {
          setState((s) => ({
            ...s,
            pendingCartItemIds: s.pendingCartItemIds.filter((id) => id !== product.id),
          }));
          void fetch(`${embed.apiBase}/cart-event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embedToken: embed.embedToken,
              sessionId,
              productId: product.id,
              productName: product.name,
              price: product.price,
              currency: product.currency,
              quantity: 1,
              success,
            }),
          }).catch(() => {});
        }
      }
    });
  }

  /** Fires a fire-and-forget log of the garments shown in one virtual try-on render (button or
   *  chat-triggered) — the shopper already saw the result, this just tells the analytics
   *  dashboard it happened. Runs for any embedded surface (preview link or real widget.js), not
   *  gated by `enableRealCart` — try-on generation itself works the same on both. */
  function logTryOnEvent(outfitProducts: Product[], recommendedSizes: Record<string, string>) {
    if (!embed || outfitProducts.length === 0) return;
    const sessionId = getOrCreateEmbedSessionId(embed.embedToken);
    const generationId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `gen-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    void fetch(`${embed.apiBase}/try-on-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedToken: embed.embedToken,
        sessionId,
        generationId,
        items: outfitProducts.map((p) => ({
          productId: p.id,
          productName: p.name,
          recommendedSize: recommendedSizes[p.id] ?? "M",
        })),
      }),
    }).catch(() => {});
  }

  function addBundleToCart(productIds: string[]) {
    const existingIds = new Set(state.cartItems.map((p) => p.id));
    const toAdd = productIds
      .map((id) => state.knownProducts[id])
      .filter((p): p is Product => !!p && !existingIds.has(p.id));
    if (toAdd.length === 0) return;
    // Real-cart syncs mark each item "Added" incrementally as its own mutation actually
    // succeeds (see syncProductsToRealCart), not as a single upfront batch here — Shopify's
    // Standard Storefront Action can trigger a same-tick full page reload as its refresh
    // fallback (especially on a brand-new cart), and eagerly marking the whole batch would
    // survive that reload even for items whose sync never got a chance to run, permanently
    // stranding them "Added" locally with nothing in the real cart. Non-real-cart callers
    // (dashboard's own mocked preview) never reach that success path, so they still need
    // the instant optimistic mark here for their demo UI to work.
    if (embed?.enableRealCart) {
      syncProductsToRealCart(toAdd);
      return;
    }
    const nextCartItems = [...state.cartItems, ...toAdd];
    setState((s) => ({ ...s, cartItems: nextCartItems }));
    persistCartItemsNow(nextCartItems);
    syncProductsToRealCart(toAdd);
  }

  function addToOutfit(product: Product) {
    setState((s) => {
      const nextOutfit = mergeGarmentIntoOutfit(s.outfitItems, [product]);
      if (nextOutfit.length > 6) return s;
      outfitRef.current = nextOutfit;
      return { ...s, outfitItems: nextOutfit };
    });
  }

  function removeFromOutfit(productId: string) {
    setState((s) => ({
      ...s,
      outfitItems: s.outfitItems.filter((p) => p.id !== productId),
    }));
  }

  function prevImage() {
    setState((s) => ({
      ...s,
      currentImageIndex: Math.max(0, s.currentImageIndex - 1),
    }));
  }

  function nextImage() {
    setState((s) => ({
      ...s,
      currentImageIndex: Math.min(s.tryOnImages.length - 1, s.currentImageIndex + 1),
    }));
  }

  function selectImage(index: number) {
    setState((s) => ({
      ...s,
      currentImageIndex: Math.max(0, Math.min(s.tryOnImages.length - 1, index)),
    }));
  }

  function addToCart(product: Product, variantId?: string) {
    if (state.cartItems.some((p) => p.id === product.id)) return;
    // See addBundleToCart's comment — real-cart syncs defer marking "Added" until the sync
    // itself succeeds, to survive a same-tick page reload safely.
    if (embed?.enableRealCart) {
      syncProductsToRealCart([product], variantId);
      return;
    }
    const nextCartItems = [...state.cartItems, product];
    setState((s) => ({ ...s, cartItems: nextCartItems }));
    persistCartItemsNow(nextCartItems);
    syncProductsToRealCart([product], variantId);
  }

  /** Applies one turn's retrieval state, keeping the pinned bar in step with it. */
  function applyRetrievalState(anchorId: string | null, bundleState: BundleState | null, shownProductIds: string[]) {
    const previous = retrievalStateRef.current;
    const next = mergeRetrievalState(previous, { anchorId, bundleState, shownProductIds });
    retrievalStateRef.current = next;

    // The server moved off the pinned product, which it only does when the shopper named a
    // different one outright. Follow it, so the pinned bar never describes one item while the
    // conversation is about another. Left alone if the product isn't known yet — a stale label
    // beats a blank one.
    if (previous.anchorPinned && next.anchorId !== null && next.anchorId !== previous.anchorId) {
      const moved = knownProductsRef.current[next.anchorId];
      if (moved) setState((s) => ({ ...s, selectedAnchor: moved }));
    }
  }

  /**
   * Pins a product as what the conversation is about, from the Select control on its card.
   *
   * Clears any discussed outfit: one subject at a time. Both pins feed the same next request, so
   * leaving both set would send an outfit and a single item as competing subjects and put two
   * "Discussing" bars on screen at once.
   */
  function selectItem(product: Product) {
    retrievalStateRef.current = {
      ...retrievalStateRef.current,
      anchorId: product.id,
      anchorPinned: true,
      bundleState: clearDiscussed(retrievalStateRef.current.bundleState),
    };
    setState((s) => ({ ...s, selectedAnchor: product, discussedBundle: null }));
  }

  function clearAnchor() {
    retrievalStateRef.current = {
      ...retrievalStateRef.current,
      anchorId: null,
      anchorPinned: false,
    };
    setState((s) => ({ ...s, selectedAnchor: null }));
  }

  /** Drops only the discussed items, leaving the rest of the bundle state (scope, locked) alone —
   *  un-pinning an outfit is not the same as abandoning the bundle being built. */
  function clearDiscussed(bundleState: BundleState | null): BundleState | null {
    return bundleState ? { ...bundleState, discussed: null } : null;
  }

  /** Pins every item of one presented outfit at once — see "Discuss this bundle". No per-item
   *  click: the next message can name any item in it ("does the jacket run small?") or ask to
   *  swap one ("replace the pants"), both resolved server-side against this list. */
  function discussBundle(bundle: BundleSuggestion) {
    const current = retrievalStateRef.current.bundleState;
    const discussed = bundle.items.map((item) => ({
      externalId: item.productId,
      category: item.category ?? "other",
      price: item.price,
    }));
    retrievalStateRef.current = {
      ...retrievalStateRef.current,
      // The outfit replaces a single pinned product as the subject — see `selectItem`.
      anchorId: null,
      anchorPinned: false,
      bundleState: current
        ? { ...current, discussed }
        : { scope: [], locked: {}, discussed },
    };
    setState((s) => ({ ...s, discussedBundle: bundle, selectedAnchor: null }));
  }

  function clearDiscussedBundle() {
    retrievalStateRef.current = {
      ...retrievalStateRef.current,
      bundleState: clearDiscussed(retrievalStateRef.current.bundleState),
    };
    setState((s) => ({ ...s, discussedBundle: null }));
  }

  const profileComplete = isProfileComplete(state.profile);
  const currentTryOn = state.tryOnImages[state.currentImageIndex] ?? null;

  return {
    ...state,
    currentTryOn,
    updateProfile,
    startAvatarGeneration,
    selectAvatar,
    uploadCustomAvatar,
    confirmAvatar,
    setInput,
    sendMessage,
    regenerateAvatar,
    changeBackdrop,
    uploadCustomBackdrop,
    addToOutfit,
    removeFromOutfit,
    generateTryOn,
    wearItem,
    wearBundle,
    addBundleToCart,
    prevImage,
    nextImage,
    selectImage,
    addToCart,
    selectItem,
    clearAnchor,
    discussBundle,
    clearDiscussedBundle,
    profileComplete,
    // The embedded page has no shopper login/API-key concept — the server already guarantees
    // the merchant has a key configured before its embed can be enabled at all.
    hasApiKey: embed ? true : geminiKey.hasKey,
    apiKeyLoading: embed ? false : geminiKey.loading,
  };
}

export type UseTryOnAgentReturn = ReturnType<typeof useTryOnAgent>;
