"use client";

import * as React from "react";
import type { ChatMessage } from "@/modules/shopping-agent/types";
import type { AvatarVariation, OnboardingPhase, TryOnProfile } from "@/modules/wearable-agent/types";
import type { Product } from "@/modules/shopping-agent/types";
import { MOCK_WEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";
import {
  AVATAR_GENERATION_STAGES,
  MOCK_AVATAR_VARIATIONS,
  pickAvatarForBodyShape,
} from "../constants";
import {
  buildRecommendationMessage,
  getBundleSuggestionMessage,
  getIntakeQuestionMessage,
  getWearableMockResponse,
  INITIAL_WEARABLE_MESSAGE,
  INTAKE_QUESTIONS,
  MOCK_TRY_ON_IMAGES,
  SCAN_STAGE_DURATION_MS,
  SCAN_STAGES,
  type IntakeAnswers,
} from "../mocks/responses";

const INITIAL_PROFILE: TryOnProfile = {
  photoUrl: null,
  heightCm: null,
  weightKg: null,
  bodyShape: null,
  chestCm: null,
  waistCm: null,
  hipsCm: null,
  avatarUrl: null,
};

const GENERATION_DURATION_MS = 4200;

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
  onboardingPhase: OnboardingPhase;
  profileSubmitted: boolean;
  generationProgress: number;
  generationStageIndex: number;
  avatarVariations: AvatarVariation[];
  selectedAvatarId: string | null;
  customAvatarUrl: string | null;
  messages: ChatMessage[];
  outfitItems: Product[];
  input: string;
  isTyping: boolean;
  isGenerating: boolean;
  isRegeneratingAvatar: boolean;
  tryOnImages: GeneratedTryOn[];
  currentImageIndex: number;
  cartItems: Product[];
  /** Index into INTAKE_QUESTIONS while the agent is in "ask mode"; null once complete. */
  intakeIndex: number | null;
  intakeAnswers: IntakeAnswers;
  isScanning: boolean;
  scanStageIndex: number;
}

// Phrases that trigger auto-generation from the agent
const GENERATE_TRIGGERS = ["try", "generate", "preview", "photo", "show me", "create image", "see how"];
const BUNDLE_TRIGGERS = [
  "bundle",
  "full outfit",
  "complete the look",
  "whole look",
  "build me an outfit",
  "outfit for me",
];

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
    profile.bodyShape !== null
  );
}

export function useTryOnAgent() {
  const [state, setState] = React.useState<TryOnAgentState>({
    profile: INITIAL_PROFILE,
    onboardingPhase: "profile",
    profileSubmitted: false,
    generationProgress: 0,
    generationStageIndex: 0,
    avatarVariations: MOCK_AVATAR_VARIATIONS,
    selectedAvatarId: null,
    customAvatarUrl: null,
    messages: [],
    outfitItems: [],
    input: "",
    isTyping: false,
    isGenerating: false,
    isRegeneratingAvatar: false,
    tryOnImages: [],
    currentImageIndex: 0,
    cartItems: [],
    intakeIndex: null,
    intakeAnswers: {},
    isScanning: false,
    scanStageIndex: 0,
  });

  const generationTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const customAvatarUrlRef = React.useRef<string | null>(null);

  const outfitRef = React.useRef<Product[]>(state.outfitItems);
  const profileRef = React.useRef<TryOnProfile>(state.profile);
  const intakeIndexRef = React.useRef<number | null>(state.intakeIndex);
  const intakeAnswersRef = React.useRef<IntakeAnswers>(state.intakeAnswers);
  React.useEffect(() => {
    outfitRef.current = state.outfitItems;
    profileRef.current = state.profile;
    intakeIndexRef.current = state.intakeIndex;
    intakeAnswersRef.current = state.intakeAnswers;
  }, [state.outfitItems, state.profile, state.intakeIndex, state.intakeAnswers]);

  React.useEffect(() => {
    customAvatarUrlRef.current = state.customAvatarUrl;
    return () => {
      if (customAvatarUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(customAvatarUrlRef.current);
      }
    };
  }, [state.customAvatarUrl]);

  React.useEffect(() => {
    return () => {
      if (generationTimerRef.current) clearInterval(generationTimerRef.current);
    };
  }, []);

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
    }));

    const startedAt = Date.now();
    generationTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(100, (elapsed / GENERATION_DURATION_MS) * 100);

      let stageIndex = 0;
      for (let i = AVATAR_GENERATION_STAGES.length - 1; i >= 0; i--) {
        if (progress >= AVATAR_GENERATION_STAGES[i].progress) {
          stageIndex = i;
          break;
        }
      }

      if (progress >= 100) {
        if (generationTimerRef.current) clearInterval(generationTimerRef.current);
        generationTimerRef.current = null;
        setState((s) => ({
          ...s,
          onboardingPhase: "avatar-selection",
          generationProgress: 100,
          generationStageIndex: AVATAR_GENERATION_STAGES.length - 1,
          avatarVariations: MOCK_AVATAR_VARIATIONS,
          selectedAvatarId: MOCK_AVATAR_VARIATIONS[0]?.id ?? null,
        }));
        return;
      }

      setState((s) => ({
        ...s,
        generationProgress: progress,
        generationStageIndex: stageIndex,
      }));
    }, 50);
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
      const avatarUrl =
        s.selectedAvatarId === "custom"
          ? s.customAvatarUrl
          : s.avatarVariations.find((v) => v.id === s.selectedAvatarId)?.imageUrl ?? null;

      return {
        ...s,
        profileSubmitted: true,
        onboardingPhase: "profile",
        profile: { ...s.profile, avatarUrl },
      };
    });
    void startIntake();
  }

  /** Greets the shopper, then walks them through a short "ask mode" intake
   *  (occasion / style / budget) before any recommendations are made. */
  async function startIntake() {
    setState((s) => ({
      ...s,
      messages: [INITIAL_WEARABLE_MESSAGE],
      intakeIndex: 0,
      intakeAnswers: {},
      isTyping: true,
    }));

    await sleep(1000);

    setState((s) => ({
      ...s,
      isTyping: false,
      messages: [...s.messages, getIntakeQuestionMessage(0)],
    }));
  }

  /** Records an answer to the current intake question (from a chip tap or typed text),
   *  advances to the next question, or — once complete — runs the scanning sequence. */
  async function answerIntake(answerLabel: string) {
    const currentIndex = intakeIndexRef.current;
    if (currentIndex === null) return;

    const question = INTAKE_QUESTIONS[currentIndex];
    const nextAnswers: IntakeAnswers = { ...intakeAnswersRef.current, [question.id]: answerLabel };

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: "user",
      content: answerLabel,
      timestamp: new Date().toISOString(),
    };

    setState((s) => ({
      ...s,
      messages: [...s.messages, userMsg],
      intakeAnswers: nextAnswers,
      isTyping: true,
    }));

    await sleep(750 + Math.random() * 450);

    const nextIndex = currentIndex + 1;
    if (nextIndex < INTAKE_QUESTIONS.length) {
      setState((s) => ({
        ...s,
        isTyping: false,
        intakeIndex: nextIndex,
        messages: [...s.messages, getIntakeQuestionMessage(nextIndex)],
      }));
      return;
    }

    setState((s) => ({ ...s, isTyping: false, intakeIndex: null }));
    await runScan(nextAnswers);
  }

  /** Simulates a professional "scanning the catalog" moment, then posts personalized picks. */
  async function runScan(answers: IntakeAnswers) {
    setState((s) => ({ ...s, isScanning: true, scanStageIndex: 0 }));

    for (let i = 1; i < SCAN_STAGES.length; i++) {
      await sleep(SCAN_STAGE_DURATION_MS);
      setState((s) => ({ ...s, scanStageIndex: i }));
    }
    await sleep(SCAN_STAGE_DURATION_MS);

    setState((s) => ({
      ...s,
      isScanning: false,
      messages: [...s.messages, buildRecommendationMessage(answers)],
    }));
  }

  function setInput(input: string) {
    setState((s) => ({ ...s, input }));
  }

  /** Applies new measurements and re-derives the standing avatar to match — used
   *  from the "Edit" popup on the Model Stats card once the shopper is already chatting. */
  async function regenerateAvatar(patch: Partial<TryOnProfile>) {
    setState((s) => ({
      ...s,
      profile: { ...s.profile, ...patch },
      isRegeneratingAvatar: true,
    }));

    await new Promise((r) => setTimeout(r, 2200));

    setState((s) => {
      const nextAvatarUrl =
        s.selectedAvatarId === "custom" && s.customAvatarUrl
          ? s.customAvatarUrl
          : pickAvatarForBodyShape(s.profile.bodyShape);

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
      currentImageIndex: s.tryOnImages.length,
      messages: [...s.messages, imageMsg],
    }));
  }

  async function sendMessage(text?: string) {
    const content = (text ?? state.input).trim();
    if (!content) return;
    setState((s) => ({ ...s, input: "" }));

    if (intakeIndexRef.current !== null) {
      await answerIntake(content);
      return;
    }

    setState((s) => ({ ...s, isTyping: true }));

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    setState((s) => ({ ...s, messages: [...s.messages, userMsg] }));

    const lower = content.toLowerCase();
    const isGenerateTrigger = GENERATE_TRIGGERS.some((t) => lower.includes(t)) && outfitRef.current.length > 0;
    const isBundleTrigger = BUNDLE_TRIGGERS.some((t) => lower.includes(t));

    await new Promise((r) => setTimeout(r, 900 + Math.random() * 700));

    const response = isGenerateTrigger
      ? {
          id: `msg-${Date.now()}`,
          role: "assistant" as const,
          content: `Perfect! I'm generating your try-on preview now with the ${outfitRef.current.length} item${outfitRef.current.length > 1 ? "s" : ""} in your outfit. Just a moment…`,
          timestamp: new Date().toISOString(),
        }
      : isBundleTrigger
        ? getBundleSuggestionMessage()
        : getWearableMockResponse(content);

    setState((s) => ({
      ...s,
      isTyping: false,
      messages: [...s.messages, response],
    }));

    if (isGenerateTrigger) {
      await generateTryOn(outfitRef.current);
    }
  }

  /** Adds a single garment to the working outfit (if not already there) and immediately
   *  renders it on the avatar — the "click an item to wear it" interaction from chat. */
  async function wearItem(product: Product) {
    const current = outfitRef.current;
    const alreadyWorn = current.some((p) => p.id === product.id);
    const nextOutfit = alreadyWorn ? current : [...current, product];

    if (!alreadyWorn) {
      setState((s) => ({ ...s, outfitItems: nextOutfit }));
    }
    await generateTryOn(nextOutfit);
  }

  /** Swaps the entire working outfit for a curated bundle and renders it as one look. */
  async function wearBundle(productIds: string[]) {
    const products = MOCK_WEARABLE_PRODUCTS.filter((p) => productIds.includes(p.id));
    if (products.length === 0) return;
    setState((s) => ({ ...s, outfitItems: products }));
    await generateTryOn(products);
  }

  function addBundleToCart(productIds: string[]) {
    setState((s) => {
      const existingIds = new Set(s.cartItems.map((p) => p.id));
      const toAdd = MOCK_WEARABLE_PRODUCTS.filter((p) => productIds.includes(p.id) && !existingIds.has(p.id));
      if (toAdd.length === 0) return s;
      return { ...s, cartItems: [...s.cartItems, ...toAdd] };
    });
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

  function selectImage(index: number) {
    setState((s) => ({
      ...s,
      currentImageIndex: Math.max(0, Math.min(s.tryOnImages.length - 1, index)),
    }));
  }

  function addToCart(product: Product) {
    setState((s) => {
      if (s.cartItems.some((p) => p.id === product.id)) return s;
      return { ...s, cartItems: [...s.cartItems, product] };
    });
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
    answerIntake,
    regenerateAvatar,
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
    profileComplete,
  };
}

export type UseTryOnAgentReturn = ReturnType<typeof useTryOnAgent>;
