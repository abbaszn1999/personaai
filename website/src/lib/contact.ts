export const topics = [
  { id: "demo", label: "Book a demo" },
  { id: "sales", label: "Sales & pricing" },
  { id: "technical", label: "Integration" },
  { id: "partner", label: "Partnership" },
] as const;

export const platforms = ["Shopify", "WooCommerce", "Other"] as const;

export type TopicId = (typeof topics)[number]["id"];

export const nextSteps = [
  { n: "01", title: "We read it", body: "Your message goes straight to the Persona team's inbox." },
  { n: "02", title: "We reply by email", body: "With answers, or a time to walk through Persona on your own catalog." },
  { n: "03", title: "You try it live", body: "If it fits, the 30-day trial runs on your real store." },
] as const;

export const MESSAGE_MAX = 2000;
