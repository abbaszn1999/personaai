export const pricingHero = {
  kicker: "Pricing",
  lineA: "Two plans.",
  lineB: "No guesswork.",
  lede: "Start with a 30-day trial that records every sale without billing it. Move to Main when the numbers make sense.",
};

export const tiers = [
  {
    id: "trial",
    name: "Trial",
    price: 450,
    cadence: "one time · 30 days",
    lead: "Evaluate Persona on your live store. Sales are recorded, not billed.",
    units: [
      ["Session units", "50,000"],
      ["Live try-on", "50 min"],
      ["Garment units", "12,500"],
    ],
    extras: ["No GMV fee", "Unused units move to Main if you upgrade during the trial"],
    cta: "Start the trial",
    featured: false,
  },
  {
    id: "main",
    name: "Main",
    price: 1500,
    cadence: "per month",
    lead: "Persona as your everyday shopper experience.",
    units: [
      ["Session units", "100,000"],
      ["Live try-on", "100 min"],
      ["Garment units", "25,000"],
    ],
    extras: ["+ 3% of paid GMV Persona attributes", "Unused units roll over, capped at 2× the monthly include"],
    cta: "Start with the trial",
    featured: true,
  },
] as const;

export const included = ["Size charts", "Catalog sync", "Analytics", "Stylist", "Photo try-on", "Live mirror", "Branding", "Kill switch"];

export const units = [
  {
    key: "session",
    name: "Session units",
    price: "$0.0025",
    per: "per unit",
    body: "One unit is one catalog search by the stylist. Chat between searches adds up into the same units, so a conversation never costs more than it uses.",
    example: [
      ["1 catalog search", "1 unit"],
      ["1,000 units", "$2.50"],
    ],
  },
  {
    key: "live",
    name: "Live minutes",
    price: "$1.20",
    per: "per minute",
    body: "Live try-on on the shopper's camera is billed by the second, not rounded up to the minute. Each session is capped at 90 seconds.",
    example: [
      ["30-second session", "$0.60"],
      ["Full 90-second session", "$1.80"],
    ],
  },
  {
    key: "garment",
    name: "Garment units",
    price: "$0.008",
    per: "per unit",
    body: "Avatars and photo try-ons draw from garment units. Extra garments in the same render cost less than the first.",
    example: [
      ["Avatar", "1.25 units"],
      ["Try-on, first garment", "1.875 units"],
      ["Each extra garment", "1 unit"],
    ],
  },
] as const;

export const topUps = [
  { name: "Session pack", unit: "1,000 session units", price: "$2.50", range: "10 – 10,000 packs" },
  { name: "Garment pack", unit: "100 garment units", price: "$0.80", range: "50 – 5,000 packs" },
  { name: "Live minutes", unit: "1 minute", price: "$1.20", range: "25 – 10,000 minutes" },
] as const;

export const compare = [
  ["Price", "$450 once", "$1,500 / month"],
  ["Length", "30 days", "Monthly"],
  ["Session units", "50,000", "100,000 / month"],
  ["Live try-on", "50 minutes", "100 minutes / month"],
  ["Garment units", "12,500", "25,000 / month"],
  ["GMV fee", "None, sales recorded only", "3% of paid, attributed GMV"],
  ["Unused units", "Move to Main on upgrade", "Roll over, up to 2× include"],
  ["Size charts, catalog sync, analytics", "Included", "Included"],
  ["Stylist, photo try-on, live mirror", "Included", "Included"],
] as const;

export const faqs = [
  {
    q: "What counts as GMV Persona attributes?",
    a: "Paid orders we can trace back to the widget, matched by a line tag on the cart item or by device match. Each one is written to a ledger you can see in the dashboard. Only these orders are counted.",
  },
  {
    q: "Is anything billed on sales during the trial?",
    a: "No. The trial records attributed sales so you can see what Persona would have earned you, but none of it is billed.",
  },
  {
    q: "What happens to units I don't use?",
    a: "On Main, unused included units roll over each month, capped at twice the monthly include. On the trial, unused units move to Main if you upgrade before the 30 days end.",
  },
  {
    q: "How is live try-on billed?",
    a: "By the second at $1.20 a minute. A session is capped at 90 seconds, and live only loads when a shopper starts it.",
  },
  {
    q: "Can I buy more units?",
    a: "Yes. Session units, garment units and live minutes can be topped up in packs, priced at cost, from the dashboard.",
  },
  {
    q: "How do I pay?",
    a: "By card through Stripe. The 3% GMV fee is added to your invoice. Amounts under $0.50 wait for the next invoice.",
  },
] as const;
