"use client";

import { Suspense } from "react";
import { SignInForm } from "@/modules/auth/components/sign-in-form";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
