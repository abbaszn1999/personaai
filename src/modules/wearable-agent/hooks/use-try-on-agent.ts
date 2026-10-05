"use client";

import * as React from "react";
import type { ChatMessage, LookFitAnalysis } from "@/modules/commerce/types";
import type { AvatarVariation, OnboardingPhase, TryOnAudience, TryOnProfile } from "@/modules/wearable-agent/types";
import type { BundleSuggestion, Product, TurnAttribution } from "@/modules/commerce/types";
import { formatBudget } from "@/modules/commerce/constants";
import { isLookRecord, type AgentEvent, type LookRecord } from "@/lib/agents/types";
import { attributionForProduct } from "../utils/cart-attribution";
import { parseTypedBudget } from "../utils/typed-budget";
import { EMPTY_RETRIEVAL_STATE, normalizeRetrievalState, type RetrievalState } from "../utils/retrieval-state";
import { AVATAR_GENERATION_STAGES } from "../constants";
import { isKidsAudience, KIDS_AGE_RANGE } from "../audiences";
import { INITIAL_WEARABLE_MESSAGE, SCAN_STAGE_DURATION_MS, SCAN_STAGES } from "../mocks/responses";
import {
  recommendSizesForProducts,
  buildFitNote,
  mergeGarmentIntoOutfit,
} from "@/lib/recommendations";
import { getOrCreateEmbedSessionId, loadEmbedState, saveEmbedState } from "@/lib/embed/client/embed-storage";
import type { ShopperProfileDraft } from "@/lib/embed/client/shopper-api";
import { addItemToWooCommerceCart } from "@/lib/woocommerce/store-api-client";
import { addItemToShopifyCart } from "@/lib/shopify/ajax-cart-client";

// Mirrors DEFAULT_AVATAR_VARIATION_COUNT in src/lib/try-on/image-generation.ts — kept as a local
// literal rather than importing that module, since this hook ships in the client widget bundle
// and image-generation.ts pulls in server-only deps (sharp, the Pruna client) that must never be
// bundled for the browser.
const EXPECTED_AVATAR_VARIATION_COUNT = 3;
const GENERIC_AVATAR_ERROR = "We couldn't generate your avatar. Please try again.";
const GENERIC_TRYON_ERROR = "Sorry, I couldn't generate your try-on preview. Please try again.";
const GENERIC_CHAT_ERROR = "Sorry, something went wrong on my end. Please try that again.";

/** Passed only when this hook is powering the public `/embed/[token]` page or widget.js —
 *  swaps every `/api/agents/*` call for its public `/api/embed/*` counterpart and includes the
 *  embed token (plus a per-shopper session id) on every request. */
export interface EmbedRuntimeConfig {
  apiBase: string;
  embedToken: string;
  /** Only true for the real `widget.js` snippet running on the merchant's own site — where
   *  "add to cart" can actually mutate the shopper's real WooCommerce cart (see
   *  store-api-client.ts for why that only works there and not on this app's own domain). */
  enableRealCart?: boolean;
}

/** Server-backed identity for an embedded shopper who has already signed in — the source of
 *  truth for the 3 profiles (name, audience, measurements, hosted avatar). Chat, outfit and
 *  cart stay in localStorage as this-device session convenience only. */
export interface ShopperProfileBridge {
  profiles: Array<{
    id: string;
    label: string;
    profile: TryOnProfile;
    profileSubmitted: boolean;
  }>;
  createProfile: (draft: ShopperProfileDraft) => Promise<{
    id: string;
    label: string;
    profile: TryOnProfile;
    profileSubmitted: boolean;
  } | null>;
  updateProfile: (id: string, draft: ShopperProfileDraft) => Promise<{
    id: string;
    label: string;
    profile: TryOnProfile;
    profileSubmitted: boolean;
  } | null>;
}

/** Up to this many separate profiles (e.g. a parent shopping for themselves + up to 2 kids)
 *  can share one shopper account at a store. The same ceiling is enforced server-side. */
export const MAX_TRYON_PROFILES = 3;
const DEFAULT_PROFILE_ID = "default";

/** What the shopper attached with "Ask about this item" or "Ask about this bundle". While set,
 *  every typed turn is about it; the × on the attachment bar clears it. */
export type ChatAttachment = { kind: "item"; product: Product } | { kind: "look"; look: LookRecord };

/** Per-profile slice of persisted state — everything that's genuinely "whose this is":
 *  measurements/avatar, the try-on renders made for them, and their own conversation with the
 *  agent. Cart and catalog knowledge stay shared across profiles (same shopping session, same
 *  browser tab, same real cart at checkout) — but the chat itself is a conversation *about* one
 *  profile's fit and outfit, so switching profiles now switches it too instead of leaving a
 *  parent's chat history showing while their kid's profile is active. */
interface StoredProfileSlot {
  id: string;
  label: string;
  profile: TryOnProfile;
  profileSubmitted: boolean;
  selectedAvatarId: string | null;
  tryOnImages: GeneratedTryOn[];
  currentImageIndex: number;
  messages: ChatMessage[];
  input: string;
  outfitItems: Product[];
  attachment: ChatAttachment | null;
  /** The optional budget for a full look — a field, never parsed from chat. */
  budget: number | null;
  retrievalState: RetrievalState;
}

/** Shape persisted to localStorage for an embedded session — deliberately a subset of the
 *  full in-memory state (no loading/animation flags, nothing already derivable from a fetch). */
interface PersistedEmbedState {
  profiles: StoredProfileSlot[];
  activeProfileId: string;
  cartItems: Product[];
  knownProducts: Record<string, Product>;
}

/** Pre-multi-profile shape, kept only to migrate a shopper's existing localStorage entry
 *  in place instead of silently wiping their session on the first load after this update. */
interface LegacyPersistedEmbedStateV1 {
  profile: TryOnProfile;
  profileSubmitted: boolean;
  messages: ChatMessage[];
  outfitItems: Product[];
  cartItems: Product[];
  knownProducts: Record<string, Product>;
  tryOnImages: GeneratedTryOn[];
  currentImageIndex: number;
  selectedAvatarId: string | null;
}

function blankProfileSlotData(): Omit<StoredProfileSlot, "id" | "label"> {
  return {
    profile: INITIAL_PROFILE,
    profileSubmitted: false,
    selectedAvatarId: null,
    tryOnImages: [],
    currentImageIndex: 0,
    messages: [],
    input: "",
    outfitItems: [],
    attachment: null,
    budget: null,
    retrievalState: EMPTY_RETRIEVAL_STATE,
  };
}

function normalizeAttachment(raw: unknown): ChatAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { kind?: unknown; product?: Product; look?: BundleSuggestion };
  if (value.kind === "item" && value.product && typeof value.product.id === "string") {
    return { kind: "item", product: value.product };
  }
  if (value.kind === "look" && value.look && isLookRecord(value.look)) return { kind: "look", look: value.look };
  return null;
}

/** The attachment as the server reads it: an item by id, a look whole. */
export function wireAttachment(attachment: ChatAttachment | null) {
  if (!attachment) return null;
  return attachment.kind === "item"
    ? { kind: "item" as const, productId: attachment.product.id }
    : { kind: "look" as const, look: attachment.look };
}

function normalizeBudget(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
}

/** Strips the raw body photo before anything touches localStorage. The merchant's own page
 *  (WordPress/Shopify, full of third-party scripts) owns that storage origin — any other
 *  script there could otherwise read a shopper's body photo straight out of it. The photo only
 *  ever needs to live in-memory for the active tab and in the server's own short-lived avatar
 *  cache; losing it on reload just means re-uploading a photo to regenerate a new avatar, while
 *  the already-generated avatarUrl, measurements, and try-on history are unaffected.
 *
 *  `photoUrl` goes with it, and must: it's an `URL.createObjectURL` blob handle (see
 *  onboarding/photo-step.tsx), so it carries no image bytes but is also dead after a reload.
 *  Keeping it while dropping the bytes would leave the pair inconsistent — the setup form
 *  would show a broken thumbnail and count the profile as complete (it only checks
 *  `photoUrl`), then fail the avatar request server-side for a missing photo. */
function sanitizeProfileForStorage(profile: TryOnProfile): TryOnProfile {
  return { ...profile, photoUrl: null, photoBase64: null, photoMimeType: null };
}

/** Fills in fields added after a shopper's localStorage entry was first written (e.g.
 *  `audience`, introduced with the multi-step onboarding redesign) so older persisted
 *  profiles don't come back from `JSON.parse` missing keys the rest of the app assumes exist. */
function normalizeProfileFields(profile: Partial<TryOnProfile> | null | undefined): TryOnProfile {
  return { ...INITIAL_PROFILE, ...(profile ?? {}) };
}

function sanitizeSlotForStorage(slot: Omit<StoredProfileSlot, "id" | "label">): Omit<StoredProfileSlot, "id" | "label"> {
  return { ...slot, profile: sanitizeProfileForStorage(slot.profile) };
}

/** Normalizes whatever is in localStorage (new multi-profile shape, the old single-profile
 *  shape, or garbage) into today's `PersistedEmbedState` — see LegacyPersistedEmbedStateV1. */
export function normalizePersistedState(raw: unknown): PersistedEmbedState | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.profiles) && typeof obj.activeProfileId === "string") {
    // A profile slot written before this fix has no `messages` of its own — the whole
    // session's chat was a single top-level field back then. Hand it to whichever profile
    // was active at the time (the only one it could actually belong to) instead of either
    // duplicating it into every profile or silently dropping a shopper's real history.
    const shaped = obj as unknown as PersistedEmbedState & { messages?: ChatMessage[] };
    const preMigrationMessages = Array.isArray(shaped.messages) ? shaped.messages : [];
    const preMigrationOutfit = Array.isArray((obj as { outfitItems?: unknown }).outfitItems)
      ? ((obj as { outfitItems: Product[] }).outfitItems)
      : [];
    return {
      ...shaped,
      profiles: shaped.profiles.map((slot) => ({
        ...slot,
        profile: normalizeProfileFields(slot.profile),
        messages: Array.isArray(slot.messages)
          ? slot.messages
          : slot.id === shaped.activeProfileId
            ? preMigrationMessages
            : [],
        input: typeof slot.input === "string" ? slot.input : "",
        outfitItems: Array.isArray(slot.outfitItems)
          ? slot.outfitItems
          : slot.id === shaped.activeProfileId
            ? preMigrationOutfit
            : [],
        attachment: normalizeAttachment(slot.attachment),
        budget: normalizeBudget(slot.budget),
        retrievalState: normalizeRetrievalState(slot.retrievalState),
      })),
    };
  }

  if (obj.profile && typeof obj.profile === "object") {
    const legacy = obj as unknown as LegacyPersistedEmbedStateV1;
    return {
      profiles: [
        {
          id: DEFAULT_PROFILE_ID,
          label: "Profile 1",
          profile: sanitizeProfileForStorage(normalizeProfileFields(legacy.profile)),
          profileSubmitted: legacy.profileSubmitted,
          selectedAvatarId: legacy.selectedAvatarId,
          tryOnImages: legacy.tryOnImages ?? [],
          currentImageIndex: legacy.currentImageIndex ?? 0,
          messages: legacy.messages ?? [],
          input: "",
          outfitItems: legacy.outfitItems ?? [],
          attachment: null,
          budget: null,
          retrievalState: EMPTY_RETRIEVAL_STATE,
        },
      ],
      activeProfileId: DEFAULT_PROFILE_ID,
      cartItems: legacy.cartItems ?? [],
      knownProducts: legacy.knownProducts ?? {},
    };
  }

  return null;
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

/** Rewrites root-relative asset paths (e.g. `/avatars/backgrounds/backdrop-1.webp`, returned
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
  count?: number,
  sessionId?: string | null
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
        // Kids profiles are asked for age instead of chest and waist (see MeasurementsStep), and
        // the server accepts either set — sending the unasked pair would only be null noise.
        ...(isKidsAudience(profile.audience)
          ? { ageYears: profile.ageYears }
          : { chestCm: profile.chestCm, waistCm: profile.waistCm }),
        shoeSizeEu: profile.shoeSizeEu,
        ...(count ? { count } : {}),
        ...(sessionId ? { sessionId } : {}),
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
  audience: null,
  photoUrl: null,
  photoBase64: null,
  photoMimeType: null,
  heightCm: null,
  weightKg: null,
  shoeSizeEu: null,
  ageYears: null,
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
  /** Real size-chart analysis captured for this exact outfit version. */
  fit: LookFitAnalysis | null;
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
  /** How many of the avatar styles have finished so far — drives the loading screen's style row. */
  avatarsArrived: number;
  avatarVariations: AvatarVariation[];
  /** Set when the real avatar generation request fails — cleared on the next attempt. */
  avatarGenerationError: string | null;
  /** Non-blocking heads-up shown on the avatar-selection screen when at least one style landed
   *  but fewer than the full set did — the picker is still usable, this just explains why it
   *  shows 2-3 cards instead of the usual 4 rather than looking like a silent bug. */
  avatarPartialNote: string | null;
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
  isScanning: boolean;
  scanStageIndex: number;
  /** Real match count from the most recent catalog search, shown in place of the last
   *  cosmetic scanning stage once it resolves — null while no results have landed yet. */
  scanResultCount: number | null;
  /** Live products the agents have actually surfaced this session, keyed by
   *  id — replaces the static mock catalog as the source of truth for anything the chat
   *  references (inline suggestion cards, bundles, "wear it"/"add to cart" resolution). */
  knownProducts: Record<string, Product>;
  /** The item or look attached with an "Ask about…" button, shown above the composer. */
  attachment: ChatAttachment | null;
  /** The optional budget for a full look, set from the budget card under "Complete the look". */
  budget: number | null;
  isUploadingBackdrop: boolean;
  /** Set when a custom backdrop upload fails — cleared on the next attempt. */
  backdropUploadError: string | null;
  /** Transient — set when a real WooCommerce cart sync (widget.js only) fails, auto-clears
   *  after a few seconds. The local `cartItems` add always succeeds regardless, so the
   *  widget's own UI never looks broken even when the real store sync fails. */
  cartSyncError: string | null;
}

/** Just the numeric fields — the photo lives on the same combined screen but is gated
 *  separately via `isProfileComplete` below. */
export function isMeasurementsComplete(profile: TryOnProfile): boolean {
  const common =
    profile.heightCm !== null &&
    profile.heightCm > 0 &&
    profile.weightKg !== null &&
    profile.weightKg > 0 &&
    profile.shoeSizeEu !== null &&
    profile.shoeSizeEu > 0;
  if (!common) return false;

  // The three kids departments give an age instead of chest and waist. Age 0 is a real answer
  // (under one year), so this is a range check rather than the `> 0` the others use.
  if (isKidsAudience(profile.audience)) {
    return (
      profile.ageYears !== null &&
      Number.isFinite(profile.ageYears) &&
      profile.ageYears >= KIDS_AGE_RANGE.min &&
      profile.ageYears <= KIDS_AGE_RANGE.max
    );
  }

  return (
    profile.chestCm !== null &&
    profile.chestCm > 0 &&
    profile.waistCm !== null &&
    profile.waistCm > 0
  );
}

export function isProfileComplete(profile: TryOnProfile): boolean {
  return !!profile.photoUrl && isMeasurementsComplete(profile);
}

/** Picks which onboarding step to drop a shopper on, given whatever their profile already
 *  holds — so someone who filled in their measurements and then reloaded (or switched away and
 *  back) doesn't have to click through the audience screen again just to reach the one thing
 *  still missing. A blank/absent profile still starts at the audience screen, which is also
 *  what a freshly-added profile gets. Never resolves past `measurements`: the raw photo is
 *  deliberately never persisted (see sanitizeProfileForStorage), so a returning shopper always
 *  lands back on the combined measurements+photo screen to re-pick one before an avatar can be
 *  generated, even if their numeric measurements are already filled in from before. */
export function resumeOnboardingPhase(profile: TryOnProfile | null | undefined): OnboardingPhase {
  if (!profile?.audience) return "audience";
  return "measurements";
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
const SHOPPER_VISIBLE_EVENTS = new Set<AgentEvent["type"]>([
  "text",
  "bundle",
  "product_recommendations",
  "error",
]);

type AvatarStreamEvent =
  | { type: "variation"; variation: AvatarVariation; creditsRemaining: number }
  | { type: "variation_error"; label: string; message: string }
  | { type: "error"; message: string }
  | { type: "done"; successCount: number; creditsRemaining: number };

function overlayServerProfiles(
  seeds: ShopperProfileBridge["profiles"],
  local: PersistedEmbedState | null
): PersistedEmbedState {
  const base =
    seeds.length > 0
      ? seeds
      : [{ id: DEFAULT_PROFILE_ID, label: "Profile 1", profile: INITIAL_PROFILE, profileSubmitted: false }];

  const profiles: StoredProfileSlot[] = base.map((seed) => {
    const localSlot = local?.profiles.find((slot) => slot.id === seed.id);
    return {
      id: seed.id,
      label: seed.label,
      profile: seed.profile,
      profileSubmitted: seed.profileSubmitted,
      selectedAvatarId: localSlot?.selectedAvatarId ?? null,
      tryOnImages: localSlot?.tryOnImages ?? [],
      currentImageIndex: localSlot?.currentImageIndex ?? 0,
      messages: localSlot?.messages ?? [],
      input: localSlot?.input ?? "",
      outfitItems: localSlot?.outfitItems ?? [],
      attachment: localSlot?.attachment ?? null,
      budget: localSlot?.budget ?? null,
      retrievalState: localSlot?.retrievalState ?? EMPTY_RETRIEVAL_STATE,
    };
  });

  const submitted = profiles.find((slot) => slot.profileSubmitted);
  const activeProfileId = profiles.some((slot) => slot.id === local?.activeProfileId)
    ? local!.activeProfileId
    : submitted?.id ?? profiles[0].id;

  return {
    profiles,
    activeProfileId,
    cartItems: local?.cartItems ?? [],
    knownProducts: local?.knownProducts ?? {},
  };
}

export function useTryOnAgent(
  embed?: EmbedRuntimeConfig,
  welcomeMessage?: string,
  workspaceId?: string,
  shopper?: ShopperProfileBridge
) {
  const localPersisted = embed ? normalizePersistedState(loadEmbedState<unknown>(embed.embedToken)) : null;
  const persisted = shopper ? overlayServerProfiles(shopper.profiles, localPersisted) : localPersisted;
  const activeSlot = persisted ? (persisted.profiles.find((p) => p.id === persisted.activeProfileId) ?? null) : null;

  const [state, setState] = React.useState<TryOnAgentState>({
    profile: activeSlot?.profile ?? INITIAL_PROFILE,
    onboardingPhase: resumeOnboardingPhase(activeSlot?.profile),
    profileSubmitted: activeSlot?.profileSubmitted ?? false,
    generationProgress: 0,
    generationStageIndex: 0,
    avatarsArrived: 0,
    avatarVariations: [],
    avatarGenerationError: null,
    avatarPartialNote: null,
    selectedAvatarId: activeSlot?.selectedAvatarId ?? null,
    customAvatarUrl: null,
    messages: activeSlot?.messages ?? [],
    outfitItems: activeSlot?.outfitItems ?? [],
    input: activeSlot?.input ?? "",
    isTyping: false,
    typingStage: "thinking",
    isGenerating: false,
    isRegeneratingAvatar: false,
    tryOnImages: activeSlot?.tryOnImages ?? [],
    currentImageIndex: activeSlot?.currentImageIndex ?? 0,
    cartItems: persisted?.cartItems ?? [],
    pendingCartItemIds: [],
    isScanning: false,
    scanStageIndex: 0,
    scanResultCount: null,
    knownProducts: persisted?.knownProducts ?? {},
    attachment: activeSlot?.attachment ?? null,
    budget: activeSlot?.budget ?? null,
    isUploadingBackdrop: false,
    backdropUploadError: null,
    cartSyncError: null,
  });

  const [profilesMeta, setProfilesMeta] = React.useState<{ id: string; label: string }[]>(
    () => persisted?.profiles.map((p) => ({ id: p.id, label: p.label })) ?? [{ id: DEFAULT_PROFILE_ID, label: "Profile 1" }]
  );
  const [activeProfileId, setActiveProfileId] = React.useState<string>(persisted?.activeProfileId ?? DEFAULT_PROFILE_ID);
  /** Holds the full data for every profile *other than* the active one — the active one's
   *  latest data always lives in `state` itself. Populated once from whatever was persisted. */
  const inactiveProfilesRef = React.useRef<Record<string, Omit<StoredProfileSlot, "id" | "label">> | null>(null);
  if (inactiveProfilesRef.current === null) {
    inactiveProfilesRef.current = {};
    if (persisted) {
      for (const slot of persisted.profiles) {
        if (slot.id === persisted.activeProfileId) continue;
        inactiveProfilesRef.current[slot.id] = {
          profile: slot.profile,
          profileSubmitted: slot.profileSubmitted,
          selectedAvatarId: slot.selectedAvatarId,
          tryOnImages: slot.tryOnImages,
          currentImageIndex: slot.currentImageIndex,
          messages: slot.messages,
          input: slot.input,
          outfitItems: slot.outfitItems,
          attachment: slot.attachment,
          budget: slot.budget,
          retrievalState: slot.retrievalState,
        };
      }
    }
  }

  const shopperRef = React.useRef(shopper);
  shopperRef.current = shopper;
  const unsavedIdsRef = React.useRef<Set<string>>(
    new Set(shopper && shopper.profiles.length === 0 ? [DEFAULT_PROFILE_ID] : [])
  );
  const persistTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeProfileIdRef = React.useRef(activeProfileId);
  const profilesMetaRef = React.useRef(profilesMeta);
  activeProfileIdRef.current = activeProfileId;
  profilesMetaRef.current = profilesMeta;

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
  const outfitRef = React.useRef<Product[]>(state.outfitItems);
  const profileRef = React.useRef<TryOnProfile>(state.profile);
  const knownProductsRef = React.useRef<Record<string, Product>>(state.knownProducts);
  const messagesRef = React.useRef<ChatMessage[]>(state.messages);
  const attachmentRef = React.useRef<ChatAttachment | null>(state.attachment);
  const budgetRef = React.useRef<number | null>(state.budget);
  /** Retrieval's cross-turn memory, echoed straight back to the server next turn. A ref rather
   *  than state: nothing renders from it, and it must be current the moment a turn starts. */
  const retrievalStateRef = React.useRef<RetrievalState>(activeSlot?.retrievalState ?? EMPTY_RETRIEVAL_STATE);
  // Serializes every real-cart mutation (across separate "Add to Cart" clicks, not just
  // products within one click) so they never hit the store's cart endpoint concurrently — see
  // syncProductsToRealCart for why that matters.
  const cartSyncQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  React.useEffect(() => {
    outfitRef.current = state.outfitItems;
    profileRef.current = state.profile;
    knownProductsRef.current = state.knownProducts;
    messagesRef.current = state.messages;
    attachmentRef.current = state.attachment;
    budgetRef.current = state.budget;
  }, [state.outfitItems, state.profile, state.knownProducts, state.messages, state.attachment, state.budget]);

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
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  /** Builds the full multi-profile array to persist: the active profile's slot comes from
   *  whatever's passed in (fresh render state or a synchronous override), every other
   *  profile's slot comes from the last snapshot stashed in `inactiveProfilesRef`. */
  function buildProfilesSnapshot(activeData: Omit<StoredProfileSlot, "id" | "label">): StoredProfileSlot[] {
    return profilesMeta.map((meta) =>
      meta.id === activeProfileId
        ? { id: meta.id, label: meta.label, ...sanitizeSlotForStorage(activeData) }
        : { id: meta.id, label: meta.label, ...(inactiveProfilesRef.current?.[meta.id] ?? blankProfileSlotData()) }
    );
  }

  // Mirror the shopper-relevant slice of state into localStorage so an embedded session
  // survives a page reload without any login — this app is already fully client-state-driven
  // server-side, so this is a persistence wrapper, not a new state architecture.
  React.useEffect(() => {
    if (!embed) return;
    const snapshot: PersistedEmbedState = {
      profiles: buildProfilesSnapshot({
        profile: state.profile,
        profileSubmitted: state.profileSubmitted,
        selectedAvatarId: state.selectedAvatarId,
        tryOnImages: state.tryOnImages,
        currentImageIndex: state.currentImageIndex,
        messages: state.messages,
        input: state.input,
        outfitItems: state.outfitItems,
        attachment: state.attachment,
        budget: state.budget,
        retrievalState: retrievalStateRef.current,
      }),
      activeProfileId,
      cartItems: state.cartItems,
      knownProducts: state.knownProducts,
    };
    saveEmbedState(embed.embedToken, snapshot);
  }, [
    embed,
    profilesMeta,
    activeProfileId,
    state.profile,
    state.profileSubmitted,
    state.messages,
    state.input,
    state.outfitItems,
    state.cartItems,
    state.knownProducts,
    state.attachment,
    state.budget,
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
      profiles: buildProfilesSnapshot({
        profile: profileRef.current,
        profileSubmitted: state.profileSubmitted,
        selectedAvatarId: state.selectedAvatarId,
        tryOnImages: state.tryOnImages,
        currentImageIndex: state.currentImageIndex,
        messages: messagesRef.current,
        input: state.input,
        outfitItems: outfitRef.current,
        attachment: attachmentRef.current,
        budget: budgetRef.current,
        retrievalState: retrievalStateRef.current,
      }),
      activeProfileId,
      cartItems: nextCartItems,
      knownProducts: knownProductsRef.current,
    });
  }

  function updateProfile(patch: Partial<TryOnProfile>) {
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
    scheduleShopperPersist();
  }

  function toProfileDraft(
    label: string,
    profile: TryOnProfile,
    sortOrder: number,
    options?: { includeAvatar?: boolean }
  ): ShopperProfileDraft {
    return {
      label,
      audience: profile.audience,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      ageYears: profile.ageYears,
      chestCm: profile.chestCm,
      waistCm: profile.waistCm,
      hipsCm: profile.hipsCm,
      shoeSizeEu: profile.shoeSizeEu,
      ...(options?.includeAvatar ? { avatarUrl: profile.avatarUrl } : {}),
      backdropUrl: profile.backdropUrl,
      sortOrder,
    };
  }

  function replaceProfileId(from: string, to: string) {
    if (from === to) return;
    unsavedIdsRef.current.delete(from);
    setProfilesMeta((m) => m.map((p) => (p.id === from ? { ...p, id: to } : p)));
    setActiveProfileId((id) => (id === from ? to : id));
    if (inactiveProfilesRef.current?.[from]) {
      inactiveProfilesRef.current[to] = inactiveProfilesRef.current[from];
      delete inactiveProfilesRef.current[from];
    }
  }

  async function flushShopperProfile(
    id: string,
    snapshot: { label: string; profile: TryOnProfile },
    options?: { includeAvatar?: boolean }
  ) {
    const bridge = shopperRef.current;
    if (!bridge) return id;
    const idx = profilesMetaRef.current.findIndex((p) => p.id === id);
    const draft = toProfileDraft(
      snapshot.label,
      snapshot.profile,
      idx < 0 ? profilesMetaRef.current.length : idx,
      options
    );
    if (unsavedIdsRef.current.has(id)) {
      const created = await bridge.createProfile(draft);
      if (!created) return id;
      replaceProfileId(id, created.id);
      if (created.profile.avatarUrl && created.profile.avatarUrl !== snapshot.profile.avatarUrl) {
        setState((s) => ({ ...s, profile: { ...s.profile, avatarUrl: created.profile.avatarUrl } }));
      }
      return created.id;
    }
    const updated = await bridge.updateProfile(id, draft);
    if (updated?.profile.avatarUrl && updated.profile.avatarUrl !== snapshot.profile.avatarUrl) {
      setState((s) =>
        s.profile.avatarUrl === snapshot.profile.avatarUrl
          ? { ...s, profile: { ...s.profile, avatarUrl: updated.profile.avatarUrl } }
          : s
      );
    }
    return updated?.id ?? id;
  }

  function scheduleShopperPersist() {
    if (!shopperRef.current) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const id = activeProfileIdRef.current;
      const label = profilesMetaRef.current.find((p) => p.id === id)?.label ?? "Me";
      void flushShopperProfile(id, { label, profile: profileRef.current });
    }, 700);
  }

  /** Stashes the currently-active profile's data into `inactiveProfilesRef` before switching
   *  away from it — called by both switchProfile and addProfile/removeProfile. */
  function stashActiveProfile() {
    inactiveProfilesRef.current![activeProfileId] = sanitizeSlotForStorage({
      profile: profileRef.current,
      profileSubmitted: state.profileSubmitted,
      selectedAvatarId: state.selectedAvatarId,
      tryOnImages: state.tryOnImages,
      currentImageIndex: state.currentImageIndex,
      messages: messagesRef.current,
      input: state.input,
      outfitItems: outfitRef.current,
      attachment: attachmentRef.current,
      budget: budgetRef.current,
      retrievalState: retrievalStateRef.current,
    });
  }

  /** Applies a (possibly blank) profile slot as the new active one — shared by switch/add/remove. */
  function activateProfileData(id: string, data: Omit<StoredProfileSlot, "id" | "label">) {
    delete inactiveProfilesRef.current![id];
    setActiveProfileId(id);
    setState((s) => ({
      ...s,
      profile: data.profile,
      profileSubmitted: data.profileSubmitted,
      onboardingPhase: resumeOnboardingPhase(data.profile),
      selectedAvatarId: data.selectedAvatarId,
      tryOnImages: data.tryOnImages,
      currentImageIndex: data.currentImageIndex,
      messages: data.messages,
      input: data.input,
      outfitItems: data.outfitItems,
      avatarVariations: [],
      customAvatarUrl: null,
      avatarGenerationError: null,
      avatarPartialNote: null,
      // The attachment, budget and typing indicator belong to the conversation being swapped
      // out — each profile carries its own.
      attachment: data.attachment,
      budget: data.budget,
      isTyping: false,
      isScanning: false,
    }));
    attachmentRef.current = data.attachment;
    budgetRef.current = data.budget;
    // The retrieval context (products on screen, the last search) is per-conversation too, or
    // the next turn on the incoming profile's chat would refine the outgoing one's search.
    retrievalStateRef.current = data.retrievalState;
  }

  /** Switches which profile is active — up to MAX_TRYON_PROFILES can share one shopper
   *  account at this store. */
  function switchProfile(id: string) {
    if (id === activeProfileId) return;
    stashActiveProfile();
    const target = inactiveProfilesRef.current![id] ?? blankProfileSlotData();
    activateProfileData(id, target);
  }

  function addProfile() {
    if (profilesMeta.length >= MAX_TRYON_PROFILES) return;
    void (async () => {
      if (profilesMetaRef.current.length >= MAX_TRYON_PROFILES) return;
      stashActiveProfile();
      const currentId = activeProfileIdRef.current;
      const currentLabel = profilesMetaRef.current.find((p) => p.id === currentId)?.label ?? "Me";
      await flushShopperProfile(currentId, { label: currentLabel, profile: profileRef.current });

      const nextLabel = `Profile ${profilesMetaRef.current.length + 1}`;
      const created = shopperRef.current
        ? await shopperRef.current.createProfile({ label: nextLabel, sortOrder: profilesMetaRef.current.length })
        : null;
      const id =
        created?.id ??
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      if (!created) unsavedIdsRef.current.add(id);
      setProfilesMeta((m) => [...m, { id, label: created?.label ?? nextLabel }]);
      activateProfileData(
        id,
        created
          ? { ...blankProfileSlotData(), profile: created.profile, profileSubmitted: created.profileSubmitted }
          : blankProfileSlotData()
      );
    })();
  }

  function removeProfile(id: string) {
    if (profilesMeta.length <= 1) return;
    const remaining = profilesMeta.filter((m) => m.id !== id);
    delete inactiveProfilesRef.current![id];
    setProfilesMeta(remaining);
    if (id === activeProfileId) {
      const next = remaining[0];
      const target = inactiveProfilesRef.current![next.id] ?? blankProfileSlotData();
      activateProfileData(next.id, target);
    }
  }

  function renameProfile(id: string, label: string) {
    // Keep an empty draft while the added-profile onboarding field is being edited so its
    // Continue button can truthfully stay disabled after the shopper clears the name. The
    // profile switcher's inline rename validates before calling this function.
    const next = label.slice(0, 40);
    setProfilesMeta((m) => m.map((p) => (p.id === id ? { ...p, label: next } : p)));
    scheduleShopperPersist();
  }

  /** Onboarding steps before avatar generation kicks in — used by goBack to step to the
   *  previous one. Generation/avatar-selection aren't in here: there's no "back" out of a
   *  request already in flight, and confirmAvatar/the error path handle those transitions. */
  const ONBOARDING_STEP_ORDER: OnboardingPhase[] = ["audience", "measurements"];

  // Navigating between steps clears any previous avatar-generation failure: the message is
  // pinned to the combined measurements+photo step, so leaving and coming back would otherwise
  // re-surface a stale error the shopper has already moved on from (a retry clears it too, but
  // only on retry).
  function goToStep(phase: OnboardingPhase) {
    setState((s) => ({ ...s, onboardingPhase: phase, avatarGenerationError: null }));
  }

  function goBack() {
    setState((s) => {
      const idx = ONBOARDING_STEP_ORDER.indexOf(s.onboardingPhase);
      if (idx <= 0) return s;
      return { ...s, onboardingPhase: ONBOARDING_STEP_ORDER[idx - 1], avatarGenerationError: null };
    });
  }

  /** Labels applied automatically the first time a profile declares who it's for — only
   *  while the profile still has its auto-assigned "Profile N" label, so a shopper's own
   *  rename (via ProfileSwitcher) is never silently overwritten. */
  const AUDIENCE_PROFILE_LABELS: Record<TryOnAudience, string> = {
    woman: "Me",
    man: "Me",
    unisex: "Me",
    "kids-boy": "My Son",
    "kids-girl": "My Daughter",
    "kids-unisex": "My Kid",
  };

  function selectAudience(audience: TryOnAudience) {
    setState((s) => ({
      ...s,
      profile: { ...s.profile, audience },
      onboardingPhase: "measurements",
      avatarGenerationError: null,
    }));
    setProfilesMeta((m) =>
      m.map((p) =>
        p.id === activeProfileId && /^Profile \d+$/.test(p.label)
          ? { ...p, label: AUDIENCE_PROFILE_LABELS[audience] }
          : p
      )
    );
    scheduleShopperPersist();
  }

  function startAvatarGeneration() {
    if (!isProfileComplete(state.profile)) return;

    if (generationTimerRef.current) clearInterval(generationTimerRef.current);

    setState((s) => ({
      ...s,
      onboardingPhase: "generating",
      generationProgress: 0,
      generationStageIndex: 0,
      avatarsArrived: 0,
      avatarVariations: [],
      avatarGenerationError: null,
      avatarPartialNote: null,
    }));

    // There's no real progress signal until a variation actually streams back (see
    // streamAvatarVariations below), so this whole bar is necessarily a guess. But a guess that
    // freezes dead solid at a fixed percentage the moment Pruna takes longer than expected reads
    // as broken, not "still working" — so instead of stopping at a hard cap, it creeps
    // asymptotically toward 95% for as long as the real request takes, calibrated (via
    // `PROGRESS_TAU_MS`) so it lands right around each stage's threshold at roughly the time
    // Pruna's own "Try-Sync" fast path normally takes, then keeps crawling — slower and slower,
    // never fully stopping — if the real call runs long. It only ever jumps to 100% for real,
    // the instant the first variation actually lands.
    const PROGRESS_CAP = 95;
    const PROGRESS_TAU_MS = 1900;
    const startedAt = Date.now();

    const stopTimer = () => {
      if (generationTimerRef.current) clearInterval(generationTimerRef.current);
      generationTimerRef.current = null;
    };

    generationTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = PROGRESS_CAP * (1 - Math.exp(-elapsed / PROGRESS_TAU_MS));

      let stageIndex = 0;
      for (let i = AVATAR_GENERATION_STAGES.length - 2; i >= 0; i--) {
        if (progress >= AVATAR_GENERATION_STAGES[i].progress) {
          stageIndex = i;
          break;
        }
      }

      setState((s) =>
        s.onboardingPhase === "generating"
          ? { ...s, generationProgress: progress, generationStageIndex: stageIndex }
          : s
      );
    }, 100);

    let receivedAny = false;
    const collected: AvatarVariation[] = [];

    // All 3 Pruna calls already fire in parallel (see generateAvatarVariationsStream).
    // Keep the loading screen up until the whole batch settles, then reveal every
    // style together. Only the cutout the shopper confirms is persisted.
    void streamAvatarVariations(state.profile, embed, (variation) => {
      receivedAny = true;
      collected.push(variation);
      const arrived = Math.min(96, (collected.length / EXPECTED_AVATAR_VARIATION_COUNT) * 92);
      setState((s) =>
        s.onboardingPhase === "generating"
          ? { ...s, generationProgress: Math.max(s.generationProgress, arrived), avatarsArrived: collected.length }
          : s
      );
    }, undefined, embed ? embedSessionIdRef.current : null).then((result) => {
      stopTimer();

      if ("error" in result && !receivedAny) {
        setState((s) => ({ ...s, onboardingPhase: "measurements", avatarGenerationError: result.error, avatarVariations: [] }));
        return;
      }

      const partialNote =
        "successCount" in result && result.successCount > 0 && result.successCount < EXPECTED_AVATAR_VARIATION_COUNT
          ? result.successCount === 1
            ? "We could only generate 1 style this time — feel free to retake the photo for more options."
            : `We generated ${result.successCount} of ${EXPECTED_AVATAR_VARIATION_COUNT} styles this time — you can still pick your favorite below.`
          : null;

      // Variations finish in whatever order the model returns them. The carousel should always
      // start on the same first slide and move through the styles in the same order, so put
      // them back in backdrop (= style) order before they are shown.
      const ordered = [...collected].sort((a, b) => (a.backdropUrl ?? "").localeCompare(b.backdropUrl ?? ""));

      setState((s) => ({
        ...s,
        onboardingPhase: "avatar-selection",
        avatarVariations: ordered,
        generationProgress: 100,
        generationStageIndex: AVATAR_GENERATION_STAGES.length - 1,
        selectedAvatarId: ordered[0]?.id ?? null,
        avatarPartialNote: partialNote,
      }));
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

      const nextProfile = { ...s.profile, avatarUrl, backdropUrl };
      const label = profilesMetaRef.current.find((p) => p.id === activeProfileIdRef.current)?.label ?? "Me";
      void flushShopperProfile(activeProfileIdRef.current, { label, profile: nextProfile }, { includeAvatar: true });

      return {
        ...s,
        profileSubmitted: true,
        onboardingPhase: "audience",
        profile: nextProfile,
        // Drop the unchosen styles — only the confirmed cutout is stored on the account.
        avatarVariations: [],
        customAvatarUrl: null,
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
    scheduleShopperPersist();
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

    const ACCEPTED_BACKDROP_TYPES = ["image/jpeg", "image/png", "image/webp"];
    const MAX_BACKDROP_BYTES = 10 * 1024 * 1024;
    if (!ACCEPTED_BACKDROP_TYPES.includes(file.type)) {
      setState((s) => ({ ...s, backdropUploadError: "Please upload a JPEG, PNG, or WEBP image." }));
      return;
    }
    if (file.size > MAX_BACKDROP_BYTES) {
      setState((s) => ({ ...s, backdropUploadError: "That image is too large — please use one under 10MB." }));
      return;
    }

    setState((s) => ({ ...s, isUploadingBackdrop: true, backdropUploadError: null }));

    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("Couldn't read that image file."));
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
    // acknowledge the new measurements were saved. Same path when the raw source photo is
    // simply no longer in memory (it's deliberately never persisted — see
    // sanitizeProfileForStorage), e.g. the shopper reloaded the page or switched profiles and
    // came back: re-rendering the avatar would need a photo we don't have, but the
    // measurements themselves still drive fit analysis and size recommendations, which is
    // what the shopper actually asked to change.
    if (
      (selectedAvatarIdRef.current === "custom" && customAvatarUrlRef.current) ||
      !profileRef.current.photoBase64
    ) {
      const saved = { ...profileRef.current, ...patch };
      const label = profilesMetaRef.current.find((p) => p.id === activeProfileIdRef.current)?.label ?? "Me";
      void flushShopperProfile(activeProfileIdRef.current, { label, profile: saved });
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
      1,
      embed ? embedSessionIdRef.current : null
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
      const confirmMsg: ChatMessage = {
        id: `msg-regen-${Date.now()}`,
        role: "assistant",
        content:
          "I've updated your avatar with your new measurements — fit analysis and size recommendations are refreshed too!",
        timestamp: new Date().toISOString(),
      };

      const nextProfile = { ...s.profile, avatarUrl: nextAvatarUrl };
      const label = profilesMetaRef.current.find((p) => p.id === activeProfileIdRef.current)?.label ?? "Me";
      void flushShopperProfile(activeProfileIdRef.current, { label, profile: nextProfile }, { includeAvatar: true });

      return {
        ...s,
        isRegeneratingAvatar: false,
        profile: nextProfile,
        messages: [...s.messages, confirmMsg],
      };
    });
  }

  /** Writes measurement edits from the Model Stats popup to the signed-in shopper account.
   *  Does not regenerate the avatar — the source photo is not stored, and the shopper asked
   *  to save numbers, not to spend another render. */
  function saveMeasurements(patch: Partial<TryOnProfile>) {
    const nextProfile = { ...profileRef.current, ...patch };
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
    const label = profilesMetaRef.current.find((p) => p.id === activeProfileIdRef.current)?.label ?? "Me";
    void flushShopperProfile(activeProfileIdRef.current, { label, profile: nextProfile });
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

    const profileContext = {
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      chestCm: profile.chestCm,
      waistCm: profile.waistCm,
      shoeSizeEu: profile.shoeSizeEu,
      photoBase64: profile.photoBase64,
      photoMimeType: profile.photoMimeType,
      avatarUrl: profile.avatarUrl,
      isCustomAvatar: selectedAvatarIdRef.current === "custom",
    };
    const recSizes = recommendSizesForProducts(profileContext, items);

    // This reads chart rows while Pruna renders the image. A chart-service failure must never
    // discard a render the shopper paid and waited for; that version simply shows no analysis.
    const fitPromise: Promise<LookFitAnalysis | null> = fetch(
      embed ? `${embed.apiBase}/persona/fit-analysis` : "/api/agents/persona/fit-analysis",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(embed ? { embedToken: embed.embedToken } : {}),
          productIds: items.map((item) => item.id),
          recommendedSizes: recSizes,
          audience: profile.audience,
          measurements: {
            heightCm: profile.heightCm,
            chestCm: profile.chestCm,
            waistCm: profile.waistCm,
            hipsCm: profile.hipsCm,
            shoeSizeEu: profile.shoeSizeEu,
          },
        }),
      }
    )
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json().catch(() => ({}))) as { fit?: LookFitAnalysis };
        return data.fit ?? null;
      })
      .catch(() => null);

    let imageUrl: string;
    try {
      const res = await fetch(embed ? `${embed.apiBase}/persona/try-on` : "/api/agents/persona/try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(embed ? { embedToken: embed.embedToken } : {}),
          avatarImageUrl: toAbsoluteImageUrl(avatarImageUrl),
          garmentImageUrls: items.map((p) => toAbsoluteImageUrl(p.imageUrl)),
          ...(embed ? { sessionId: embedSessionIdRef.current } : {}),
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

    const fitNotes = buildFitNote(profileContext);
    const snapshotId = `tryon-${Date.now()}`;

    const snapshot: GeneratedTryOn = {
      id: snapshotId,
      imageUrl,
      outfitProducts: [...items],
      recommendedSizes: recSizes,
      fitNotes,
      fit: null,
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
    // Do not hold the completed image screen open for a catalog read. The card appears on this
    // exact version when its analysis lands; a null/failure stays honestly hidden.
    void fitPromise.then((fit) => {
      if (!fit) return;
      setState((s) => ({
        ...s,
        tryOnImages: s.tryOnImages.map((version) =>
          version.id === snapshotId ? { ...version, fit } : version
        ),
      }));
    });
    logTryOnEvent(snapshot.outfitProducts, recSizes);
  }

  /** Fire-and-forget log of one chat turn — the shopper (or, for the dashboard's own preview,
   *  the merchant testing their workspace) already sent/saw it, this just tells the
   *  usage/analytics dashboards it happened. Embedded surfaces (preview link or real widget.js)
   *  go through the public `/api/embed/chat-event`; the dashboard's own authenticated preview
   *  goes through `/api/agents/chat-event` instead, keyed by workspaceId rather than an embed
   *  token — silently no-ops if neither is available (e.g. no workspaceId was ever passed in). */
  function logChatEvent(role: "user" | "assistant", topic?: string | null, attribution?: TurnAttribution | null) {
    if (embed) {
      const sessionId = getOrCreateEmbedSessionId(embed.embedToken);
      void fetch(`${embed.apiBase}/chat-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedToken: embed.embedToken, sessionId, role, topic, attribution }),
      }).catch(() => {});
      return;
    }
    if (!workspaceId || !dashboardSessionIdRef.current) return;
    void fetch("/api/agents/chat-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, sessionId: dashboardSessionIdRef.current, role, topic, attribution }),
    }).catch(() => {});
  }

  function stopScanTicker() {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }

  /** Runs only for the server's explicit `activity: "bundle"` signal, never for a plain search. */
  function startBundleProgressTicker() {
    if (scanTimerRef.current) return;
    setState((s) => ({ ...s, isTyping: false, isScanning: true, scanStageIndex: 0, scanResultCount: null }));
    scanTimerRef.current = setInterval(() => {
      setState((s) => ({ ...s, scanStageIndex: Math.min(s.scanStageIndex + 1, SCAN_STAGES.length - 1) }));
    }, SCAN_STAGE_DURATION_MS);
  }

  /** Sends one turn to the agents and streams the response, applying each SSE event to local
   *  state as it arrives. `trigger` is set only for the "Complete the look" click. */
  async function streamChatTurn(
    history: ChatMessage[],
    trigger?: { type: "complete_look"; productId: string; askBudget?: boolean }
  ) {
    setState((s) => ({ ...s, isTyping: true, typingStage: "thinking" }));

    let assistantMessageId: string | null = null;
    // Quick options can arrive before the reply text; holding them until text lands avoids an
    // empty assistant bubble with chips under it.
    let pendingQuickOptions: string[] | null = null;
    let turnAttribution: TurnAttribution | null = null;
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
        for (const product of products) {
          const fitSizes = product.fitSizes ?? s.knownProducts[product.id]?.fitSizes;
          next[product.id] = fitSizes ? { ...product, fitSizes } : product;
        }
        // Keep the ref in sync immediately so later events in the same SSE turn can resolve
        // products without waiting for a re-render.
        knownProductsRef.current = next;
        return { ...s, knownProducts: next };
      });
    };

    try {
      // Text only: the server rehydrates products by id, and the model needs nothing else.
      const slimHistory = history.map((m) => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp }));

      const res = await fetch(embed ? `${embed.apiBase}/wearable` : "/api/agents/wearable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(embed ? { embedToken: embed.embedToken, sessionId: embedSessionIdRef.current } : {}),
          messages: slimHistory,
          audience: profileRef.current.audience,
          measurements: {
            heightCm: profileRef.current.heightCm,
            chestCm: profileRef.current.chestCm,
            waistCm: profileRef.current.waistCm,
            hipsCm: profileRef.current.hipsCm,
            shoeSizeEu: profileRef.current.shoeSizeEu,
          },
          budget: budgetRef.current,
          retrievalState: retrievalStateRef.current,
          attachment: trigger ? null : wireAttachment(attachmentRef.current),
          ...(trigger ? { trigger } : {}),
        }),
      });

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

        const { events, rest } = parseSseChunk<AgentEvent>(buffer);
        buffer = rest;

        for (const event of events) {
          sawAnyEvent = true;
          // Only a result the shopper can actually see ends the wait. Clearing the indicator on
          // bookkeeping events left the chat looking dead until the reply arrived.
          if (SHOPPER_VISIBLE_EVENTS.has(event.type)) {
            setState((s) => (s.isTyping ? { ...s, isTyping: false } : s));
          }

          switch (event.type) {
            case "status": {
              if (event.stage === "composing") {
                startBundleProgressTicker();
              } else {
                setState((s) => ({ ...s, typingStage: event.stage }));
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
              patchAssistantMessage({ productRecommendations: event.productIds, retrievalNote: event.note });
              break;
            }
            case "quick_options": {
              if (assistantMessageId) patchAssistantMessage({ quickOptions: event.options });
              else pendingQuickOptions = event.options;
              break;
            }
            case "budget_request": {
              patchAssistantMessage({
                budgetPrompt: { anchorId: event.anchorId, budget: event.budget, suggestions: event.suggestions },
              });
              break;
            }
            case "attachment": {
              const next: ChatAttachment | null =
                event.attachment?.kind === "look" ? { kind: "look", look: event.attachment.look } : null;
              // The server only ever detaches or refreshes an attached look; an item attachment
              // it drops is simply cleared.
              if (event.attachment === null || next) {
                attachmentRef.current = next;
                setState((s) => ({ ...s, attachment: next }));
              }
              break;
            }
            case "retrieval_state": {
              retrievalStateRef.current = { shownProductIds: event.shownProductIds, lastSearch: event.lastSearch };
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
            case "error": {
              stopScanTicker();
              patchAssistantMessage({ content: event.message });
              setState((s) => ({ ...s, isScanning: false }));
              break;
            }
            case "attribution": {
              turnAttribution = event.attribution;
              patchAssistantMessage({ attribution: event.attribution });
              break;
            }
            case "done": {
              if (pendingQuickOptions) patchAssistantMessage({ quickOptions: pendingQuickOptions });
              logChatEvent("assistant", null, turnAttribution);
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

  function appendUserMessage(content: string): ChatMessage[] {
    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...messagesRef.current, userMsg];
    messagesRef.current = nextHistory;
    setState((s) => ({ ...s, messages: nextHistory }));
    logChatEvent("user", null);
    return nextHistory;
  }

  async function sendMessage(text?: string) {
    const content = (text ?? state.input).trim();
    if (!content) return;
    setState((s) => ({ ...s, input: "" }));
    const last = state.messages[state.messages.length - 1];
    const typedBudget = last?.role === "assistant" && last.budgetPrompt ? parseTypedBudget(content) : undefined;
    if (last?.budgetPrompt && typedBudget !== undefined) {
      await chooseLookBudget(last.budgetPrompt.anchorId, typedBudget, content);
      return;
    }
    await streamChatTurn(appendUserMessage(content));
  }

  /** "Complete the look" on a card: that item becomes the anchor of a new outfit. The first turn
   *  only asks for the budget; the looks are built once the shopper answers. Any attachment is
   *  cleared — the looks that come back are the new subject. */
  async function completeLook(product: Product) {
    attachmentRef.current = null;
    setState((s) => ({ ...s, attachment: null }));
    await streamChatTurn(appendUserMessage(`Complete the look with ${product.name}`), {
      type: "complete_look",
      productId: product.id,
      askBudget: true,
    });
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
                  ...(product.fitSizes?.length ? { sizes: product.fitSizes } : {}),
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
          const source = attributionForProduct(messagesRef.current, product.id);
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
              attribution: source?.attribution ?? null,
              lookId: source?.lookId ?? null,
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

  /** "Ask about this item": every typed turn is about this product until detached. */
  function attachItem(product: Product) {
    const next: ChatAttachment = { kind: "item", product };
    attachmentRef.current = next;
    setState((s) => ({ ...s, attachment: next }));
  }

  /** "Ask about this bundle": every typed turn is about this look until detached. */
  function attachLook(bundle: BundleSuggestion) {
    if (!isLookRecord(bundle)) return;
    const next: ChatAttachment = { kind: "look", look: bundle };
    attachmentRef.current = next;
    setState((s) => ({ ...s, attachment: next }));
  }

  function detach() {
    attachmentRef.current = null;
    setState((s) => ({ ...s, attachment: null }));
  }

  /** The answer to the budget question (a card tap, or an amount typed in chat): saves the budget
   *  (null for no limit) and builds the looks around the anchor with it. */
  async function chooseLookBudget(anchorId: string, value: number | null, typed?: string) {
    const budget = typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
    const anchor = knownProductsRef.current[anchorId];
    budgetRef.current = budget;
    setState((s) => ({ ...s, budget }));
    if (!anchor) return;
    attachmentRef.current = null;
    setState((s) => ({ ...s, attachment: null }));
    const label = typed ?? (budget === null ? "No budget limit" : `My budget is ${formatBudget(budget, anchor.currency)}`);
    await streamChatTurn(appendUserMessage(label), { type: "complete_look", productId: anchorId });
  }

  const profileComplete = isProfileComplete(state.profile);
  const measurementsComplete = isMeasurementsComplete(state.profile);
  const currentTryOn = state.tryOnImages[state.currentImageIndex] ?? null;

  return {
    ...state,
    currentTryOn,
    updateProfile,
    goToStep,
    goBack,
    selectAudience,
    startAvatarGeneration,
    selectAvatar,
    uploadCustomAvatar,
    confirmAvatar,
    setInput,
    sendMessage,
    regenerateAvatar,
    saveMeasurements,
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
    completeLook,
    attachItem,
    attachLook,
    detach,
    chooseLookBudget,
    profileComplete,
    measurementsComplete,
    // Up to MAX_TRYON_PROFILES per shopper account at this store.
    profiles: profilesMeta,
    activeProfileId,
    maxProfiles: MAX_TRYON_PROFILES,
    switchProfile,
    addProfile,
    removeProfile,
    renameProfile,
  };
}

export type UseTryOnAgentReturn = ReturnType<typeof useTryOnAgent>;
