"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MESSAGE_MAX, platforms } from "@/lib/contact";
import { FALLBACK_EMAIL, buildPayload, sendLead, validateLead, type LeadErrors, type LeadPayload } from "@/lib/booking";
import { BookedPanel, type BookedInfo } from "@/components/contact/booked-panel";
import { SlotPicker } from "@/components/contact/slot-picker";
import { cn } from "@/lib/cn";
import { preloadTurnstile, setTurnstileContainer } from "@/lib/turnstile";

gsap.registerPlugin(useGSAP);

/** The shared API's booking pass lasts 30 minutes; a pass older than this is replaced. */
const PASS_FRESH_MS = 25 * 60 * 1000;

/** details → (lead sent) → picking a time → booked. `unavailable` is the quiet ending when the
 *  calendar can't be reached: the lead is already with the team, who reply by email. */
type Step = "details" | "picking" | "booked" | "unavailable";

function Field({
  id,
  label,
  children,
  hint,
  error,
}: {
  id: string;
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: string;
}) {
  return (
    <label htmlFor={id} className="group block">
      <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition-colors group-focus-within:text-brand">
        {label}
        {hint}
      </span>
      {children}
      {error ? (
        <span id={`${id}-error`} className="mt-1.5 block text-xs text-red-300">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const inputClass =
  "mt-2 w-full rounded-2xl border border-bone/25 bg-[var(--surface-input)] px-4 py-3.5 text-[15px] font-medium text-bone placeholder:font-normal placeholder:text-muted/80 outline-none transition focus:border-brand/60 focus:bg-surface focus:shadow-[0_0_0_4px_rgba(247,109,1,0.12)] aria-[invalid=true]:border-red-400/60";

export function ContactForm() {
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [store, setStore] = useState("");
  const [platform, setPlatform] = useState<string>("Shopify");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LeadErrors>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; mail: boolean } | null>(null);
  // The details already sent to the team, so going back to edit and continuing again does not
  // email the same lead twice (but does send it again if the details were changed).
  // `pass` is the signed booking pass the shared API returns with the lead; it expires, so an
  // old one is not reused.
  const [sent, setSent] = useState<{ key: string; pass: string | null; at: number } | null>(null);
  // When the form appeared: the shared API drops leads that come back impossibly fast.
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);
  const [payload, setPayload] = useState<LeadPayload | null>(null);
  const [booked, setBooked] = useState<BookedInfo | null>(null);

  const turnstileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setTurnstileContainer(turnstileRef.current);
    preloadTurnstile();
    return () => setTurnstileContainer(null);
  }, []);

  const { contextSafe } = useGSAP({ scope: root });

  const showSuccess = contextSafe(() => {
    gsap
      .timeline()
      .from("[data-success]", { autoAlpha: 0, y: 20, duration: 0.8, ease: "expo.out" })
      .from("[data-check]", { strokeDashoffset: 48, duration: 0.7, ease: "power2.out" }, "-=0.5")
      .from("[data-success-line]", { autoAlpha: 0, y: 12, stagger: 0.08, duration: 0.6, ease: "expo.out" }, "-=0.4");
  });

  // Each new screen starts at the top of the card, and the closing ones animate in.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (step === "booked" || step === "unavailable") requestAnimationFrame(showSuccess);
  }, [step, showSuccess]);

  const onUnavailable = useCallback(() => setStep("unavailable"), []);
  // The booking pass ran out: forget the sent details so "Edit my details" → continue sends them
  // again and gets a new pass.
  const onExpired = useCallback(() => setSent(null), []);
  const onBooked = useCallback((info: BookedInfo) => {
    setBooked(info);
    setStep("booked");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const honeypot = String(new FormData(event.currentTarget).get("website") ?? "");

    const fields = { name, email, store, platform, message };
    const errors = validateLead(fields);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError({ text: "Check the highlighted fields and try again.", mail: false });
      const first = (["name", "email", "message"] as const).find((key) => errors[key]);
      if (first) document.getElementById(first)?.focus();
      return;
    }
    setError(null);

    // Bots fill every field, including the hidden one; pretend it worked and send nothing.
    if (honeypot.trim()) {
      setStep("unavailable");
      return;
    }

    const next = buildPayload(fields);
    const key = JSON.stringify(next);
    setSending(true);
    const passFresh = sent !== null && (sent.pass === null || Date.now() - sent.at < PASS_FRESH_MS);
    if (!sent || sent.key !== key || !passFresh) {
      const result = await sendLead(next, { honeypot, elapsedMs: Date.now() - shownAt.current });
      if (!result.ok) {
        setSending(false);
        setError({
          text:
            result.code === "rate_limited"
              ? "Too many messages in a short time. Try again in a few minutes."
              : result.code === "verification"
                ? "We couldn’t verify that you’re human. Please reload the page and try again."
                : result.code === "invalid"
                ? "Check your name, email, and a message of at least 10 characters."
                : "We couldn’t send your details right now.",
          mail: result.code !== "rate_limited" && result.code !== "invalid",
        });
        return;
      }
      setSent({ key, pass: result.bookingPass, at: Date.now() });
    }
    setSending(false);
    setPayload(next);
    setStep("picking");
  }

  function startOver() {
    setName("");
    setEmail("");
    setStore("");
    setMessage("");
    setPlatform("Shopify");
    setSent(null);
    setPayload(null);
    setBooked(null);
    setFieldErrors({});
    setError(null);
    setStep("details");
  }

  return (
    <div ref={root} className="plan-featured relative scroll-mt-28 overflow-hidden rounded-[36px] p-7 min-[700px]:p-10">
      {step === "picking" && payload ? (
        <SlotPicker
          payload={payload}
          bookingPass={sent?.pass ?? null}
          onBack={() => setStep("details")}
          onBooked={onBooked}
          onUnavailable={onUnavailable}
          onExpired={onExpired}
        />
      ) : step === "booked" && booked ? (
        <BookedPanel info={booked} email={payload?.email ?? email} />
      ) : step === "unavailable" ? (
        <div data-success className="flex min-h-[34rem] flex-col items-start justify-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[image:var(--grad-brand)]">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path data-check d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="48" strokeDashoffset="0" />
            </svg>
          </span>
          <h2 data-success-line className="mt-8 font-display text-4xl font-semibold tracking-[-0.04em] text-bone">
            We have your details.
          </h2>
          <p data-success-line className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">
            We couldn’t show our calendar just now, so we’ll reply to{" "}
            <span className="text-bone">{payload?.email ?? email}</span> by email to arrange a time.
          </p>
          <button
            data-success-line
            type="button"
            onClick={startOver}
            className="mt-10 rounded-full border border-hairline px-6 py-3 text-sm text-bone transition-[border-color] hover:border-bone/40"
          >
            Send another
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-7">
          <div className="grid gap-5 min-[700px]:grid-cols-2">
            <Field id="name" label="Your name" error={fieldErrors.name}>
              <input
                id="name"
                name="name"
                required
                autoComplete="name"
                placeholder="Sara Haddad"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
                className={inputClass}
              />
            </Field>
            <Field id="email" label="Work email" error={fieldErrors.email}>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="sara@yourstore.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                className={inputClass}
              />
            </Field>
          </div>

          <Field id="store" label="Store URL" hint={<span className="normal-case tracking-normal">Optional</span>}>
            <input
              id="store"
              name="store"
              autoComplete="url"
              placeholder="yourstore.com"
              value={store}
              onChange={(event) => setStore(event.target.value)}
              className={inputClass}
            />
          </Field>

          {/* Its own row, with each choice a separate button: squeezed into half a row beside the
              store URL, three labels in one shared pill ran into each other. */}
          <fieldset>
            <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Platform</legend>
            <div role="radiogroup" aria-label="Platform" className="mt-2 grid grid-cols-[1fr_1.35fr_1fr] gap-2.5">
              {platforms.map((item) => {
                const selected = platform === item;
                return (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPlatform(item)}
                    className={cn(
                      "flex min-h-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-2xl border px-3 text-[14px] font-medium transition",
                      selected
                        ? "border-brand bg-brand/10 text-bone shadow-[0_0_0_3px_rgba(247,109,1,0.12)]"
                        : "border-bone/25 bg-[var(--surface-input)] text-muted hover:border-brand/40 hover:text-bone",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full transition",
                        selected ? "bg-brand" : "border border-hairline",
                      )}
                    />
                    {item}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Field
            id="message"
            label="Message"
            error={fieldErrors.message}
            hint={
              <span className={cn("tabular-nums normal-case tracking-normal", message.length > MESSAGE_MAX * 0.9 && "text-brand")}>
                {message.length} / {MESSAGE_MAX}
              </span>
            }
          >
            <textarea
              id="message"
              name="message"
              required
              maxLength={MESSAGE_MAX}
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              aria-invalid={Boolean(fieldErrors.message)}
              aria-describedby={fieldErrors.message ? "message-error" : undefined}
              placeholder="Tell us about your store, your catalog, and what you want shoppers to be able to do."
              className={cn(inputClass, "resize-none leading-relaxed")}
            />
          </Field>

          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

          {error ? (
            <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error.text}
              {error.mail ? (
                <>
                  {" "}
                  Email us at{" "}
                  <a className="underline underline-offset-2" href={`mailto:${FALLBACK_EMAIL}`}>
                    {FALLBACK_EMAIL}
                  </a>
                  .
                </>
              ) : null}
            </p>
          ) : null}

          <div className="flex flex-col gap-4 min-[700px]:flex-row min-[700px]:items-center min-[700px]:justify-between">
            <p className="max-w-xs text-xs leading-relaxed text-faint">
              We use your details to reply and to schedule your demo.{" "}
              <a
                href="https://autommerce.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 transition hover:text-muted"
              >
                Privacy policy
              </a>
            </p>
            <button
              type="submit"
              disabled={sending}
              className="group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-[image:var(--grad-brand)] px-8 py-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {sending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Sending
                </>
              ) : (
                <>
                  Book a demo
                  <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
      {/* Cloudflare Turnstile. Invisible unless Cloudflare asks the visitor to confirm. */}
      <div ref={turnstileRef} className="mt-4 flex justify-center empty:mt-0" />
    </div>
  );
}
