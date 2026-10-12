import * as React from "react";
import { SCAN_STAGES } from "./mocks/responses";

/** The widget's own status and error lines. Labels the agent's replies refer to by name
 *  ("Complete the look", "Ask about this item", "Add profile") stay English and are
 *  deliberately not in here. */
export interface WidgetStrings {
  searching: string;
  composing: string;
  scanTitle: string;
  /** Same length and order as SCAN_STAGES — the scan ticker advances by index. */
  scanStages: readonly string[];
  scanResultCount: (count: number) => string;
  chatError: string;
  retry: string;
  /** The composer's hint while something is attached: what the shopper can type next. */
  placeholderAskItem: string;
  placeholderCompleteLook: string;
  placeholderAskLook: string;
}

export type WidgetLanguage = "en" | "ar" | "fr";

const WIDGET_STRINGS: Record<WidgetLanguage, WidgetStrings> = {
  en: {
    // "Checking", not "searching": this tool can come back with a question instead of results,
    // and the label has to stay true in that case too.
    searching: "Checking the catalog…",
    composing: "Putting your reply together…",
    scanTitle: "Building your outfit…",
    scanStages: SCAN_STAGES,
    scanResultCount: (count) => `Prepared ${count} bundle item${count === 1 ? "" : "s"}…`,
    chatError: "Sorry, something went wrong on my end. Please try that again.",
    retry: "Retry",
    placeholderAskItem: "Ask anything about this item…",
    placeholderCompleteLook: "Tell me the occasion, style or budget — or just say go…",
    placeholderAskLook: "Ask about this look, or change it…",
  },
  ar: {
    searching: "جارٍ التحقق من الكتالوج…",
    composing: "جارٍ إعداد ردّك…",
    scanTitle: "جارٍ تنسيق إطلالتك…",
    scanStages: [
      "جارٍ توزيع ميزانيتك على القطع…",
      "جارٍ البحث عن خيارات لكل قطعة…",
      "جارٍ تنسيق إطلالات متكاملة…",
      "جارٍ التحقق من الأسعار والمخزون…",
    ],
    scanResultCount: (count) => `عدد القطع الجاهزة: ${count}…`,
    chatError: "عذرًا، حدث خطأ من جهتي. يُرجى المحاولة مرة أخرى.",
    retry: "إعادة المحاولة",
    placeholderAskItem: "اسأل أي شيء عن هذه القطعة…",
    placeholderCompleteLook: "أخبرني بالمناسبة أو الأسلوب أو الميزانية — أو اكتب «ابدأ»…",
    placeholderAskLook: "اسأل عن هذه الإطلالة أو اطلب تعديلها…",
  },
  fr: {
    searching: "Vérification du catalogue…",
    composing: "Préparation de votre réponse…",
    scanTitle: "Création de votre tenue…",
    scanStages: [
      "Répartition de votre budget entre les pièces…",
      "Recherche d'options pour chaque pièce…",
      "Composition de looks complets et coordonnés…",
      "Vérification des prix et des stocks…",
    ],
    scanResultCount: (count) => `${count} article${count > 1 ? "s" : ""} préparé${count > 1 ? "s" : ""}…`,
    chatError: "Désolé, un problème est survenu de mon côté. Veuillez réessayer.",
    retry: "Réessayer",
    placeholderAskItem: "Posez une question sur cet article…",
    placeholderCompleteLook: "Dites-moi l'occasion, le style ou le budget — ou écrivez « go »…",
    placeholderAskLook: "Posez une question sur ce look, ou modifiez-le…",
  },
};

export function resolveWidgetLanguage(locale: string | null | undefined): WidgetLanguage {
  const primary = locale?.split(/[-_]/)[0]?.toLowerCase();
  return primary === "ar" || primary === "fr" ? primary : "en";
}

export function widgetStrings(locale: string | null | undefined): WidgetStrings {
  return WIDGET_STRINGS[resolveWidgetLanguage(locale)];
}

/** The composer's placeholder: a hint for what is attached, otherwise the store's own. */
export function composerPlaceholder(
  strings: WidgetStrings,
  attachmentKind: "item" | "anchor" | "look" | null | undefined,
  fallback: string
): string {
  if (attachmentKind === "item") return strings.placeholderAskItem;
  if (attachmentKind === "anchor") return strings.placeholderCompleteLook;
  if (attachmentKind === "look") return strings.placeholderAskLook;
  return fallback;
}

/** `navigator.language`, or undefined (the runtime's default locale) where there is none. */
export function browserLocale(): string | undefined {
  return typeof navigator !== "undefined" && navigator.language ? navigator.language : undefined;
}

function subscribeToLanguageChange(onChange: () => void) {
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}

/** The server render has no browser locale, so this hydrates with the default and then
 *  switches — reading `navigator` directly during render would mismatch on hydration. */
export function useWidgetLocale(): string | undefined {
  return React.useSyncExternalStore(subscribeToLanguageChange, browserLocale, () => undefined);
}
