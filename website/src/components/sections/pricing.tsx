import { plans, pricingFoot } from "@/lib/content";
import { appPath } from "@/lib/site";
import { SpotlightCard } from "@/components/ui/spotlight-card";

export function Pricing() {
  return (
    <section id="pricing" className="px-[var(--gutter)] py-[var(--section-y-lg)]">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-display text-[clamp(2.6rem,6vw,6rem)] font-semibold leading-[0.9] tracking-[-0.05em] text-bone">
            Trial first.
            <span className="block font-serif font-normal italic text-muted">Then Main.</span>
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted">{pricingFoot}</p>
        </div>

        <div className="mt-14 grid gap-4 min-[900px]:grid-cols-2">
          {plans.map((plan) => (
            <SpotlightCard
              key={plan.name}
              className={
                plan.featured
                  ? "plan-featured flex flex-col rounded-[32px] p-9"
                  : "flex flex-col rounded-[32px] border border-hairline p-9"
              }
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted">{plan.name}</p>
                {plan.featured ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
                    For live stores
                  </span>
                ) : null}
              </div>
              <p className="mt-10 font-display text-[clamp(3.6rem,7vw,6.5rem)] font-semibold leading-none tracking-[-0.06em] text-bone">
                {plan.price}
                <span className="ml-3 align-middle font-sans text-base font-normal tracking-normal text-muted">
                  {plan.cadence}
                </span>
              </p>
              <p className="mt-4 text-sm text-muted">{plan.lead}</p>
              <ul className="mt-10 divide-y divide-hairline border-y border-hairline">
                {plan.points.map((point) => (
                  <li key={point} className="flex items-center justify-between py-4 text-sm text-bone">
                    {point}
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                  </li>
                ))}
              </ul>
              {plan.featured ? (
                <div className="mt-auto flex items-center gap-4 pt-10">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-brand/30 text-brand" aria-hidden>
                    ↻
                  </span>
                  <p className="text-sm leading-snug text-muted">
                    <span className="text-bone">Unused units roll over</span>, capped at twice the monthly include.
                  </p>
                </div>
              ) : (
                <a
                  href={appPath("/sign-up")}
                  className="auth-out mt-10 inline-flex w-fit rounded-full bg-bone px-6 py-3.5 text-sm font-semibold text-[var(--bg)] shadow-sm transition hover:bg-brand hover:text-white"
                >
                  Start the trial
                </a>
              )}
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}
