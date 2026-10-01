"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MESSAGE_MAX, platforms, topics, type TopicId } from "@/lib/contact";
import { site } from "@/lib/site";
import { cn } from "@/lib/cn";

gsap.registerPlugin(useGSAP);

type Status = "idle" | "sending" | "sent" | "error";

function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={id} className="group block">
      <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-faint transition-colors group-focus-within:text-brand">
        {label}
        {hint}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "mt-2 w-full rounded-2xl border border-hairline bg-[var(--surface-input)] px-4 py-3.5 text-[15px] text-bone placeholder:text-muted/40 outline-none transition focus:border-brand/60 focus:bg-surface focus:shadow-[0_0_0_4px_rgba(247,109,1,0.12)]";

export function ContactForm() {
  const root = useRef<HTMLDivElement>(null);
  const [topic, setTopic] = useState<TopicId>("demo");
  const [platform, setPlatform] = useState<string>("Shopify");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const { contextSafe } = useGSAP({ scope: root });

  const showSuccess = contextSafe(() => {
    gsap
      .timeline()
      .from("[data-success]", { autoAlpha: 0, y: 20, duration: 0.8, ease: "expo.out" })
      .from("[data-check]", { strokeDashoffset: 48, duration: 0.7, ease: "power2.out" }, "-=0.5")
      .from("[data-success-line]", { autoAlpha: 0, y: 12, stagger: 0.08, duration: 0.6, ease: "expo.out" }, "-=0.4");
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      topic,
      platform,
      message,
      name: form.get("name"),
      email: form.get("email"),
      store: form.get("store"),
      website: form.get("website"),
    };

    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "send_failed");
      }
      setSentTo(String(payload.email ?? ""));
      setStatus("sent");
      requestAnimationFrame(showSuccess);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(
        code === "invalid"
          ? "Check your name, email, and a message of at least 10 characters."
          : code === "rate_limited"
            ? "Too many messages in a short time. Try again in a few minutes."
            : `We couldn't send that right now. Email us at ${site.contactEmail}.`,
      );
      setStatus("error");
    }
  }

  return (
    <div ref={root} className="plan-featured relative overflow-hidden rounded-[36px] p-7 min-[700px]:p-10">
      {status === "sent" ? (
        <div data-success className="flex min-h-[34rem] flex-col items-start justify-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[image:var(--grad-brand)]">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path data-check d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="48" strokeDashoffset="0" />
            </svg>
          </span>
          <h2 data-success-line className="mt-8 font-display text-4xl font-semibold tracking-[-0.04em] text-bone">
            Message sent.
          </h2>
          <p data-success-line className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">
            Thanks. We&apos;ll reply to <span className="text-bone">{sentTo}</span>.
          </p>
          <button
            data-success-line
            type="button"
            onClick={() => {
              setStatus("idle");
              setMessage("");
            }}
            className="mt-10 rounded-full border border-hairline px-6 py-3 text-sm text-bone transition hover:border-bone/40"
          >
            Send another
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-7">
          <fieldset>
            <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">What is it about?</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {topics.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={topic === item.id}
                  onClick={() => setTopic(item.id)}
                  className={cn(
                    "rounded-full border px-4 py-2.5 text-[13px] font-medium transition",
                    topic === item.id ? "border-brand bg-brand text-white shadow-sm" : "border-hairline text-muted hover:border-brand/40 hover:text-bone",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 min-[700px]:grid-cols-2">
            <Field id="name" label="Your name">
              <input id="name" name="name" required autoComplete="name" placeholder="Sara Haddad" className={inputClass} />
            </Field>
            <Field id="email" label="Work email">
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="sara@yourstore.com" className={inputClass} />
            </Field>
          </div>

          <div className="grid gap-5 min-[700px]:grid-cols-[1.3fr_1fr]">
            <Field id="store" label="Store URL" hint={<span className="normal-case tracking-normal">Optional</span>}>
              <input id="store" name="store" autoComplete="url" placeholder="yourstore.com" className={inputClass} />
            </Field>
            <fieldset>
              <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Platform</legend>
              <div className="mt-2 grid grid-cols-3 rounded-2xl border border-hairline bg-[var(--surface-input)] p-1">
                {platforms.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={platform === item}
                    onClick={() => setPlatform(item)}
                    className={cn(
                      "rounded-xl py-2.5 text-[12px] font-medium transition",
                      platform === item ? "bg-bone text-[var(--bg)] shadow-sm" : "text-faint hover:text-muted",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <Field
            id="message"
            label="Message"
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
              minLength={10}
              maxLength={MESSAGE_MAX}
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us about your store, your catalog, and what you want shoppers to be able to do."
              className={cn(inputClass, "resize-none leading-relaxed")}
            />
          </Field>

          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

          {status === "error" ? (
            <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-4 min-[700px]:flex-row min-[700px]:items-center min-[700px]:justify-between">
            <p className="max-w-xs text-xs leading-relaxed text-faint">We only use your details to reply to this message.</p>
            <button
              type="submit"
              disabled={status === "sending"}
              className="group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-[image:var(--grad-brand)] px-8 py-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-70"
            >
              {status === "sending" ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Sending
                </>
              ) : (
                <>
                  Send message
                  <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
