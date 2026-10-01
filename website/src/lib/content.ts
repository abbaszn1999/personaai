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
  lede: "One script tag gives every shopper on your store an avatar, your real garments on it, and a stylist that adds to your cart.",
  cta: "Start the trial",
  scroll: "Scroll to dress",
};

export const looks = [
  {
    src: "/media/look-1.webp",
    code: "01",
    title: "One selfie. Their avatar.",
    body: "A photo and their measurements become an avatar. The same face carries through every outfit after it.",
    garment: "Base avatar · black tee",
    tag: "Avatar ready",
    word: "Avatar",
    glow: "#3a2a24",
  },
  {
    src: "/media/look-2.webp",
    code: "02",
    title: "Your garments, rendered on them.",
    body: "Each outfit is rendered in one pass on the stored avatar, so the face does not drift from look to look.",
    garment: "Navy two-piece suit",
    tag: "From your catalog",
    word: "Catalog",
    glow: "#1b2a55",
  },
  {
    src: "/media/look-3.webp",
    code: "03",
    title: "Sized from your charts.",
    body: "Recommendations use their measurements and your size charts. Charts for global brands are researched once and reused.",
    garment: "Camel overcoat · turtleneck",
    tag: "Size M · recommended",
    word: "Sized",
    glow: "#6b4520",
  },
  {
    src: "/media/look-4.webp",
    code: "04",
    title: "Live, on their own camera.",
    body: "Turn on live try-on and the garment follows them in real time. Photo try-on stays available when live is off.",
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
  answer: "Navy suit, white shirt, brown loafers. All in stock, all in your size.",
  budget: 300,
  steps: [
    "Understands the ask",
    "Searches only your catalog",
    "Builds a look within budget",
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
    body: "Link Shopify with a custom app, or WooCommerce with an application password. Read-only. Persona indexes the catalog and maps your categories.",
  },
  {
    n: "02",
    title: "Brand it",
    body: "Name, logo, color, font, corner radius, welcome line, and one of four studio backdrops. The widget stays dark until the catalog is ready.",
  },
  {
    n: "03",
    title: "Paste",
    body: "One async script before </body>. The token in the URL is the only credential. A kill switch turns every live snippet off at once.",
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
