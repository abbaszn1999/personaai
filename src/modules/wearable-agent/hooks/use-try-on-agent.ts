"use client";

import * as React from "react";
import type { ChatMessage } from "@/modules/shopping-agent/types";
import type { TryOnProfile } from "@/modules/wearable-agent/types";
import type { Product } from "@/modules/shopping-agent/types";
import {
  INITIAL_WEARABLE_MESSAGE,
  getWearableMockResponse,
  MOCK_TRY_ON_IMAGES,
} from "../mocks/responses";

const INITIAL_PROFILE: TryOnProfile = {
  photoUrl: null,
  heightCm: null,
  weightKg: null,
  bodyShape: null,
  chestCm: null,
  waistCm: null,
  hipsCm: null,
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

interface TryOnAgentState {
  profile: TryOnProfile;
  profileSubmitted: boolean;
  messages: ChatMessage[];
  outfitItems: Product[];
  input: string;
  isTyping: boolean;
  isGenerating: boolean;
  // image history
  tryOnImages: GeneratedTryOn[];
  currentImageIndex: number;
}

// Phrases that trigger auto-generation from the agent
const GENERATE_TRIGGERS = ["try", "generate", "preview", "photo", "show me", "create image", "see how"];

export function useTryOnAgent() {
  const [state, setState] = React.useState<TryOnAgentState>({
    profile: INITIAL_PROFILE,
    profileSubmitted: false,
    messages: [],
    outfitItems: [],
    input: "",
    isTyping: false,
    isGenerating: false,
    tryOnImages: [],
    currentImageIndex: 0,
  });

  // Stable refs so async generateTryOn can read the latest values without
  // re-binding. Synced after each relevant render (never mutated during render).
  const outfitRef = React.useRef<Product[]>(state.outfitItems);
  const profileRef = React.useRef<TryOnProfile>(state.profile);
  React.useEffect(() => {
    outfitRef.current = state.outfitItems;
    profileRef.current = state.profile;
  }, [state.outfitItems, state.profile]);

  function updateProfile(patch: Partial<TryOnProfile>) {
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  }

  function submitProfile() {
    setState((s) => ({
      ...s,
      profileSubmitted: true,
      messages: [INITIAL_WEARABLE_MESSAGE],
    }));
  }

  function setInput(input: string) {
    setState((s) => ({ ...s, input }));
  }

  async function generateTryOn(productsOverride?: Product[]) {
    const items = productsOverride ?? outfitRef.current;
    if (items.length === 0) return;

    setState((s) => ({ ...s, isGenerating: true }));
    await new Promise((r) => setTimeout(r, 2400));

    const imageUrl = MOCK_TRY_ON_IMAGES[Math.floor(Math.random() * MOCK_TRY_ON_IMAGES.length)];
    const profile = profileRef.current;

    const recSizes: Record<string, string> = {};
    items.forEach((p) => {
      const h = profile.heightCm ?? 170;
      const w = profile.weightKg ?? 65;
      const bmi = w / ((h / 100) ** 2);
      recSizes[p.id] = bmi < 19 ? "XS" : bmi < 22 ? "S" : bmi < 25 ? "M" : bmi < 28 ? "L" : "XL";
    });

    const snapshot: GeneratedTryOn = {
      id: `tryon-${Date.now()}`,
      imageUrl,
      outfitProducts: [...items],
      recommendedSizes: recSizes,
      fitNotes:
        "Great fit based on your measurements. The silhouette flatters your body shape — consider going one size up if you prefer a relaxed fit.",
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
        fitNotes: snapshot.fitNotes,
      },
    };

    setState((s) => ({
      ...s,
      isGenerating: false,
      tryOnImages: [...s.tryOnImages, snapshot],
      currentImageIndex: s.tryOnImages.length, // point to the new image
      messages: [...s.messages, imageMsg],
    }));
  }

  async function sendMessage(text?: string) {
    const content = (text ?? state.input).trim();
    if (!content) return;
    setState((s) => ({ ...s, input: "", isTyping: true }));

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    setState((s) => ({ ...s, messages: [...s.messages, userMsg] }));

    const isGenerateTrigger =
      GENERATE_TRIGGERS.some((t) => content.toLowerCase().includes(t)) &&
      outfitRef.current.length > 0;

    await new Promise((r) => setTimeout(r, 900 + Math.random() * 700));

    const response = isGenerateTrigger
      ? {
          id: `msg-${Date.now()}`,
          role: "assistant" as const,
          content: `Perfect! I'm generating your try-on preview now with the ${outfitRef.current.length} item${outfitRef.current.length > 1 ? "s" : ""} in your outfit. Just a moment…`,
          timestamp: new Date().toISOString(),
        }
      : getWearableMockResponse(content);

    setState((s) => ({
      ...s,
      isTyping: false,
      messages: [...s.messages, response],
    }));

    // Auto-trigger image generation after showing the "generating…" message
    if (isGenerateTrigger) {
      await generateTryOn(outfitRef.current);
    }
  }

  function addToOutfit(product: Product) {
    setState((s) => {
      if (s.outfitItems.some((p) => p.id === product.id)) return s;
      if (s.outfitItems.length >= 6) return s;
      return { ...s, outfitItems: [...s.outfitItems, product] };
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

  const profileComplete =
    (state.profile.heightCm !== null && state.profile.heightCm > 0) ||
    (state.profile.weightKg !== null && state.profile.weightKg > 0);

  const currentTryOn = state.tryOnImages[state.currentImageIndex] ?? null;

  return {
    ...state,
    currentTryOn,
    updateProfile,
    submitProfile,
    setInput,
    sendMessage,
    addToOutfit,
    removeFromOutfit,
    generateTryOn,
    prevImage,
    nextImage,
    profileComplete,
  };
}

export type UseTryOnAgentReturn = ReturnType<typeof useTryOnAgent>;
