import { chromium } from "playwright";

const prototypes = [
  ["hybrid", "sol-hybrid-atlas/index.html"],
  ["grid", "sol-refined-grid/index.html"],
  ["people", "sol-people-first/index.html"]
];
const screenshotRoot = "C:/Users/giuic/.codex/visualizations/2026/07/21/019f821a-ecb6-7a83-bd6c-2d41ee9c2ca8";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
});
const results = [];

for (const [name, path] of prototypes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 600 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:4173/${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".self-chip");

  const initial = await page.evaluate(() => ({
    title: document.title,
    selfVisible: Boolean(document.querySelector(".self-chip")?.getBoundingClientRect().height),
    horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    people: window.SOL_DATA.people.length,
    spaces: window.SOL_DATA.spaces.length,
    neighborhoods: window.SOL_DATA.neighborhoods.length
  }));

  await page.locator(".theme-toggle").click();
  const lightTheme = await page.evaluate(() => document.documentElement.dataset.theme === "light");
  await page.getByRole("button", { name: "Compact" }).click();
  const compact = await page.evaluate(() => document.documentElement.dataset.density === "compact");

  await page.locator(".demo-knock").click();
  await page.waitForTimeout(80);
  if (!await page.locator(".approve").count()) {
    throw new Error(`${name}: incoming knock did not render; theme=${lightTheme}; compact=${compact}; console=${errors.join(" | ")}`);
  }
  const knock = await page.evaluate(() => {
    const card = document.querySelector(".knock-card");
    const approve = document.querySelector(".approve");
    const deny = document.querySelector(".deny");
    const a = approve?.getBoundingClientRect();
    const d = deny?.getBoundingClientRect();
    return {
      visible: Boolean(card && a && d && a.width >= 100 && d.width >= 100),
      inViewport: Boolean(a && d && a.right <= innerWidth && d.left >= 0 && a.bottom <= innerHeight),
      clickable: approve ? getComputedStyle(approve).pointerEvents !== "none" : false
    };
  });
  await page.locator(".approve").click();
  await page.waitForSelector(".knock-card", { state: "detached" });

  await page.locator(".scenario-select").selectOption("stale");
  const staleVisible = await page.locator(".stale-bar").isVisible();
  await page.locator(".scenario-select").selectOption("live");
  await page.locator(".search-input").fill("Maya");
  const searchHasResult = await page.locator("text=Maya").count() > 0 || await page.locator("text=North Star").count() > 0;
  await page.locator(".search-input").fill("");

  const openTarget = page.locator(".space-card, .rail-room").first();
  await openTarget.click({ position: { x: 12, y: 12 } });
  const drawerVisible = await page.locator(".detail-drawer").isVisible();
  await page.locator(".drawer-close").click();
  await page.locator(".self-chip").click();
  const selfFocus = await page.evaluate(() => Boolean(document.activeElement?.matches(".is-you, .is-self, [data-space-open]")));

  await page.locator(".theme-toggle").click();
  await page.getByRole("button", { name: "Roomy" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${screenshotRoot}/sol-${name}-1280x600.png`, fullPage: false });
  await page.setViewportSize({ width: 768, height: 800 });
  const tablet = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    selfVisible: Boolean(document.querySelector(".self-chip")?.getBoundingClientRect().height),
    headerVisible: Boolean(document.querySelector(".nowboard")?.getBoundingClientRect().height)
  }));
  results.push({ name, ...initial, lightTheme, compact, knock, staleVisible, searchHasResult, drawerVisible, selfFocus, tablet, errors });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
