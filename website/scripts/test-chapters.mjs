import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto("http://localhost:3001/features", { waitUntil: "networkidle2" });

// Switch to light mode
await page.evaluate(() => {
  document.documentElement.setAttribute("data-theme", "light");
  window.dispatchEvent(new CustomEvent("persona-theme-change", { detail: "light" }));
});
await new Promise((r) => setTimeout(r, 600));

// Snap each chapter section visual
const sections = ["avatar", "try-on", "live", "stylist", "sizing", "cart"];
for (const id of sections) {
  const el = await page.$(`#${id}`);
  if (el) {
    await el.scrollIntoView();
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `.shots/theme/chapter-${id}-light.png` });
  }
}

await browser.close();
console.log("CHAPTERS_LIGHT_DONE");
