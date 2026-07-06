"use client";

import { Suspense } from "react";
import { SignUpForm } from "@/modules/auth/components/sign-up-form";

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
