"use client";

import * as React from "react";
import type { ChatMessage, Product } from "@/modules/shopping-agent/types";
import { MOCK_UNWEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";
import {
  INTAKE_QUESTIONS,
  SCAN_STAGES,
  SCAN_STAGE_DURATION_MS,
  INITIAL_MESSAGE,
  getMockResponse,
  buildRecommendationMessage,
  detectTopic,
  parseBudgetMax,
  getIntakeQuestionMessage,
  type ShoppingIntakeAnswers,
  type ShoppingTopic,
} from "../mocks/responses";

export interface UseShoppingAgentReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  isTyping: boolean;
  isScanning: boolean;
  scanStageIndex: number;
  sendMessage: (text?: string) => void;
  // Solution kit — items explicitly added by the user from the chat
  solutionProducts: Product[];
  solutionProductIdSet: Set<string>;
  addToSolutionBoard: (product: Product) => void;
  removeSolutionProduct: (productId: string) => void;
  // Real store cart — populated when user taps "Add All to Cart" on the board
  cartItemIdSet: Set<string>;
  addAllBoardToCart: () => void;
  // Intake
  intakeIndex: number | null;
  // Context
  topic: ShoppingTopic | null;
  budget: number | null;
  // Quick option handler (same as sendMessage but from chip)
  onQuickOption: (label: string) => void;
}

export function useShoppingAgent(): UseShoppingAgentReturn {
  const [messages, setMessages] = React.useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [isScanning, setIsScanning] = React.useState(false);
  const [scanStageIndex, setScanStageIndex] = React.useState(0);
  // solutionProductIds — user-curated staging kit (added from chat, not auto-populated)
  const [solutionProductIds, setSolutionProductIds] = React.useState<string[]>([]);
  // cartItemIds — the real store cart (populated by "Add All to Cart" on the board)
  const [cartItemIds, setCartItemIds] = React.useState<Set<string>>(new Set());
  const [intakeIndex, setIntakeIndex] = React.useState<number | null>(0);
  const [intakeAnswers, setIntakeAnswers] = React.useState<ShoppingIntakeAnswers>({});
  const [topic, setTopic] = React.useState<ShoppingTopic | null>(null);
  const [budget, setBudget] = React.useState<number | null>(null);

  // Refs so async callbacks see latest values
  const intakeIndexRef = React.useRef(intakeIndex);
  const intakeAnswersRef = React.useRef(intakeAnswers);
  React.useEffect(() => { intakeIndexRef.current = intakeIndex; }, [intakeIndex]);
  React.useEffect(() => { intakeAnswersRef.current = intakeAnswers; }, [intakeAnswers]);

  const solutionProducts = React.useMemo(
    () => MOCK_UNWEARABLE_PRODUCTS.filter((p) => solutionProductIds.includes(p.id)),
    [solutionProductIds]
  );

  const solutionProductIdSet = React.useMemo(
    () => new Set(solutionProductIds),
    [solutionProductIds]
  );

  function addToSolutionBoard(product: Product) {
    setSolutionProductIds((ids) =>
      ids.includes(product.id) ? ids : [...ids, product.id]
    );
  }

  function removeSolutionProduct(productId: string) {
    setSolutionProductIds((ids) => ids.filter((id) => id !== productId));
  }

  function addAllBoardToCart() {
    setCartItemIds((prev) => {
      const next = new Set(prev);
      solutionProducts.forEach((p) => next.add(p.id));
      return next;
    });
  }

  async function runIntakeAnswer(answer: string) {
    const idx = intakeIndexRef.current;
    if (idx === null) return;

    const question = INTAKE_QUESTIONS[idx];
    const answerKey = question.id as keyof ShoppingIntakeAnswers;
    const updatedAnswers = { ...intakeAnswersRef.current, [answerKey]: answer };
    setIntakeAnswers(updatedAnswers);

    const nextIdx = idx + 1;
    if (nextIdx < INTAKE_QUESTIONS.length) {
      // Ask the next intake question
      setIntakeIndex(nextIdx);
      await new Promise((r) => setTimeout(r, 600));
      setMessages((m) => [...m, getIntakeQuestionMessage(INTAKE_QUESTIONS[nextIdx])]);
    } else {
      // All intake questions answered — scan then recommend
      setIntakeIndex(null);
      await runScan(updatedAnswers);
    }
  }

  async function runScan(answers: ShoppingIntakeAnswers) {
    setIsScanning(true);
    setScanStageIndex(0);

    const detectedTopic = detectTopic(answers);
    const detectedBudget = parseBudgetMax(answers.budget ?? "No limit");
    setTopic(detectedTopic);
    setBudget(detectedBudget === 99999 ? null : detectedBudget);

    for (let i = 0; i < SCAN_STAGES.length; i++) {
      await new Promise((r) => setTimeout(r, SCAN_STAGE_DURATION_MS));
      setScanStageIndex(i);
    }
    await new Promise((r) => setTimeout(r, SCAN_STAGE_DURATION_MS));
    setIsScanning(false);

    const recMsg = buildRecommendationMessage(answers);
    setMessages((m) => [...m, recMsg]);
    // Do NOT auto-populate the board — user must explicitly add items
  }

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;
    setInput("");

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);

    // If intake is active, route as intake answer
    if (intakeIndexRef.current !== null) {
      await runIntakeAnswer(content);
      return;
    }

    // Otherwise free-form response
    setIsTyping(true);
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 500));
    const response = getMockResponse(content);
    setIsTyping(false);
    setMessages((m) => [...m, response]);
    // Do NOT auto-populate the board — user must explicitly add items from chat
    // Detect topic from free text if not yet set
    if (!topic) {
      const freeTextAnswers: ShoppingIntakeAnswers = { useCase: content };
      const t = detectTopic(freeTextAnswers);
      if (t !== "General Electronics") setTopic(t);
    }
  }

  return {
    messages,
    input,
    setInput,
    isTyping,
    isScanning,
    scanStageIndex,
    sendMessage,
    solutionProducts,
    solutionProductIdSet,
    addToSolutionBoard,
    removeSolutionProduct,
    cartItemIdSet: cartItemIds,
    addAllBoardToCart,
    intakeIndex,
    topic,
    budget,
    onQuickOption: sendMessage,
  };
}
