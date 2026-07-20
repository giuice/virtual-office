// Screenshot verification for kimi-*.html prototypes (run from repo root)
// node temp/proto-shots/shoot.cjs <file> <prefix>
const { chromium } = require('playwright');
const path = require('path');

const target = process.argv[2] || 'kimi-hybrid.html';
const prefix = process.argv[3] || 'hybrid';
const fileUrl = 'file:///' + path.resolve(__dirname, '../../spec-interview/spaces-visualization-redesign/prototypes', target).replace(/\\/g, '/');
const out = (n) => path.resolve(__dirname, `${prefix}-${n}.png`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 600 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(fileUrl);
  await page.waitForTimeout(1400); // skeleton -> real render
  await page.screenshot({ path: out('01-overview-dark') });

  // zoom into Engineering
  await page.click('[data-zoom="eng"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('02-zoom-eng') });

  // back to overview
  await page.click('[data-overview]');
  await page.waitForTimeout(300);

  // incoming knock banner
  await page.click('#dock-tab');
  await page.waitForTimeout(300);
  await page.click('#dk-knock');
  await page.waitForTimeout(500);
  await page.screenshot({ path: out('03-knock-banner') });
  // approve the knock (buttons must be clickable — AC-005)
  await page.click('.knock-banner [data-k="ok"]');
  await page.waitForTimeout(500);
  await page.click('#dock-tab'); // close demo dock
  await page.waitForTimeout(300);

  // light theme
  await page.click('#theme-btn');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('04-light') });

  // compact density
  await page.click('#dens-compact');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('05-light-compact') });
  await page.click('#dens-comfy');
  await page.click('#theme-btn'); // back to dark
  await page.waitForTimeout(300);

  // detail panel
  await page.click('[data-space="deep"] .c-name');
  await page.waitForTimeout(450);
  await page.screenshot({ path: out('06-detail') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // avatar popover (click-stop: must NOT open detail)
  await page.click('[data-space="lounge"] .av[data-uid="nia"]');
  await page.waitForTimeout(350);
  const popVisible = await page.isVisible('#pop');
  const detailOpen = await page.evaluate(() => document.querySelector('#detail-wrap').classList.contains('open'));
  await page.screenshot({ path: out('07-popover') });
  await page.keyboard.press('Escape');

  // search
  await page.fill('#search', 'sofia');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('08-search') });
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // stale
  await page.click('#dock-tab'); // reopen dock
  await page.waitForTimeout(300);
  await page.click('#dk-stale');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('09-stale') });
  await page.click('#dk-stale');

  // town hall overflow
  await page.click('#dk-townhall');
  await page.waitForTimeout(500);
  await page.screenshot({ path: out('10-townhall') });
  // open hall detail to show roster overflow
  await page.click('[data-space="hall"] .c-name');
  await page.waitForTimeout(450);
  await page.screenshot({ path: out('11-townhall-detail') });

  // you-chip locate
  await page.keyboard.press('Escape');
  await page.click('#dock-tab'); // close dock so it can't intercept
  await page.waitForTimeout(300);
  await page.click('#you-chip');
  await page.waitForTimeout(700);
  await page.screenshot({ path: out('12-locate-you') });

  console.log(JSON.stringify({
    errors,
    popVisible, detailOpenAfterAvatarClick: detailOpen,
    cards: await page.locator('.card').count(),
    online: await page.textContent('#online-count'),
  }, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
