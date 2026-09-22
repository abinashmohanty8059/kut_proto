import { chromium } from 'playwright-core';

/* Steps the hero entrance through its timeline with the same seek() the
   review board's scrubber uses, and reports where the phone and the copy
   actually are. The bump should show up as: the phone arrives first, the
   copy leaves after it, overshoots its column, and rings back. */

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5199/index.html', { waitUntil: 'load' });
await page.waitForTimeout(2800);

const data = await page.evaluate(() => {
  const K = window.KHero;
  const hero = new K.Hero(document.querySelector('.site'));
  const x = (el) => (el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m41 : null);
  const rows = [];
  for (let t = K.T.reveal - 40; t <= K.T.end + 80; t += 30) {
    hero.seek(t);
    rows.push({
      t,
      phone: x(document.querySelector('.hero__phone')),
      title: x(document.querySelector('.hero__copy:not(.is-intro) .hero__title')),
      lede: x(document.querySelector('.hero__copy:not(.is-intro) .hero__lede')),
    });
  }
  hero.settle();
  return { rows, T: K.T, spring: K.SPRING };
});

console.log('timeline:', JSON.stringify(data.T));
console.log('\n    t    phoneX    titleX     ledeX');
for (const r of data.rows) {
  const f = (v) => (v === null ? '     -' : v.toFixed(1).padStart(9));
  console.log(String(r.t).padStart(5), f(r.phone), f(r.title), f(r.lede));
}
const col = (k) => data.rows.map((r) => r[k]).filter((v) => v !== null);
for (const k of ['phone', 'title', 'lede']) {
  const v = col(k);
  const start = v[0], min = Math.min(...v), end = v.at(-1);
  const travel = Math.abs(start - end) || 1;
  console.log(`${k.padEnd(6)} start ${start.toFixed(1).padStart(7)}  furthest ${min.toFixed(1).padStart(7)}  rest ${end.toFixed(1).padStart(6)}  overshoot ${(((start - min) / travel - 1) * 100).toFixed(1)}%`);
}
await browser.close();
