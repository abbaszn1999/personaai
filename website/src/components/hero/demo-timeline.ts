import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { heroDemo } from "@/lib/content";

gsap.registerPlugin(ScrollTrigger);

const BUDGET = 293;

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
    .set(all("onboard", "form", "gen", "photo-ok", "create-on"), { autoAlpha: 0 })
    .set(all("install", "launch", "url-admin"), { autoAlpha: 0 })
    .set(all("url-store"), { autoAlpha: 1 })
    // The widget opens with the avatar already built, so the demo starts at the stylist.
    .set(one("av-base"), { clipPath: "inset(0% 0% 0% 0%)" })
    .set(one("av-new"), { clipPath: "inset(100% 0% 0% 0%)" })
    .set(all("welcome", "stats"), { autoAlpha: 1, y: 0 })
    .set(all("user", "answer", "card", "wear"), { autoAlpha: 0, y: 8 })
    .set(all("typing", "budget", "scan", "scan-line"), { autoAlpha: 0 })
    .set(one("fit"), { autoAlpha: 0, y: 6 })
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

  const clickOn = (key: string, at: number, fast = false) => {
    const travel = fast ? 0.4 : 0.75;
    const target = centreOf(one(key), screen);
    tl.to(cursor, { autoAlpha: 1, duration: 0.2 }, at)
      .to(cursor, { x: target.x, y: target.y, duration: travel, ease: "power2.inOut" }, at)
      .to(cursor, { scale: 0.82, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.inOut" }, at + travel + 0.03)
      .fromTo(one("ripple"), { autoAlpha: 0.8, scale: 0.3 }, { autoAlpha: 0, scale: 2, duration: 0.5, ease: "power2.out" }, at + travel + 0.05);
  };
  const step = (index: number, at: number, length: number) => {
    tl.to(steps[index], { opacity: 1, duration: 0.3 }, at).to(bars[index], { scaleX: 1, duration: length, ease: "none" }, at);
  };

  // The shopper opens Persona. Their avatar is already there.
  tl.to(one("dim"), { autoAlpha: 1, duration: 0.4 }, 0.1).to(
    one("widget"),
    { autoAlpha: 1, scale: 1, y: 0, duration: 0.7, ease: "expo.out" },
    0.1,
  );

  // 01 · They ask the stylist, it searches the catalog and builds a look inside the budget.
  step(0, 1.0, 4.2);
  if (mobile) tl.to(one("sheet"), { yPercent: 0, duration: 0.7, ease: "expo.out" }, 1.1);
  else clickOn("input", 1.0);
  tl.to(one("ph"), { autoAlpha: 0, duration: 0.1 }, 1.85)
    .to(one("typed"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.05, ease: `steps(${heroDemo.ask.length})` }, 1.85)
    .to(one("send"), { scale: 0.82, duration: 0.1, yoyo: true, repeat: 1 }, 2.95)
    .set(one("typed"), { clipPath: "inset(0% 100% 0% 0%)" }, 3.1)
    .set(one("ph"), { autoAlpha: 1 }, 3.1)
    .to(cursor, { autoAlpha: 0, duration: 0.2 }, 3.1)
    .to(one("user"), { autoAlpha: 1, y: 0, duration: 0.35 }, 3.1)
    .to(one("typing"), { autoAlpha: 1, duration: 0.25 }, 3.4)
    .to(one("typing"), { autoAlpha: 0, duration: 0.2 }, 4.25)
    .to(one("answer"), { autoAlpha: 1, y: 0, duration: 0.35 }, 4.35)
    .to(all("card"), { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.1 }, 4.55)
    .to(one("budget"), { autoAlpha: 1, duration: 0.3 }, 4.85)
    .to(one("budget-fill"), { scaleX: BUDGET / 300, duration: 0.8, ease: "power2.out" }, 4.95)
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
      4.95,
    )
    .to(one("wear"), { autoAlpha: 1, y: 0, duration: 0.35 }, 5.25);

  // 02 · One tap renders the whole look on their avatar.
  step(1, 5.7, 3.3);
  clickOn("wear", 5.6);
  if (mobile) tl.to(one("sheet"), { yPercent: 84, duration: 0.6, ease: "expo.inOut" }, 6.5);
  tl.to(cursor, { autoAlpha: 0, duration: 0.2 }, 6.6)
    .to(one("scan"), { autoAlpha: 1, duration: 0.3 }, 6.65)
    .fromTo(one("beam"), { top: "0%" }, { top: "100%", duration: 1.05, ease: "sine.inOut" }, 6.75)
    .to(one("beam"), { top: "0%", duration: 1.05, ease: "sine.inOut" }, 7.8)
    .to(one("av-new"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.05, ease: "sine.inOut" }, 7.8);
  all("scan-line").forEach((line, index, lines) => {
    const start = 6.75 + index * 0.68;
    tl.to(line, { autoAlpha: 1, duration: 0.2 }, start);
    if (index < lines.length - 1) tl.to(line, { autoAlpha: 0, duration: 0.15 }, start + 0.62);
  });
  tl.to(one("scan"), { autoAlpha: 0, duration: 0.35 }, 8.95).to(one("fit"), { autoAlpha: 1, y: 0, duration: 0.4 }, 9.05);

  // 03 · Hotspots on every piece, and it lands in the store's own cart.
  step(2, 9.0, 2.4);
  tl.to(all("hot"), { autoAlpha: 1, scale: 1, duration: 0.25, stagger: 0.06, ease: "back.out(2.5)" }, 9.1)
    .to(one("pop"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(1.6)" }, 9.3);
  clickOn("add", 9.4, true);
  tl.to(one("add-a"), { autoAlpha: 0, duration: 0.1 }, 9.93)
    .to(one("add-b"), { autoAlpha: 1, duration: 0.1 }, 9.96)
    .call(
      () => {
        cart.textContent = "3";
        cart.dataset.on = "true";
      },
      undefined,
      10.0,
    )
    .fromTo(cart, { scale: 1 }, { scale: 1.6, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" }, 10.0)
    .to(one("toast"), { autoAlpha: 1, y: 0, duration: 0.3 }, 10.05)
    .to(cursor, { autoAlpha: 0, duration: 0.2 }, 10.3);

  tl.to([one("widget"), one("toast")], { autoAlpha: 0, y: 10, duration: 0.5, ease: "power2.in" }, 11.8)
    .to(one("dim"), { autoAlpha: 0, duration: 0.5 }, 11.8)
    .to(steps, { opacity: 0.4, duration: 0.4 }, 11.8)
    .to({}, { duration: 0.6 }, 12.3);

  // Whole demo (stylist, render, cart) plays faster.
  tl.timeScale(1.4);

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
  gsap.set(all("onboard", "typing", "scan", "cursor", "add-a", "dim", "toast", "install", "url-admin"), { autoAlpha: 0 });
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
