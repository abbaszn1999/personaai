"use client";

import * as React from "react";
import type { ChatMessage, Product } from "@/modules/shopping-agent/types";
import type { IntakeState, UnwearableAgentEvent } from "@/lib/agents/unwearable-chat-agent";
import { useOpenaiApiKey } from "@/modules/billing/hooks/use-openai-api-key";
import { parseBudgetMax } from "@/lib/recommendations";
import { getOrCreateEmbedSessionId, loadEmbedState, saveEmbedState } from "@/lib/embed/client/embed-storage";
import type { EmbedRuntimeConfig } from "@/lib/embed/client/types";
import { addItemToWooCommerceCart } from "@/lib/woocommerce/store-api-client";
import { addItemToShopifyCart } from "@/lib/shopify/ajax-cart-client";
import { buildInitialMessage, SCAN_STAGES, SCAN_STAGE_DURATION_MS } from "../mocks/responses";

const GENERIC_CHAT_ERROR = "Sorry, something went wrong on my end. Please try that again.";

export type { EmbedRuntimeConfig };

/** Shape persisted to localStorage for an embedded session — deliberately a subset of the
 *  full in-memory state (no loading/animation flags, nothing already derivable from a fetch). */
interface PersistedEmbedState {
  messages: ChatMessage[];
  knownProducts: Record<string, Product>;
  intakeAnswers: IntakeState;
  solutionProductIds: string[];
  cartItemIds: string[];
}

interface ShoppingAgentState {
  messages: ChatMessage[];
  input: string;
  isTyping: boolean;
  isScanning: boolean;
  scanStageIndex: number;
  scanResultCount: number | null;
  knownProducts: Record<string, Product>;
  intakeAnswers: IntakeState;
  /** User-curated staging kit (added from chat, not auto-populated). */
  solutionProductIds: string[];
  /** The (optimistic) cart — populated by "Add All to Cart" on the board or chat add_to_cart. */
  cartItemIds: string[];
  /** Product ids currently mid-flight to the real store cart (resolving variant + platform
   *  mutation) — surfaced so buttons can show a spinner instead of looking silently stuck. */
  pendingCartItemIds: string[];
  cartSyncError: string | null;
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

export interface UseShoppingAgentReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  isTyping: boolean;
  isScanning: boolean;
  scanStageIndex: number;
  scanResultCount: number | null;
  sendMessage: (text?: string) => void;
  /** Every product the agent has surfaced so far, by id — used to resolve message
   *  productRecommendations / bundles into full cards. */
  knownProducts: Record<string, Product>;
  // Solution kit — items explicitly added by the user from the chat
  solutionProducts: Product[];
  solutionProductIdSet: Set<string>;
  addToSolutionBoard: (product: Product) => void;
  removeSolutionProduct: (productId: string) => void;
  // Real store cart — populated when user taps "Add to Cart" / "Add All to Cart" or asks in chat
  cartItemIdSet: Set<string>;
  pendingCartItemIdSet: Set<string>;
  addToCart: (product: Product, variantId?: string) => void;
  addAllBoardToCart: () => void;
  cartSyncError: string | null;
  // Context for the board header
  topic: string | null;
  budget: number | null;
  // Quick option handler (same as sendMessage but from chip)
  onQuickOption: (label: string) => void;
  // Dashboard-only BYO-key gating (always "has key" in embeds — server enforces it there)
  hasOpenAiKey: boolean;
  openAiKeyLoading: boolean;
}

/**
 * The real Shopping Assistant hook — streams turns from the unwearable chat agent over SSE
 * and applies each event to local state, mirroring the wearable use-try-on-agent's chat
 * pipeline (minus avatars/try-on). Replaces the old keyword-matched mock responder.
 */
export function useShoppingAgent(
  embed?: EmbedRuntimeConfig,
  welcomeMessage?: string,
  workspaceId?: string
): UseShoppingAgentReturn {
  // The embedded page has no shopper login, so there's no `/api/account/api-key` to check —
  // the server already guarantees the merchant has one configured before enabling the embed.
  const openaiKey = useOpenaiApiKey(!embed);

  const persisted = embed ? loadEmbedState<PersistedEmbedState>(embed.embedToken) : null;

  const [state, setState] = React.useState<ShoppingAgentState>({
    messages: persisted?.messages?.length ? persisted.messages : [buildInitialMessage(welcomeMessage)],
    input: "",
    isTyping: false,
    isScanning: false,
    scanStageIndex: 0,
    scanResultCount: null,
    knownProducts: persisted?.knownProducts ?? {},
    intakeAnswers: persisted?.intakeAnswers ?? {},
    solutionProductIds: persisted?.solutionProductIds ?? [],
    cartItemIds: persisted?.cartItemIds ?? [],
    pendingCartItemIds: [],
    cartSyncError: null,
  });

  // Refs so async callbacks / mid-stream handlers always see the latest values.
  const messagesRef = React.useRef(state.messages);
  const knownProductsRef = React.useRef(state.knownProducts);
  const intakeAnswersRef = React.useRef(state.intakeAnswers);
  React.useEffect(() => { messagesRef.current = state.messages; }, [state.messages]);
  React.useEffect(() => { knownProductsRef.current = state.knownProducts; }, [state.knownProducts]);
  React.useEffect(() => { intakeAnswersRef.current = state.intakeAnswers; }, [state.intakeAnswers]);

  const embedSessionIdRef = React.useRef<string | null>(null);
  if (embed && embedSessionIdRef.current === null) {
    embedSessionIdRef.current = getOrCreateEmbedSessionId(embed.embedToken);
  }
  /** Per-tab session id for the dashboard's own authenticated preview — see logChatEvent. */
  const dashboardSessionIdRef = React.useRef<string | null>(null);
  if (!embed && dashboardSessionIdRef.current === null) {
    dashboardSessionIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // Serializes every real-cart mutation (across separate "Add to Cart" clicks, not just
  // products within one click) so they never hit the store's cart endpoint concurrently — see
  // syncProductsToRealCart for why that matters.
  const cartSyncQueueRef = React.useRef<Promise<void>>(Promise.resolve());

  // Mirror the durable subset of state into localStorage so an embedded session survives
  // a page reload — same pattern (and storage namespace helpers) as the wearable widget.
  React.useEffect(() => {
    if (!embed) return;
    saveEmbedState<PersistedEmbedState>(embed.embedToken, {
      messages: state.messages,
      knownProducts: state.knownProducts,
      intakeAnswers: state.intakeAnswers,
      solutionProductIds: state.solutionProductIds,
      cartItemIds: state.cartItemIds,
    });
  }, [embed, state.messages, state.knownProducts, state.intakeAnswers, state.solutionProductIds, state.cartItemIds]);

  /** Flushes `cartItemIds` to localStorage synchronously, bypassing the reactive effect above.
   *  Needed because adding to a real Shopify cart can now trigger a same-tick page reload (the
   *  Standard Storefront Action's default fallback on themes that don't support an in-place
   *  refresh — see addItemToShopifyCart) — if that reload lands before React's effect has had a
   *  chance to run, the just-added item's "in cart" state would otherwise never make it to
   *  localStorage and would appear lost after the reload even though the real cart mutation may
   *  have already succeeded. Every other field is read from whatever's already fresh (refs, or
   *  the calling render's `state` closure) since none of them race with this. */
  function persistCartItemIdsNow(nextCartItemIds: string[]) {
    if (!embed) return;
    saveEmbedState<PersistedEmbedState>(embed.embedToken, {
      messages: messagesRef.current,
      knownProducts: knownProductsRef.current,
      intakeAnswers: intakeAnswersRef.current,
      solutionProductIds: state.solutionProductIds,
      cartItemIds: nextCartItemIds,
    });
  }

  /** Fire-and-forget log of one chat turn — the shopper (or, for the dashboard's own preview,
   *  the merchant testing their workspace) already sent/saw it, this just tells the
   *  usage/analytics dashboards it happened. Embedded surfaces (preview link or real
   *  widget.js) go through the public `/api/embed/chat-event`; the dashboard's own
   *  authenticated `/assistant` preview goes through `/api/agents/chat-event` instead, keyed
   *  by workspaceId rather than an embed token. */
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

  const scanTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  React.useEffect(() => () => stopScanTicker(), []);

  function stopScanTicker() {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }

  function startScanTicker() {
    if (scanTimerRef.current) return;
    setState((s) => ({ ...s, isScanning: true, scanStageIndex: 0, scanResultCount: null }));
    scanTimerRef.current = setInterval(() => {
      setState((s) => ({ ...s, scanStageIndex: Math.min(s.scanStageIndex + 1, SCAN_STAGES.length - 1) }));
    }, SCAN_STAGE_DURATION_MS);
  }

  /** Sends one turn to the real Unwearable Chat Agent and streams the response, applying each
   *  SSE event to local state as it arrives. */
  async function streamChatTurn(history: ChatMessage[]) {
    setState((s) => ({ ...s, isTyping: true }));

    let assistantMessageId: string | null = null;
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
        // Keep the ref in sync immediately so later events in the same SSE turn can resolve
        // products without waiting for a re-render.
        knownProductsRef.current = next;
        return { ...s, knownProducts: next };
      });
    };

    try {
      const slimHistory = history.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        productRecommendations: m.productRecommendations,
        catalogMatchType: m.catalogMatchType,
        bundles: m.bundles,
        quickOptions: m.quickOptions,
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
        }));

      const res = await fetch(embed ? `${embed.apiBase}/unwearable` : "/api/agents/unwearable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(embed ? { embedToken: embed.embedToken, sessionId: embedSessionIdRef.current } : {}),
          messages: slimHistory,
          knownProducts: slimProducts(Object.values(knownProductsRef.current)),
          intake: intakeAnswersRef.current,
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

        const { events, rest } = parseSseChunk<UnwearableAgentEvent>(buffer);
        buffer = rest;

        for (const event of events) {
          sawAnyEvent = true;
          setState((s) => (s.isTyping ? { ...s, isTyping: false } : s));

          switch (event.type) {
            case "tool": {
              if (event.tool === "search_catalog" && event.status === "start") {
                startScanTicker();
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
              setState((s) => ({
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMessageId ? { ...m, content: m.content + event.delta } : m
                ),
              }));
              break;
            }
            case "product_recommendations": {
              patchAssistantMessage({
                productRecommendations: event.productIds,
                catalogMatchType: event.matchType,
              });
              break;
            }
            case "bundle": {
              mergeKnownProducts(event.products);
              ensureAssistantMessage();
              setState((s) => ({
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        bundles: [...(m.bundles ?? []).filter((b) => b.id !== event.bundle.id), event.bundle],
                      }
                    : m
                ),
              }));
              break;
            }
            case "add_to_cart": {
              mergeKnownProducts(event.products);
              // Computed inside the updater (not from a possibly-stale outer closure) and
              // stashed here so the real-cart sync fires with exactly the same "actually new"
              // set the optimistic UI update used, in the same tick.
              let toAdd: Product[] = [];
              let nextCartItemIds: string[] = [];
              setState((s) => {
                const existing = new Set(s.cartItemIds);
                toAdd = event.products.filter((p) => !existing.has(p.id));
                nextCartItemIds = toAdd.length > 0 ? [...s.cartItemIds, ...toAdd.map((p) => p.id)] : s.cartItemIds;
                return toAdd.length > 0 ? { ...s, cartItemIds: nextCartItemIds } : s;
              });
              if (toAdd.length > 0) {
                persistCartItemIdsNow(nextCartItemIds);
                syncProductsToRealCart(toAdd);
              }
              break;
            }
            case "intake": {
              setState((s) => ({ ...s, intakeAnswers: event.intake }));
              break;
            }
            case "error": {
              stopScanTicker();
              patchAssistantMessage({ content: event.message });
              setState((s) => ({ ...s, isScanning: false }));
              break;
            }
            case "done": {
              logChatEvent("assistant", intakeAnswersRef.current.useCase ?? null);
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
      setState((s) => ({ ...s, isTyping: false, isScanning: false }));
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
    logChatEvent("user", intakeAnswersRef.current.useCase ?? null);

    await streamChatTurn(nextHistory);
  }

  /** Fires the real store cart mutation for widget.js only (see EmbedRuntimeConfig).
   *  Never awaited by the caller — the widget's own cart list already updated optimistically,
   *  so a slow/failed store sync only surfaces as a transient error toast, it never blocks or
   *  reverts the shopper's own in-widget "added" state. Supports WordPress/WooCommerce Store
   *  API and Shopify Ajax `/cart/add.js` via the unified `/cart-item` resolver. `variantId`
   *  (Shopify only) is only meaningful for a single-product call — bulk adds keep today's
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
            // starts — not upfront for the whole batch (see addToCart/addAllBoardToCart). If a
            // same-tick page reload fires from here on out (e.g. the next item's own
            // Shopify.actions.updateCart call), this item's success is already durably recorded.
            let confirmedCartItemIds: string[] = [];
            setState((s) => {
              confirmedCartItemIds = s.cartItemIds.includes(product.id) ? s.cartItemIds : [...s.cartItemIds, product.id];
              return { ...s, cartItemIds: confirmedCartItemIds };
            });
            persistCartItemIdsNow(confirmedCartItemIds);
          } catch (err) {
            lastError = err;
            console.error(`[use-shopping-agent] real cart sync attempt ${attempt} failed for "${product.name}"`, err);
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
          // Roll back the optimistic "Added" mark — otherwise a one-time failure (dropped
          // request, Shopify hiccup, etc.) leaves the button permanently stuck showing
          // "Added" with nothing actually in the real cart, and no way to ever retry it
          // since addToCart/addAllBoardToCart both de-dupe against cartItemIds.
          let rolledBackCartItemIds: string[] = [];
          setState((s) => {
            rolledBackCartItemIds = s.cartItemIds.filter((id) => id !== product.id);
            return { ...s, cartItemIds: rolledBackCartItemIds, cartSyncError: message };
          });
          persistCartItemIdsNow(rolledBackCartItemIds);
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

  // ── Solution kit (staging board) ────────────────────────────────────────────

  const solutionProducts = React.useMemo(
    () =>
      state.solutionProductIds
        .map((id) => state.knownProducts[id])
        .filter((p): p is Product => !!p),
    [state.solutionProductIds, state.knownProducts]
  );

  const solutionProductIdSet = React.useMemo(
    () => new Set(state.solutionProductIds),
    [state.solutionProductIds]
  );

  const cartItemIdSet = React.useMemo(() => new Set(state.cartItemIds), [state.cartItemIds]);
  const pendingCartItemIdSet = React.useMemo(
    () => new Set(state.pendingCartItemIds),
    [state.pendingCartItemIds]
  );

  function addToSolutionBoard(product: Product) {
    setState((s) => {
      const known = s.knownProducts[product.id] ? s.knownProducts : { ...s.knownProducts, [product.id]: product };
      return {
        ...s,
        knownProducts: known,
        solutionProductIds: s.solutionProductIds.includes(product.id)
          ? s.solutionProductIds
          : [...s.solutionProductIds, product.id],
      };
    });
  }

  function removeSolutionProduct(productId: string) {
    setState((s) => ({ ...s, solutionProductIds: s.solutionProductIds.filter((id) => id !== productId) }));
  }

  function addToCart(product: Product, variantId?: string) {
    if (state.cartItemIds.includes(product.id)) return;
    // Real-cart syncs mark each product "Added" only once its own sync individually
    // succeeds (see syncProductsToRealCart) — Shopify's Standard Storefront Action can
    // trigger a same-tick full page reload as its refresh fallback, especially on a
    // brand-new cart, and eagerly marking here would survive that reload even though the
    // mutation may not have actually landed yet. Non-real-cart callers (dashboard's own
    // mocked preview, or the `/embed/[token]` preview page) never reach that success path
    // at all, so they still need the instant optimistic mark for their demo UI to work.
    const isRealCartSync = !!embed?.enableRealCart;
    let nextCartItemIds: string[] = state.cartItemIds;
    setState((s) => {
      const known = s.knownProducts[product.id]
        ? s.knownProducts
        : { ...s.knownProducts, [product.id]: product };
      if (!isRealCartSync) {
        nextCartItemIds = s.cartItemIds.includes(product.id) ? s.cartItemIds : [...s.cartItemIds, product.id];
      }
      return { ...s, knownProducts: known, cartItemIds: nextCartItemIds };
    });
    if (!isRealCartSync) persistCartItemIdsNow(nextCartItemIds);
    syncProductsToRealCart([product], variantId);
  }

  function addAllBoardToCart() {
    // See addToCart's comment — real-cart syncs mark items "Added" incrementally as each
    // one's own mutation actually succeeds, not as a single upfront batch, so a mid-batch
    // page reload (Shopify's Standard Action refresh fallback) can't strand not-yet-synced
    // items in a permanent, un-retryable "Added" state with nothing in the real cart.
    const isRealCartSync = !!embed?.enableRealCart;
    // Compute from this render's state before scheduling any React update. Reading a variable
    // assigned inside a setState updater immediately after setState is invalid: React may defer
    // that updater, leaving `toAdd` empty on the first click and making the second click appear
    // to be required.
    const existing = new Set(state.cartItemIds);
    const toAdd = state.solutionProductIds
      .map((id) => state.knownProducts[id])
      .filter((p): p is Product => !!p && !existing.has(p.id));
    const nextCartItemIds = [...state.cartItemIds, ...toAdd.map((p) => p.id)];

    if (toAdd.length > 0) {
      if (!isRealCartSync) {
        setState((s) => ({ ...s, cartItemIds: nextCartItemIds }));
        persistCartItemIdsNow(nextCartItemIds);
      }
      syncProductsToRealCart(toAdd);
    }
  }

  const budgetMax = parseBudgetMax(state.intakeAnswers.budget);

  return {
    messages: state.messages,
    input: state.input,
    setInput: (v: string) => setState((s) => ({ ...s, input: v })),
    isTyping: state.isTyping,
    isScanning: state.isScanning,
    scanStageIndex: state.scanStageIndex,
    scanResultCount: state.scanResultCount,
    sendMessage,
    knownProducts: state.knownProducts,
    solutionProducts,
    solutionProductIdSet,
    addToSolutionBoard,
    removeSolutionProduct,
    cartItemIdSet,
    pendingCartItemIdSet,
    addToCart,
    addAllBoardToCart,
    cartSyncError: state.cartSyncError,
    topic: state.intakeAnswers.useCase ?? null,
    budget: budgetMax,
    onQuickOption: sendMessage,
    hasOpenAiKey: embed ? true : openaiKey.hasKey,
    openAiKeyLoading: embed ? false : openaiKey.loading,
  };
}
