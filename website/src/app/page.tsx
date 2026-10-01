import { FittingRoom } from "@/components/fitting-room/fitting-room";
import { Header } from "@/components/header";
import { Closing } from "@/components/sections/closing";
import { GoLive } from "@/components/sections/go-live";
import { Manifesto } from "@/components/sections/manifesto";
import { Pricing } from "@/components/sections/pricing";
import { Stylist } from "@/components/sections/stylist";

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="top">
        <FittingRoom />
        <Manifesto />
        <Stylist />
        <GoLive />
        <Pricing />
      </main>
      <Closing />
    </>
  );
}
