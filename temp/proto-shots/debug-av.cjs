const { chromium } = require('playwright');
const path = require('path');
const fileUrl = 'file:///' + path.resolve(__dirname, '../../spec-interview/spaces-visualization-redesign/prototypes/kimi-hybrid.html').replace(/\\/g, '/');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fileUrl);
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const u = USERS.find(x => x.id === 'mia');
    const url = photoFor(u);
    const el = document.querySelector('.av[data-uid="mia"]');
    const cs = el ? getComputedStyle(el) : null;
    return {
      urlHead: url.slice(0, 120),
      elExists: !!el,
      bgImage: cs ? cs.backgroundImage.slice(0, 120) : null,
      size: el ? [el.offsetWidth, el.offsetHeight] : null,
      html: el ? el.outerHTML.slice(0, 300) : null,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  // try rendering the data URI alone
  await page.goto(info.urlHead ? await page.evaluate(() => photoFor(USERS.find(x => x.id === 'mia'))) : 'about:blank');
  await page.screenshot({ path: path.resolve(__dirname, 'debug-avatar.png') });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
