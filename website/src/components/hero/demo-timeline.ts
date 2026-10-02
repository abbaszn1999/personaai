import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { heroDemo } from "@/lib/content";

gsap.registerPlugin(ScrollTrigger);

const BUDGET = 293;
const FOCUS = "0 0 0 1.5px rgba(107,53,141,0.95)";
const BLUR = "0 0 0 0px rgba(107,53,141,0)";

function finder(scope: HTMLElement) {
  const all = (...keys: string[]) =>
    keys.flatMap((key) => Array.from(scope.querySelectorAll<HTMLElement>(`[data-d="${key}"]`)));
  const one = (key: string) => all(key)[0];
  return { all, one };
}

/** Layout position of an element's centre inside the screen, ignoring transforms. */
function centreOf(el: HTMLElement, screen: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== screen) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
}

function buildTimeline(scope: HTMLElement, mobile: boolean) {
  const { all, one } = finder(scope);
  const screen = one("screen");
  const cursor = one("cursor");
  const cart = one("cart");
  const amount = one("amt");
  const pct = one("pct");
  const steps = all("step");
  const bars = all("step-bar");
  const counters = { budget: 0, pct: 0 };

  const tl = gsap.timeline({ repeat: -1, paused: true, defaults: { ease: "power3.out" } });

  tl.set(one("widget"), { autoAlpha: 0, scale: 0.96, y: 14, transformOrigin: "50% 60%" })
    .set(one("dim"), { autoAlpha: 0 })
    .set(cursor, { autoAlpha: 0, x: screen.offsetWidth * 0.82, y: screen.offsetHeight * 0.95, scale: 1 })
    .set(one("ripple"), { autoAlpha: 0 })
    .set(all("onboard", "form", "drop-empty", "eg"), { autoAlpha: 1 })
    .set(all("gen", "photo-ok", "create-on"), { autoAlpha: 0 })
    .set(all("field"), { boxShadow: BLUR })
    .set(all("val"), { clipPath: "inset(0% 100% 0% 0%)" })
    .set(one("selfie"), { autoAlpha: 0, scale: 0.6 })
    .set(all("progress", "seg"), { scaleX: 0 })
    .set(all("ostage"), { autoAlpha: 0, y: 6 })
    .set(one("av-base"), { clipPath: "inset(0% 0% 100% 0%)" })
    .set(one("av-new"), { clipPath: "inset(100% 0% 0% 0%)" })
    .set(all("welcome", "user", "answer", "card", "wear"), { autoAlpha: 0, y: 8 })
    .set(all("typing", "budget", "scan", "scan-line"), { autoAlpha: 0 })
    .set(all("stats", "fit"), { autoAlpha: 0, y: 6 })
    .set(all("hot"), { autoAlpha: 0, scale: 0.3 })
    .set(one("pop"), { autoAlpha: 0, y: 8, scale: 0.96 })
    .set(one("toast"), { autoAlpha: 0, y: -8 })
    .set(one("typed"), { clipPath: "inset(0% 100% 0% 0%)" })
    .set(one("ph"), { autoAlpha: 1 })
    .set(one("budget-fill"), { scaleX: 0 })
    .set(one("beam"), { top: "0%" })
    .set(one("add-a"), { autoAlpha: 1 })
    .set(one("add-b"), { autoAlpha: 0 })
    .set(bars, { scaleX: 0 })
    .set(steps, { opacity: 0.4 })
    .call(() => {
      cart.textContent = "0";
      cart.dataset.on = "false";
      amount.textContent = "0";
      pct.textContent = "0";
      counters.budget = 0;
      counters.pct = 0;
    });
  if (mobile) tl.set(one("sheet"), { yPercent: 100 });

  const click = (key: string, at: number) => {
    const target = centreOf(one(key), screen);
    tl.to(cursor, { autoAlpha: 1, duration: 0.2 }, at)
      .to(cursor, { x: target.x, y: target.y, duration: 0.75, ease: "power2.inOut" }, at)
      .to(cursor, { scale: 0.82, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.inOut" }, at + 0.78)
      .fromTo(one("ripple"), { autoAlpha: 0.8, scale: 0.3 }, { autoAlpha: 0, scale: 2, duration: 0.5, ease: "power2.out" }, at + 0.8);
  };
  const step = (index: number, at: number, length: number) => {
    tl.to(steps[index], { opacity: 1, duration: 0.3 }, at).to(bars[index], { scaleX: 1, duration: length, ease: "none" }, at);
  };

  // 01 · The shopper opens Persona, enters their measurements and a face photo, and the avatar is built.
  step(0, 1.4, 6.6);
  click("launch", 0.4);
  tl.to(one("dim"), { autoAlpha: 1, duration: 0.4 }, 1.4)
    .to(one("widget"), { autoAlpha: 1, scale: 1, y: 0, duration: 0.7, ease: "expo.out" }, 1.4)
    .to(cursor, { autoAlpha: 0, duration: 0.2 }, 1.5);

  const fields = all("field");
  const examples = all("eg");
  all("val").forEach((value, index) => {
    const start = 1.95 + index * 0.4;
    const length = heroDemo.fields[index][1].length;
    tl.to(fields[index], { boxShadow: FOCUS, duration: 0.12 }, start)
      .set(examples[index], { autoAlpha: 0 }, start + 0.08)
      .to(value, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.08 * length, ease: `steps(${length})` }, start + 0.08)
      .to(fields[index], { boxShadow: BLUR, duration: 0.12 }, start + 0.36);
  });

  tl.to(one("drop-empty"), { autoAlpha: 0, duration: 0.2 }, 4.0)
    .to(one("selfie"), { autoAlpha: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, 4.05)
    .to(one("photo-ok"), { autoAlpha: 1, duration: 0.3 }, 4.35)
    .to(one("create-on"), { autoAlpha: 1, duration: 0.3 }, 4.5);
  click("create", 4.45);

  tl.to(cursor, { autoAlpha: 0, duration: 0.2 }, 5.4)
    .to(one("form"), { autoAlpha: 0, duration: 0.3 }, 5.4)
    .to(one("gen"), { autoAlpha: 1, duration: 0.35 }, 5.55)
    .to(one("progress"), { scaleX: 1, duration: 2, ease: "power1.inOut" }, 5.6)
    .to(
      counters,
      {
        pct: 100,
        duration: 2,
        ease: "power1.inOut",
        onUpdate: () => {
          pct.textContent = String(Math.round(counters.pct));
        },
      },
      5.6,
    );
  const segments = all("seg");
  all("ostage").forEach((label, index, labels) => {
    const start = 5.6 + index * 0.4;
    tl.to(label, { autoAlpha: 1, y: 0, duration: 0.2 }, start).to(segments[index], { scaleX: 1, duration: 0.3 }, start);
    if (index < labels.length - 1) tl.to(label, { autoAlpha: 0, y: -6, duration: 0.15 }, start + 0.36);
  });
  tl.to(one("onboard"), { autoAlpha: 0, duration: 0.5 }, 7.7)
    .to(one("av-base"), { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, ease: "power2.inOut" }, 7.75)
    .to(all("welcome"), { autoAlpha: 1, y: 0, duration: 0.4 }, 8.0)
    .to(all("stats"), { autoAlpha: 1, y: 0, duration: 0.4 }, 8.2);

  // 02 · They ask the stylist, it searches the catalog and builds a look inside the budget.
  step(1, 8.3, 4.2);
  if (mobile) tl.to(one("sheet"), { yPercent: 0, duration: 0.7, ease: "expo.out" }, 8.4);
  else click("input", 8.3);
  tl.to(one("ph"), { autoAlpha: 0, duration: 0.1 }, 9.15)
    .to(one("typed"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.05, ease: `steps(${heroDemo.ask.length})` }, 9.15)
    .to(one("send"), { scale: 0.82, duration: 0.1, yoyo: true, repeat: 1 }, 10.25)
    .set(one("typed"), { clipPath: "inset(0% 100% 0% 0%)" }, 10.4)
    .set(one("ph"), { autoAlpha: 1 }, 10.4)
    .to(cursor, { autoAlpha: 0, duration: 0.2 }, 10.4)
    .to(one("user"), { autoAlpha: 1, y: 0, duration: 0.35 }, 10.4)
    .to(one("typing"), { autoAlpha: 1, duration: 0.25 }, 10.7)
    .to(one("typing"), { autoAlpha: 0, duration: 0.2 }, 11.55)
    .to(one("answer"), { autoAlpha: 1, y: 0, duration: 0.35 }, 11.65)
    .to(all("card"), { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.1 }, 11.85)
    .to(one("budget"), { autoAlpha: 1, duration: 0.3 }, 12.15)
    .to(one("budget-fill"), { scaleX: BUDGET / 300, duration: 0.8, ease: "power2.out" }, 12.25)
    .to(
      counters,
      {
        budget: BUDGET,
        duration: 0.8,
        ease: "power2.out",
        onUpdate: () => {
          amount.textContent = String(Math.round(counters.budget));
        },
      },
      12.25,
    )
    .to(one("wear"), { autoAlpha: 1, y: 0, duration: 0.35 }, 12.55);

  // 03 · One tap renders the whole look on their avatar.
  step(2, 13.0, 3.3);
  click("wear", 12.9);
  if (mobile) tl.to(one("sheet"), { yPercent: 84, duration: 0.6, ease: "expo.inOut" }, 13.8);
  tl.to(cursor, { autoAlpha: 0, duration: 0.2 }, 13.9)
    .to(one("scan"), { autoAlpha: 1, duration: 0.3 }, 13.95)
    .fromTo(one("beam"), { top: "0%" }, { top: "100%", duration: 1.05, ease: "sine.inOut" }, 14.05)
    .to(one("beam"), { top: "0%", duration: 1.05, ease: "sine.inOut" }, 15.1)
    .to(one("av-new"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.05, ease: "sine.inOut" }, 15.1);
  all("scan-line").forEach((line, index, lines) => {
    const start = 14.05 + index * 0.68;
    tl.to(line, { autoAlpha: 1, duration: 0.2 }, start);
    if (index < lines.length - 1) tl.to(line, { autoAlpha: 0, duration: 0.15 }, start + 0.62);
  });
  tl.to(one("scan"), { autoAlpha: 0, duration: 0.35 }, 16.25).to(one("fit"), { autoAlpha: 1, y: 0, duration: 0.4 }, 16.35);

  // 04 · Hotspots on every piece, and it lands in the store's own cart.
  step(3, 16.3, 3.2);
  tl.to(all("hot"), { autoAlpha: 1, scale: 1, duration: 0.4, stagger: 0.12, ease: "back.out(2.5)" }, 16.4)
    .to(one("pop"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, 16.9);
  click("add", 17.05);
  tl.to(one("add-a"), { autoAlpha: 0, duration: 0.15 }, 17.9)
    .to(one("add-b"), { autoAlpha: 1, duration: 0.15 }, 17.95)
    .call(
      () => {
        cart.textContent = "3";
        cart.dataset.on = "true";
      },
      undefined,
      18.05,
    )
    .fromTo(cart, { scale: 1 }, { scale: 1.6, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" }, 18.05)
    .to(one("toast"), { autoAlpha: 1, y: 0, duration: 0.4 }, 18.15)
    .to(cursor, { autoAlpha: 0, duration: 0.3 }, 18.5);

  tl.to([one("widget"), one("toast")], { autoAlpha: 0, y: 10, duration: 0.5, ease: "power2.in" }, 20.6)
    .to(one("dim"), { autoAlpha: 0, duration: 0.5 }, 20.6)
    .to(steps, { opacity: 0.4, duration: 0.4 }, 20.6)
    .to({}, { duration: 0.6 }, 21.1);

  return tl;
}

/** Runs the demo loop while it is on screen and rebuilds it when the screen is resized. */
export function playDemo(scope: HTMLElement, mobile: boolean) {
  const screen = finder(scope).one("screen");
  let tl = buildTimeline(scope, mobile);
  let visible = false;
  let width = screen.offsetWidth;

  const trigger = ScrollTrigger.create({
    trigger: scope,
    start: "top bottom",
    end: "bottom top",
    onToggle: (self) => {
      visible = self.isActive;
      if (visible) tl.play();
      else tl.pause();
    },
  });

  let pending = 0;
  const observer = new ResizeObserver(() => {
    if (Math.abs(screen.offsetWidth - width) < 2) return;
    width = screen.offsetWidth;
    window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      tl.kill();
      tl = buildTimeline(scope, mobile);
      if (visible) tl.play();
    }, 200);
  });
  observer.observe(screen);

  return () => {
    window.clearTimeout(pending);
    observer.disconnect();
    trigger.kill();
    tl.kill();
  };
}

/** Static final frame for reduced motion: the finished look, the chat and the filled cart. */
export function showDemoEnd(scope: HTMLElement, mobile: boolean) {
  const { all, one } = finder(scope);
  gsap.set(all("onboard", "typing", "scan", "cursor", "add-a", "dim", "toast"), { autoAlpha: 0 });
  gsap.set(all("widget", "welcome", "user", "answer", "card", "budget", "wear", "stats", "fit", "hot", "add-b"), { autoAlpha: 1 });
  gsap.set(one("pop"), { autoAlpha: mobile ? 0 : 1 });
  gsap.set(one("typed"), { clipPath: "inset(0% 100% 0% 0%)" });
  gsap.set(one("budget-fill"), { scaleX: BUDGET / 300 });
  gsap.set(all("step-bar"), { scaleX: 1 });
  if (mobile) gsap.set(one("sheet"), { yPercent: 0 });
  one("amt").textContent = String(BUDGET);
  one("cart").textContent = "3";
  one("cart").dataset.on = "true";
}
