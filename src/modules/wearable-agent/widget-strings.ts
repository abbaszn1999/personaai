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
  /** Why a try-on render failed, by kind (see utils/try-on-request.ts). Never a raw network or
   *  provider message. */
  tryOnNetwork: string;
  tryOnTimeout: string;
  tryOnBusy: string;
  tryOnGarment: string;
  tryOnUnavailable: string;
  tryOnGeneric: string;
  /** The composer's hint while something is attached: what the shopper can type next. */
  placeholderAskItem: string;
  placeholderCompleteLook: string;
  placeholderAskLook: string;
  /** The chat tab on the avatar screen, and the controls that open and close the chat panel. */
  chatTab: string;
  openChat: string;
  closeChat: string;
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
    tryOnNetwork: "I lost the connection while rendering your look. Check your internet and tap Retry.",
    tryOnTimeout: "That render took longer than expected. Tap Retry and I'll try again.",
    tryOnBusy: "Try-on is very busy right now. Give it a few seconds and tap Retry.",
    tryOnGarment: "I couldn't load one of the item pictures from the store. Tap Retry to try again.",
    tryOnUnavailable: "Virtual try-on isn't available on this store right now. Please try again later.",
    tryOnGeneric: "Sorry, I couldn't render your look. Tap Retry to try again.",
    placeholderAskItem: "Ask anything about this item…",
    placeholderCompleteLook: "Tell me the occasion, style or budget — or just say go…",
    placeholderAskLook: "Ask about this look, or change it…",
    chatTab: "Chat",
    openChat: "Open chat",
    closeChat: "Close chat and see your look",
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
    tryOnNetwork: "انقطع الاتصال أثناء تجهيز إطلالتك. تحقّق من الإنترنت ثم اضغط «إعادة المحاولة».",
    tryOnTimeout: "استغرق التجهيز وقتًا أطول من المتوقع. اضغط «إعادة المحاولة» وسأحاول مجددًا.",
    tryOnBusy: "التجربة الافتراضية مشغولة جدًا الآن. انتظر بضع ثوانٍ ثم اضغط «إعادة المحاولة».",
    tryOnGarment: "تعذّر تحميل إحدى صور القطع من المتجر. اضغط «إعادة المحاولة».",
    tryOnUnavailable: "التجربة الافتراضية غير متاحة في هذا المتجر حاليًا. يُرجى المحاولة لاحقًا.",
    tryOnGeneric: "عذرًا، تعذّر تجهيز إطلالتك. اضغط «إعادة المحاولة».",
    placeholderAskItem: "اسأل أي شيء عن هذه القطعة…",
    placeholderCompleteLook: "أخبرني بالمناسبة أو الأسلوب أو الميزانية — أو اكتب «ابدأ»…",
    placeholderAskLook: "اسأل عن هذه الإطلالة أو اطلب تعديلها…",
    chatTab: "دردشة",
    openChat: "فتح الدردشة",
    closeChat: "إغلاق الدردشة ورؤية إطلالتك",
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
    tryOnNetwork: "La connexion a été perdue pendant le rendu de votre look. Vérifiez votre connexion puis touchez Réessayer.",
    tryOnTimeout: "Le rendu a pris plus de temps que prévu. Touchez Réessayer et je referai un essai.",
    tryOnBusy: "L'essayage virtuel est très sollicité en ce moment. Patientez quelques secondes puis touchez Réessayer.",
    tryOnGarment: "Je n'ai pas pu charger l'une des photos d'articles du magasin. Touchez Réessayer.",
    tryOnUnavailable: "L'essayage virtuel n'est pas disponible sur cette boutique pour le moment. Veuillez réessayer plus tard.",
    tryOnGeneric: "Désolé, je n'ai pas pu générer votre look. Touchez Réessayer.",
    placeholderAskItem: "Posez une question sur cet article…",
    placeholderCompleteLook: "Dites-moi l'occasion, le style ou le budget — ou écrivez « go »…",
    placeholderAskLook: "Posez une question sur ce look, ou modifiez-le…",
    chatTab: "Chat",
    openChat: "Ouvrir le chat",
    closeChat: "Fermer le chat et voir votre look",
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
