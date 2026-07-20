// Cheap smoke test (no screenshots): console errors + key interactions.
// node smoke.cjs <kimi-file> <grid|people>
const { chromium } = require('playwright');
const path = require('path');
const target = process.argv[2];
const mode = process.argv[3];
const fileUrl = 'file:///' + path.resolve(__dirname, '../../spec-interview/spaces-visualization-redesign/prototypes', target).replace(/\\/g, '/');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(fileUrl);
  await page.waitForTimeout(1300);
  const r = { file: target, errors };
  r.online = await page.textContent('#online-count');
  if (mode === 'grid') {
    r.cards = await page.locator('.card').count();
    r.railBtns = await page.locator('.rail-btn').count();
    await page.click('[data-rail="commons"]'); await page.waitForTimeout(500);
    r.spyActive = await page.evaluate(() => document.querySelector('.rail-btn.on')?.dataset.rail);
    r.stickyTop = await page.evaluate(() => getComputedStyle(document.querySelector('.hood-head')).position);
  } else {
    r.pRows = await page.locator('.p-row').count();
    r.miniCards = await page.locator('.mini-card').count();
    await page.click('.p-row[data-uid="sofia"]'); await page.waitForTimeout(400);
    r.popVisible = await page.isVisible('#pop');
    await page.keyboard.press('Escape');
  }
  // shared: theme, density, signal, incoming knock approve, stale, townhall, search
  await page.click('#theme-btn'); await page.click('#dens-compact'); await page.waitForTimeout(250);
  await page.click('#dens-comfy'); await page.click('#theme-btn'); await page.waitForTimeout(250);
  await page.click('#dock-tab'); await page.waitForTimeout(250);
  await page.click('#dk-knock'); await page.waitForTimeout(400);
  r.knockBanner = await page.isVisible('.knock-banner');
  await page.click('.knock-banner [data-k="ok"]'); await page.waitForTimeout(400);
  r.youSpace = await page.textContent('#you-space');
  await page.click('#dk-stale'); await page.waitForTimeout(250);
  r.staleOn = await page.evaluate(() => document.body.classList.contains('stale'));
  await page.click('#dk-stale'); await page.waitForTimeout(250);
  await page.click('#dk-townhall'); await page.waitForTimeout(400);
  r.hallCap = await page.evaluate(() => document.querySelector('[data-space="hall"] .cap')?.textContent);
  await page.click('#dk-townhall'); await page.waitForTimeout(300);
  await page.fill('#search', 'sofia'); await page.waitForTimeout(350);
  r.searchPeople = await page.locator('#sr [data-person]').count();
  await page.fill('#search', ''); await page.waitForTimeout(250);
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
