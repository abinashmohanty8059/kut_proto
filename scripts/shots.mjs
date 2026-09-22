import { chromium } from 'playwright-core';
import fs from 'node:fs';
fs.mkdirSync('.staging/shots', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
for (const [name, w, h] of [['index', 1440, 900], ['inbound', 1440, 900], ['variants', 1440, 900], ['index-mobile', 430, 860]]) {
  const file = name.replace('-mobile', '');
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://localhost:5199/${file}.html`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  // Anything spilling out of the page sideways is a wrapping casualty.
  const overflow = await page.evaluate(() => {
    const bad = [];
    const w = document.documentElement.clientWidth;
    document.querySelectorAll('.site *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > w + 2 || r.left < -2) && getComputedStyle(el).position !== 'fixed') {
        bad.push((el.className.baseVal ?? el.className ?? el.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
      }
    });
    return [...new Set(bad)].slice(0, 6);
  });
  await page.screenshot({ path: `.staging/shots/page-${name}.png` });
  console.log(`${name.padEnd(14)} errors ${errs.length}  overflowing ${overflow.length}`);
  overflow.forEach((o) => console.log('    ', o.slice(0, 90)));
  errs.slice(0, 2).forEach((e) => console.log('    err:', e.slice(0, 110)));
  await page.close();
}
await browser.close();
