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
  },
};

export function resolveWidgetLanguage(locale: string | null | undefined): WidgetLanguage {
  const primary = locale?.split(/[-_]/)[0]?.toLowerCase();
  return primary === "ar" || primary === "fr" ? primary : "en";
}

export function widgetStrings(locale: string | null | undefined): WidgetStrings {
  return WIDGET_STRINGS[resolveWidgetLanguage(locale)];
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
