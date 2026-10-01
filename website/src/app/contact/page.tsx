import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Closing } from "@/components/sections/closing";
import { ContactHero } from "@/components/contact/contact-hero";

export const metadata: Metadata = {
  title: "Contact — Persona AI",
  description: "Book a demo on your own catalog, ask about pricing, or get help with the Persona AI integration.",
};

export default function ContactPage() {
  return (
    <>
      <Header />
      <main>
        <ContactHero />
      </main>
      <Closing />
    </>
  );
}
