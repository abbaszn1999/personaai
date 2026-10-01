export const featuresHero = {
  kicker: "Features",
  lineA: "Everything a",
  lineB: "fitting room does.",
  lineC: "Inside your store.",
  lede: "An avatar from one selfie, try-on with your real garments, a live camera mirror, sizing from your charts and a stylist that fills your own cart. One script tag, no iframe.",
  index: ["Avatar", "Try-on", "Live mirror", "Stylist", "Sizing", "Cart"],
};

export const chapters = [
  {
    id: "avatar",
    n: "01",
    label: "Avatar",
    title: "One selfie becomes their avatar.",
    body: "The shopper adds a photo with their height, weight, chest, waist and shoe size. Persona builds an avatar that keeps their face across every outfit after it.",
    facts: ["The selfie is used once, then discarded", "Only the avatar is kept", "Up to 3 profiles per shopper"],
  },
  {
    id: "try-on",
    n: "02",
    label: "Try-on",
    title: "Your garments, on their body.",
    body: "Pick pieces from your catalog and Persona renders them on the stored avatar in a single pass. Full looks, not one item at a time.",
    facts: ["Up to 11 garments in one render", "Rendered on the stored avatar", "Your product images, not stock photos"],
  },
  {
    id: "live",
    n: "03",
    label: "Live mirror",
    title: "A mirror on their own camera.",
    body: "Turn on live try-on and the garment follows the shopper in real time. The live engine loads only when someone starts it, so your store stays light.",
    facts: ["Real-time video try-on", "90-second sessions", "Loaded on demand, separate bundle"],
  },
  {
    id: "stylist",
    n: "04",
    label: "Stylist",
    title: "A stylist that only sells what you stock.",
    body: "The assistant searches the catalog you indexed before it answers. It is not allowed to state a product, price or stock level it did not just find.",
    facts: ["Catalog-grounded search", "No invented products or prices", "Understands budget and occasion"],
  },
  {
    id: "sizing",
    n: "05",
    label: "Sizing",
    title: "The right size, the first time.",
    body: "Recommendations combine the shopper's measurements with your size charts. Charts for global brands are researched once and shared, so the next store gets them free.",
    facts: ["Measurements × your size charts", "Shared registry for global brands", "Categories mapped to one sizing model"],
  },
  {
    id: "cart",
    n: "06",
    label: "Cart",
    title: "Straight into your own cart.",
    body: "When the shopper says yes, the item goes into your Shopify or WooCommerce cart. Checkout, payment and the customer relationship stay yours.",
    facts: ["Native Shopify cart", "WooCommerce Store API", "Your checkout, untouched"],
  },
] as const;

export const merchant = {
  kicker: "For the merchant",
  title: "A control room behind the mirror.",
  body: "Everything you need to run it, measure it and switch it off, in one dashboard.",
};

export const specs = [
  { k: "Embed", v: "One async <script> tag. Shadow DOM isolated, no iframe, no theme conflicts." },
  { k: "Shopify", v: "Your own custom app with read_products scope. No access token is stored." },
  { k: "WooCommerce", v: "WordPress application password over the official REST API." },
  { k: "Secrets", v: "Store credentials are encrypted with AES-256-GCM and never returned in full." },
  { k: "Selfies", v: "Used once to build the avatar. Only the avatar image is kept." },
  { k: "Data access", v: "Row-level security, deny by default." },
  { k: "Live engine", v: "Shipped as a separate bundle, fetched only on first use." },
  { k: "Kill switch", v: "Pause the widget or rotate the embed token from Settings." },
] as const;

export const reasons = [
  { n: "01", title: "They see it on themselves", body: "Not on a model twice their height. Their face, their proportions, your garment." },
  { n: "02", title: "They pick the right size", body: "Measured against your own charts, before the parcel ever ships." },
  { n: "03", title: "They ask, and it answers", body: "A stylist that knows your stock, your prices and their budget." },
] as const;
