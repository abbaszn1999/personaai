import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

const url = process.argv[2] ?? "http://localhost:3001";
const out = ".shots";
await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.log(`[${name}] pageerror`, error.message));
  page.on("console", (msg) => msg.type() === "error" && console.log(`[${name}] console`, msg.text()));
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2500));
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const room = process.argv.includes("--room");
  const stops = room
    ? [0.2, 0.37, 0.64, 0.92].map((p) => (viewport.height * 4.6 * (0.14 + 0.82 * (p * 3) / 3)) / (height - viewport.height))
    : [0, 0.09, 0.2, 0.3, 0.42, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const section = process.argv.find((a) => a.startsWith("--section="))?.slice(10);
  if (section) {
    const box = await page.evaluate((id) => {
      const section = document.getElementById(id);
      const el = section.parentElement.classList.contains("pin-spacer") ? section.parentElement : section;
      return { top: el.offsetTop, h: el.offsetHeight };
    }, section);
    for (const [i, f] of [0.05, 0.25, 0.45, 0.62, 0.85].entries()) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(box.top + (box.h - viewport.height) * f));
      await new Promise((r) => setTimeout(r, 2200));
      await page.screenshot({ path: `${out}/${name}-${section}-${i}.png` });
    }
    await page.close();
    continue;
  }
  for (const [i, stop] of stops.entries()) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round((height - viewport.height) * stop));
    await new Promise((r) => setTimeout(r, 1800));
    await page.screenshot({ path: `${out}/${name}-${String(i).padStart(2, "0")}.png` });
  }
  const mid = Math.round(viewport.height * 4.6 * (0.14 + 0.82 * (1.5 / 3)));
  await page.evaluate((y) => window.scrollTo(0, y), mid);
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: `${out}/${name}-scan.png` });
  await page.close();
}

await browser.close();
