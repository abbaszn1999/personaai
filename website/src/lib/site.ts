export const site = {
  name: "Persona AI",
  company: "Autommerce",
  tagline: "E-commerce with AI Excellence",
  description:
    "Persona AI puts a fitting room on Shopify and WooCommerce fashion stores: an avatar from one selfie, virtual try-on with your real garments, a live camera mirror, and a stylist that adds to your cart.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://personaai-1lco.onrender.com",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "info@autommerce.com",
};

export function appPath(path: string) {
  return `${site.appUrl.replace(/\/$/, "")}${path}`;
}
