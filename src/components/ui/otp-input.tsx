"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const OTP_LENGTH = 6;

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires once when the shopper finishes (or pastes) a full code, so the form can submit
   *  without waiting for a second tap on Sign in. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  error?: boolean;
  id?: string;
}

/** Six individual digit slots — the OTP / verification-code pattern used by Stripe, Clerk,
 *  and most phone sign-in screens. One character per box, auto-advance, backspace, and paste
 *  of the whole code all work; `autocomplete="one-time-code"` on the first slot lets the OS
 *  suggest a just-received SMS or email code. */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  error = false,
  id,
}: OtpInputProps) {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  // The latest code, updated the moment a digit is accepted rather than on the next render.
  // `focusAt` moves focus to the next box inside the same event, before React has re-rendered,
  // so the focus guard below would otherwise read the previous code, decide the next box is
  // "too far ahead" and throw focus back to the first box - every digit after the first was
  // lost and the cursor never advanced.
  const latestValue = React.useRef(value);
  React.useLayoutEffect(() => {
    latestValue.current = value;
  }, [value]);

  const focusAt = (index: number) => {
    const el = inputsRef.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string) => {
    const cleaned = next.replace(/\D/g, "").slice(0, OTP_LENGTH);
    const previous = latestValue.current;
    latestValue.current = cleaned;
    onChange(cleaned);
    // Fires for every newly completed code, including a corrected last digit after a wrong one.
    if (cleaned.length === OTP_LENGTH && cleaned !== previous) onComplete?.(cleaned);
    return cleaned;
  };

  // Boxes are disabled while a code is being checked, which drops focus. Hand it back when the
  // check finishes so a shopper can correct the last digit straight away.
  const wasDisabled = React.useRef(disabled);
  React.useEffect(() => {
    if (wasDisabled.current && !disabled) focusAt(Math.min(latestValue.current.length, OTP_LENGTH - 1));
    wasDisabled.current = disabled;
  }, [disabled]);

  const handleChange = (index: number, raw: string) => {
    const incoming = raw.replace(/\D/g, "");
    const current = latestValue.current;

    if (!incoming) {
      commit(current.slice(0, index) + current.slice(index + 1));
      return;
    }

    // Autofill / paste often dumps the whole code into a single slot.
    if (incoming.length >= OTP_LENGTH) {
      commit(incoming);
      focusAt(OTP_LENGTH - 1);
      return;
    }

    // Typing into a filled slot without the text being selected appends, e.g. "17".
    if (incoming.length > 1) {
      const typedOver = Boolean(digits[index]) && incoming.startsWith(digits[index]);
      const insert = typedOver ? incoming.slice(digits[index].length) : incoming;
      commit(current.slice(0, index) + insert);
      focusAt(Math.min(index + insert.length, OTP_LENGTH - 1));
      return;
    }

    commit(current.slice(0, index) + incoming + current.slice(index + 1));
    focusAt(Math.min(index + 1, OTP_LENGTH - 1));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const current = latestValue.current;
      if (digits[index]) {
        commit(current.slice(0, index) + current.slice(index + 1));
      } else if (index > 0) {
        commit(current.slice(0, index - 1));
        focusAt(index - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(index - 1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(index + 1);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      focusAt(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      focusAt(Math.max(latestValue.current.length - 1, 0));
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    const cleaned = commit(latestValue.current.slice(0, index) + pasted);
    focusAt(Math.min(cleaned.length, OTP_LENGTH - 1));
  };

  return (
    <div
      role="group"
      aria-label="6-digit verification code"
      className="flex items-center justify-between gap-1.5 sm:gap-2"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          id={index === 0 ? id : undefined}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus && index === 0}
          name={index === 0 ? "otp" : undefined}
          pattern="\d*"
          maxLength={OTP_LENGTH}
          enterKeyHint={index === OTP_LENGTH - 1 ? "done" : "next"}
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          onFocus={(e) => {
            const firstEmpty = Math.min(latestValue.current.length, OTP_LENGTH - 1);
            if (index > firstEmpty) {
              focusAt(firstEmpty);
              return;
            }
            e.currentTarget.select();
          }}
          className={cn(
            "h-12 min-w-0 flex-1 rounded-[var(--radius-lg)] border bg-[var(--color-surface-card)] text-center text-[16px] font-semibold tabular-nums",
            "text-[var(--color-text-primary)] caret-[var(--color-brand)]",
            "transition-colors focus:outline-none focus:border-[var(--color-brand)] focus:ring-1 focus:ring-[var(--color-brand)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-[var(--color-error)] focus:ring-[var(--color-error)]"
              : "border-[var(--color-border)]"
          )}
        />
      ))}
    </div>
  );
}
