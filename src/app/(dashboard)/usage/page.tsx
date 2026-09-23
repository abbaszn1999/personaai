import { Suspense } from "react";
import { UsagePage } from "@/modules/usage/components/usage-page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <UsagePage />
    </Suspense>
  );
}
