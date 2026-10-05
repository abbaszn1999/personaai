export const nav = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
] as const;

export const hero = {
  kicker: "Persona AI · Virtual fitting room",
  lineA: "Try it on",
  lineB: "before",
  lineC: "you buy it.",
  lede: "Persona is a widget for your store. Shoppers get an avatar from their measurements and one photo, a stylist that searches your catalog, your garments rendered on them, and checkout in your own cart.",
  cta: "Start the trial",
  dashboard: "Open your dashboard",
  scroll: "See how it works",
  room: "Inside the fitting room",
  platforms: ["Shopify", "WooCommerce", "One script tag"],
};

export const heroDemo = {
  store: "MAISON",
  url: "maison-store.com/products/navy-suit",
  adminUrl: "admin.shopify.com/store/maison/themes",
  file: "theme.liquid",
  script: `<script src="…/widget.js?w=…" async></script>`,
  saved: "Saved · Persona is live",
  product: "Navy two-piece suit",
  price: "$189",
  sizes: ["S", "M", "L", "XL"],
  launch: "Try it on with Persona",
  agent: "Style Assistant",
  status: "Online — personalised for your profile",
  welcome: "Hi, I'm your Style Assistant. Tell me what you're shopping for and I'll find it in this store.",
  fields: [
    ["Height (cm)", "178", "168"],
    ["Weight (kg)", "74", "65"],
    ["Chest (cm)", "98", "90"],
    ["Waist (cm)", "82", "70"],
    ["Shoe Size (EU)", "43", "42"],
  ],
  create: "Create my avatar",
  creating: "We're building a personalized mannequin from your face photo and measurements.",
  stats: [
    ["Height", "178 cm"],
    ["Weight", "74 kg"],
    ["Chest", "98 cm"],
    ["Waist", "82 cm"],
  ],
  avatarStages: [
    ["Analyzing your face photo", 18],
    ["Mapping body measurements", 42],
    ["Building your body model", 68],
    ["Generating avatar variations", 88],
    ["Almost ready…", 100],
  ],
  ask: "A sharp look for a dinner. Under $300.",
  searching: "Checking the catalog…",
  answer: "Navy suit, white shirt, brown loafers. All in stock, all in your size.",
  wear: "Wear the full look",
  scanStages: ["Mapping body silhouette…", "Draping garment mesh…", "Rendering on avatar…"],
  added: "3 items added to your cart",
  steps: ["Stylist finds it", "Rendered on them", "Into your cart"],
} as const;

export const looks = [
  {
    src: "/media/look-1.webp",
    code: "01",
    label: "The avatar",
    title: "One photo.",
    accent: "Their body.",
    body: "They upload one selfie and their measurements. Persona builds the avatar once, and that same face carries through every outfit after it.",
    facts: [
      ["1", "photo"],
      ["Body", "accurate model"],
      ["Same", "face, every look"],
    ],
    garment: "Base avatar · black tee",
    tag: "Avatar ready",
    word: "Avatar",
    glow: "#3a2a24",
  },
  {
    src: "/media/look-2.webp",
    code: "02",
    label: "Your catalog",
    title: "Your catalog,",
    accent: "worn by them.",
    body: "Pieces from your store are rendered together in one pass on the stored avatar, so the face never drifts from look to look.",
    facts: [
      ["Only", "your products"],
      ["1", "pass per outfit"],
      ["Full", "looks, not items"],
    ],
    garment: "Navy two-piece suit",
    tag: "From your catalog",
    word: "Catalog",
    glow: "#1b2a55",
  },
  {
    src: "/media/look-3.webp",
    code: "03",
    label: "The fit",
    title: "The right size,",
    accent: "before checkout.",
    body: "Their measurements are read against your own size charts. Charts for global brands are researched once and reused.",
    facts: [
      ["Your", "size charts"],
      ["Once", "per global brand"],
      ["M", "for this shopper"],
    ],
    garment: "Camel overcoat · turtleneck",
    tag: "Size M · recommended",
    word: "Sized",
    glow: "#6b4520",
  },
  {
    src: "/media/look-4.webp",
    code: "04",
    label: "Live mirror",
    title: "Live, in their",
    accent: "own mirror.",
    body: "They switch on their camera and see themselves live. Tap any garment on the rack and it is on them instantly, following every move.",
    facts: [
      ["Live", "on their camera"],
      ["Real", "time tracking"],
      ["Photo", "try-on fallback"],
    ],
    garment: "Bomber · cargo trouser",
    tag: "Live mirror",
    word: "Live",
    glow: "#2f3a1e",
  },
] as const;

export const manifesto =
  "Most returns start in a fitting room your store never had. Persona builds one inside your storefront: their face, their size, your catalog, your cart. Nothing it suggests is invented, and nothing leaves your checkout.";

export const stylist = {
  kicker: "The stylist",
  title: "It only sells what you stock.",
  body: "The assistant searches the catalog you indexed. No invented products, prices, or stock. When the shopper says yes, the item goes into your store's own Shopify or WooCommerce cart.",
  ask: "A sharp look for a dinner. Under $300.",
  answer: "Here's a dinner look under $300. All three are in stock in your size.",
  try: "Try it on me",
  budget: 300,
  steps: [
    "Understands the ask",
    "Searches only your catalog",
    "Builds a look within budget",
    "Shows it on their avatar",
    "Adds it to your own cart",
  ],
  catalog: [
    { id: "suit", name: "Navy two-piece suit", price: 189, image: "/media/look-2.webp", crop: "50% 30%", zoom: "300%", match: true },
    { id: "shirt", name: "White poplin shirt", price: 49, image: "/media/look-2.webp", crop: "50% 24%", zoom: "620%", match: true },
    { id: "loafers", name: "Brown leather loafers", price: 55, image: "/media/look-2.webp", crop: "50% 92%", zoom: "300%", match: true },
    { id: "coat", name: "Camel overcoat", price: 240, image: "/media/look-3.webp", crop: "50% 38%", zoom: "260%", match: false },
    { id: "bomber", name: "Black bomber", price: 120, image: "/media/look-4.webp", crop: "50% 32%", zoom: "280%", match: false },
    { id: "tee", name: "Black tee", price: 25, image: "/media/look-1.webp", crop: "50% 30%", zoom: "300%", match: false },
  ],
  note: "Example conversation. Products, sizes and prices come from your store.",
} as const;

export const steps = [
  {
    n: "01",
    title: "Connect",
    accent: "your store.",
    label: "Read-only",
    body: "Link Shopify with a custom app, or WooCommerce with an application password. Read-only. Persona indexes the catalog and maps your categories.",
    facts: [
      ["Platforms", "Shopify · WooCommerce"],
      ["Access", "Read-only"],
      ["Indexes", "Products + categories"],
    ],
  },
  {
    n: "02",
    title: "Brand it",
    accent: "as yours.",
    label: "Live preview",
    body: "Name, logo, color, font, corner radius, welcome line, and one of four studio backdrops. The widget stays dark until the catalog is ready.",
    facts: [
      ["Identity", "Name · logo · font"],
      ["Look", "Color · radius · backdrop"],
      ["Goes live", "When the catalog is ready"],
    ],
  },
  {
    n: "03",
    title: "Paste",
    accent: "one tag.",
    label: "One tag",
    body: "One async script before </body>. The token in the URL is the only credential. A kill switch turns every live snippet off at once.",
    facts: [
      ["Where", "Before </body>"],
      ["Credential", "Token in the URL"],
      ["Control", "Kill switch"],
    ],
  },
] as const;

export const snippet = `<script src="https://<persona-host>/widget.js?w=<token>" async></script>`;

export const plans = [
  {
    name: "Trial",
    price: "$450",
    cadence: "30 days",
    lead: "One time. Sales are recorded, not billed.",
    points: ["50,000 session units", "50 live try-on minutes", "12,500 garment units"],
    featured: false,
  },
  {
    name: "Main",
    price: "$1,500",
    cadence: "per month",
    lead: "Plus 3% of paid GMV Persona attributes.",
    points: ["100,000 session units", "100 live try-on minutes", "25,000 garment units"],
    featured: true,
  },
] as const;

export const pricingFoot =
  "Every plan includes size charts, catalog sync and analytics. On Main, unused included units roll over, capped at twice the monthly include.";

export const closing = {
  marquee: "Put the fitting room on your store",
  cta: "Start the $450 trial",
};
