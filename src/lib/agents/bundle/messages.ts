/**
 * The replies code writes itself — budget arithmetic, empty slots, fallbacks — in the shopper's
 * language. The model writes every other reply; these cover the paths where it is not asked or
 * did not answer. Arabic is Modern Standard Arabic, as everywhere else.
 */
export type BundleLanguage = "en" | "ar" | "fr";

const ARABIC_LETTERS = /[\u0600-\u06FF]/;
const FRENCH = /\b(je|tu|vous|une|des|pour|avec|tenue|veux|voudrais|bonjour|merci|allez|chemise|robe|budget de)\b/i;

/** From the language the model named, else from the message itself. */
export function bundleLanguage(named: string | null | undefined, message = ""): BundleLanguage {
  const language = named?.trim() ?? "";
  if (/arab|عرب/i.test(language)) return "ar";
  if (/fren|fran/i.test(language)) return "fr";
  if (language && /engl|angl/i.test(language)) return "en";
  if (ARABIC_LETTERS.test(message)) return "ar";
  if (FRENCH.test(message)) return "fr";
  return "en";
}

const SLOT_NAMES: Record<BundleLanguage, Record<string, string>> = {
  en: { top: "top", bottom: "bottoms", outerwear: "jacket", footwear: "shoes", "full-body": "dress" },
  ar: { top: "قطعة علوية", bottom: "قطعة سفلية", outerwear: "سترة", footwear: "حذاء", "full-body": "فستان" },
  fr: { top: "haut", bottom: "bas", outerwear: "veste", footwear: "chaussures", "full-body": "robe" },
};

function slotList(language: BundleLanguage, slots: string[]): string {
  const names = slots.map((slot) => SLOT_NAMES[language][slot] ?? slot);
  const and = language === "ar" ? " و" : language === "fr" ? " et " : " and ";
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")}${and}${names[names.length - 1]}`;
}

export interface BundleMessages {
  stay: string;
  askForInput: string;
  askAboutLook: string;
  unavailable: string;
  notAnOutfitPiece: string;
  nothingToPair: string;
  preparing: string;
  budgetUsedUp: (price: string, budget: string) => string;
  budgetTooSmall: (budget: string) => string;
  noPiecesNoBudget: string;
  nothingInStock: (slots: string[], withinBudget: boolean, inSize: boolean) => string;
  noOtherPiece: (slots: string[], inSize: boolean) => string;
  changedWhileChecking: string;
  looksBuilt: (count: number, totals: string) => string;
  missingAfterLooks: (slots: string[]) => string;
  lookUnchanged: string;
  lookNowCosts: (total: string) => string;
  cannotChange: string;
  alreadyCheapest: (slots: string[]) => string;
  tryAgain: string;
}

const MESSAGES: Record<BundleLanguage, BundleMessages> = {
  en: {
    stay: "That's outside this look — press × above the message box to search for other things.",
    askForInput: 'Tell me the occasion, a style or a budget — "under 300", "more casual" — or just say go, and I\'ll build the looks.',
    askAboutLook: "Anything you'd like to change about this look?",
    unavailable: "That item isn't available anymore, so I can't build a look around it.",
    notAnOutfitPiece: "This piece isn't one I build full outfits around — try Complete the look on a top, bottom, dress or pair of shoes.",
    nothingToPair: "This store doesn't have pieces to pair with this one right now, so I can't build a full look around it.",
    preparing: "The store's products are still being prepared — outfits will be available shortly.",
    budgetUsedUp: (price, budget) =>
      `At ${price} this piece already uses the ${budget} budget, so there's nothing left for the rest of the look. Raise the budget and I'll build around it.`,
    budgetTooSmall: (budget) =>
      `The ${budget} budget doesn't stretch to a full look around this piece in this store — even the cheapest options for the other pieces go over it. Raising the budget would open it up.`,
    noPiecesNoBudget: "I couldn't find pieces in this store to build a look around this one.",
    nothingInStock: (slots, withinBudget, inSize) =>
      `I couldn't find pieces to go with this within ${withinBudget ? "the budget" : "its price range"} — nothing in stock${inSize ? " in your size" : ""} for the ${slotList("en", slots)}.`,
    noOtherPiece: (slots, inSize) => `There's no other ${slotList("en", slots)} in stock${inSize ? " in your size" : ""} that fits this look at that price.`,
    changedWhileChecking: "Nothing I could put together holds up right now — prices or stock changed as I checked. Try again in a moment.",
    looksBuilt: (count, totals) => `Here ${count === 1 ? "is a look" : `are ${count} looks`} built around it (${totals}).`,
    missingAfterLooks: (slots) => ` Nothing in stock fit for the ${slotList("en", slots)}.`,
    lookUnchanged: " The current look is unchanged.",
    lookNowCosts: (total) => `Done — the look is now ${total}.`,
    cannotChange: "I can't change that part of the look with what's in stock.",
    alreadyCheapest: (slots) => `There's nothing cheaper in stock to replace the ${slotList("en", slots)} in this look.`,
    tryAgain: "I couldn't work that out just now — please send it again.",
  },
  ar: {
    stay: "هذا خارج نطاق هذه الإطلالة — اضغط × فوق مربع الرسائل للبحث عن منتجات أخرى.",
    askForInput: "أخبرني بالمناسبة أو الأسلوب أو الميزانية — مثل «أقل من 300» أو «أكثر بساطة» — أو قل «ابدأ» وسأنسّق لك الإطلالات.",
    askAboutLook: "هل تودّ تغيير شيء في هذه الإطلالة؟",
    unavailable: "هذه القطعة لم تعد متوفرة، لذا لا يمكنني تنسيق إطلالة حولها.",
    notAnOutfitPiece: "لا أنسّق إطلالات كاملة حول هذه القطعة — جرّب «Complete the look» على قطعة علوية أو سفلية أو فستان أو حذاء.",
    nothingToPair: "لا يتوفر في هذا المتجر حاليًا ما يُنسَّق مع هذه القطعة، لذا لا يمكنني بناء إطلالة كاملة حولها.",
    preparing: "ما زالت منتجات المتجر قيد التجهيز — ستتوفر الإطلالات قريبًا.",
    budgetUsedUp: (price, budget) =>
      `سعر هذه القطعة ${price} يستهلك ميزانية ${budget} بالكامل، فلا يبقى شيء لبقية الإطلالة. ارفع الميزانية وسأنسّق حولها.`,
    budgetTooSmall: (budget) =>
      `ميزانية ${budget} لا تكفي لإطلالة كاملة حول هذه القطعة في هذا المتجر — حتى أرخص الخيارات لبقية القطع تتجاوزها. رفع الميزانية سيفتح المجال.`,
    noPiecesNoBudget: "لم أجد في هذا المتجر قطعًا أنسّق بها إطلالة حول هذه القطعة.",
    nothingInStock: (slots, withinBudget, inSize) =>
      `لم أجد ما يناسب هذه القطعة ${withinBudget ? "ضمن الميزانية" : "ضمن نطاق سعرها"} — لا يتوفر${inSize ? " بمقاسك" : ""} ${slotList("ar", slots)}.`,
    noOtherPiece: (slots, inSize) => `لا يتوفر ${slotList("ar", slots)} آخر${inSize ? " بمقاسك" : ""} يناسب هذه الإطلالة بهذا السعر.`,
    changedWhileChecking: "تغيّرت الأسعار أو الكميات أثناء التحقق، فلم تصمد أي إطلالة. حاول مجددًا بعد لحظات.",
    looksBuilt: (count, totals) =>
      count === 1
        ? `إليك إطلالة منسّقة حولها (${totals}).`
        : count === 2
          ? `إليك إطلالتين منسّقتين حولها (${totals}).`
          : `إليك ${count} إطلالات منسّقة حولها (${totals}).`,
    missingAfterLooks: (slots) => ` لم يتوفر ما يناسب: ${slotList("ar", slots)}.`,
    lookUnchanged: " بقيت الإطلالة الحالية كما هي.",
    lookNowCosts: (total) => `تم — أصبح مجموع الإطلالة ${total}.`,
    cannotChange: "لا يمكنني تغيير هذا الجزء من الإطلالة بما هو متوفر حاليًا.",
    alreadyCheapest: (slots) => `هذه بالفعل أقل ${slotList("ar", slots)} سعرًا متوفرة تناسب هذه الإطلالة.`,
    tryAgain: "لم أتمكن من فهم ذلك الآن — أرسل رسالتك مرة أخرى من فضلك.",
  },
  fr: {
    stay: "Cela sort de cette tenue — appuyez sur × au-dessus de la zone de message pour chercher autre chose.",
    askForInput: "Dites-moi l'occasion, un style ou un budget — « moins de 300 », « plus décontracté » — ou dites simplement « allez », et je compose les tenues.",
    askAboutLook: "Souhaitez-vous changer quelque chose dans cette tenue ?",
    unavailable: "Cet article n'est plus disponible, je ne peux donc pas composer une tenue autour de lui.",
    notAnOutfitPiece: "Je ne compose pas de tenue complète autour de cette pièce — essayez « Complete the look » sur un haut, un bas, une robe ou des chaussures.",
    nothingToPair: "Cette boutique n'a pas en ce moment de pièces à associer à celle-ci, je ne peux donc pas composer une tenue complète.",
    preparing: "Les produits de la boutique sont encore en préparation — les tenues seront bientôt disponibles.",
    budgetUsedUp: (price, budget) =>
      `À ${price}, cette pièce utilise déjà tout le budget de ${budget} : il ne reste rien pour le reste de la tenue. Augmentez le budget et je composerai autour.`,
    budgetTooSmall: (budget) =>
      `Le budget de ${budget} ne suffit pas pour une tenue complète autour de cette pièce dans cette boutique — même les options les moins chères le dépassent. Un budget plus élevé ouvrirait le choix.`,
    noPiecesNoBudget: "Je n'ai pas trouvé de pièces dans cette boutique pour composer une tenue autour de celle-ci.",
    nothingInStock: (slots, withinBudget, inSize) =>
      `Je n'ai rien trouvé pour accompagner cette pièce ${withinBudget ? "dans le budget" : "dans sa gamme de prix"} — rien en stock${inSize ? " à votre taille" : ""} pour : ${slotList("fr", slots)}.`,
    noOtherPiece: (slots, inSize) => `Il n'y a pas d'autre ${slotList("fr", slots)} en stock${inSize ? " à votre taille" : ""} qui convienne à cette tenue à ce prix.`,
    changedWhileChecking: "Les prix ou les stocks ont changé pendant la vérification, aucune tenue ne tient pour l'instant. Réessayez dans un instant.",
    looksBuilt: (count, totals) => (count === 1 ? `Voici une tenue composée autour (${totals}).` : `Voici ${count} tenues composées autour (${totals}).`),
    missingAfterLooks: (slots) => ` Rien en stock ne convenait pour : ${slotList("fr", slots)}.`,
    lookUnchanged: " La tenue actuelle reste inchangée.",
    lookNowCosts: (total) => `C'est fait — la tenue coûte maintenant ${total}.`,
    cannotChange: "Je ne peux pas changer cette partie de la tenue avec ce qui est en stock.",
    alreadyCheapest: (slots) => `C'est déjà l'option la moins chère en stock pour cette tenue (${slotList("fr", slots)}).`,
    tryAgain: "Je n'ai pas pu traiter cela pour l'instant — renvoyez votre message, s'il vous plaît.",
  },
};

export function bundleMessages(language: BundleLanguage): BundleMessages {
  return MESSAGES[language];
}
