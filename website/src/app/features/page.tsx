import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Closing } from "@/components/sections/closing";
import { FeaturesHero } from "@/components/features/hero";
import { Chapters } from "@/components/features/chapters";
import { Merchant } from "@/components/features/merchant";
import { FeaturesCta, Reasons, Specs } from "@/components/features/specs";

export const metadata: Metadata = {
  title: "Features — Persona AI",
  description:
    "Avatar from one selfie, virtual try-on with your real garments, a live camera mirror, sizing from your charts, a catalog-grounded stylist and native cart. One script tag.",
};

export default function FeaturesPage() {
  return (
    <>
      <Header />
      <main>
        <FeaturesHero />
        <Reasons />
        <Chapters />
        <Merchant />
        <Specs />
        <FeaturesCta />
      </main>
      <Closing />
    </>
  );
}
