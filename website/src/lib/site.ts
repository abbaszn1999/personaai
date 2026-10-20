export const site = {
  name: "Persona AI",
  company: "Autommerce",
  tagline: "E-commerce with AI Excellence",
  description:
    "Persona AI puts a fitting room on Shopify and WooCommerce fashion stores: an avatar from one selfie, virtual try-on with your real garments, a live camera mirror, and a stylist that adds to your cart.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://persona.autommerce.com",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.autommerce.com",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "info@autommerce.com",
  /** Autommerce's WhatsApp number, as digits only (country code first) the way wa.me wants it. */
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "96181017568",
  whatsappDisplay: "+961 81 017 568",
};

export function whatsappUrl(message = "Hi Autommerce, I'd like to know more about Persona AI.") {
  return `https://wa.me/${site.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

export function appPath(path: string) {
  return `${site.appUrl.replace(/\/$/, "")}${path}`;
}
