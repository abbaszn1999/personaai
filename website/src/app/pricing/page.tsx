import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Closing } from "@/components/sections/closing";
import { PricingHero } from "@/components/pricing/plans";
import { Calculator } from "@/components/pricing/calculator";
import { Compare, Faq, PricingCta, TopUps, Units } from "@/components/pricing/details";

export const metadata: Metadata = {
  title: "Pricing — Persona AI",
  description: "A $450 thirty-day trial that records sales without billing them, then Main at $1,500 a month plus 3% of the GMV Persona attributes.",
};

export default function PricingPage() {
  return (
    <>
      <Header />
      <main>
        <PricingHero />
        <Calculator />
        <Units />
        <TopUps />
        <Compare />
        <Faq />
        <PricingCta />
      </main>
      <Closing />
    </>
  );
}
