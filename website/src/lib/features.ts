export const featuresHero = {
  kicker: "Features",
  lineA: "Everything a",
  lineB: "fitting room does.",
  lineC: "Inside your store.",
  lede: "An avatar from one selfie, try-on with your real garments, a live camera mirror, sizing from your charts and a stylist that fills your own cart. One script tag, no iframe.",
  index: ["Avatar", "Try-on", "Live mirror", "Stylist", "Sizing", "Cart"],
};

export const chaptersIntro = {
  kicker: "One widget, six jobs",
  title: "Persona is the fitting room",
  accent: "your online store never had.",
  body: "It installs on Shopify or WooCommerce with one tag and opens inside your product pages. Shoppers see your clothes on their own body, get their size, ask for a look and buy it in your cart, without leaving the page.",
};

export const chapters = [
  {
    id: "avatar",
    n: "01",
    label: "Avatar",
    problem: "Product photos show a model, not the shopper.",
    title: "One selfie becomes their avatar.",
    body: "The shopper adds a photo with their height, weight, chest, waist and shoe size. Persona builds an avatar that keeps their face across every outfit after it.",
    facts: ["The selfie is used once, then discarded", "Only the avatar is kept", "Up to 3 profiles per shopper"],
  },
  {
    id: "try-on",
    n: "02",
    label: "Try-on",
    problem: "They can't see how the pieces work together on them.",
    title: "Your garments, on their body.",
    body: "Pick pieces from your catalog and Persona renders them on the stored avatar in a single pass. Full looks, not one item at a time.",
    facts: ["Up to 11 garments in one render", "Rendered on the stored avatar", "Your product images, not stock photos"],
  },
  {
    id: "live",
    n: "03",
    label: "Live mirror",
    problem: "A still photo can't show how it moves.",
    title: "Step in front of the mirror.",
    body: "After picking pieces, the shopper switches on their camera and sees themselves live. Tap any garment on the rack and it is on their body instantly, following every move. The live engine loads only when someone starts it, so your store stays light.",
    facts: ["Shopper appears live on their own camera", "Tap any garment to wear it instantly", "90-second sessions, loaded on demand"],
  },
  {
    id: "stylist",
    n: "04",
    label: "Stylist",
    problem: "Generic chatbots invent products you don't sell.",
    title: "A stylist that only sells what you stock.",
    body: "The assistant searches the catalog you indexed before it answers. It is not allowed to state a product, price or stock level it did not just find.",
    facts: ["Catalog-grounded search", "No invented products or prices", "Understands budget and occasion"],
  },
  {
    id: "sizing",
    n: "05",
    label: "Sizing",
    problem: "The wrong size is the return you could have prevented.",
    title: "The right size, the first time.",
    body: "Recommendations combine the shopper's measurements with your size charts. Charts for global brands are researched once and shared, so the next store gets them free.",
    facts: ["Measurements × your size charts", "Shared registry for global brands", "Categories mapped to one sizing model"],
  },
  {
    id: "cart",
    n: "06",
    label: "Cart",
    problem: "Sending shoppers off-site loses the sale and the customer.",
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
