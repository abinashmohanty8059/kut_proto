import { chromium } from 'playwright-core';
import fs from 'node:fs';
fs.mkdirSync('.staging/ib', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('requestfailed', (r) => errs.push('requestfailed ' + r.url()));
page.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
await page.goto('http://localhost:5199/inbound.html', { waitUntil: 'load' });
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const K = window.KInbound;
  K.pause();
  return { LOOP: K.LOOP, RESET: K.RESET, B: K.B, INV: K.INV.map((i) => i.at) };
});
console.log('LOOP', info.LOOP, 'RESET', info.RESET);
console.log('channels out at:', info.B.map((b) => b.out).join(', '));
console.log('requests land at:', info.INV.join(', '));

const marks = JSON.parse(process.env.MARKS || '[]');
for (const [label, ms] of marks) {
  await page.evaluate((t) => window.KInbound.seek(t), ms);
  await page.waitForTimeout(140);
  const el = await page.$('.ib__stage');
  await el.screenshot({ path: `.staging/ib/${label}.png` });
}
console.log('errors', errs.length);
errs.slice(0, 3).forEach((e) => console.log('  ', e.slice(0, 120)));
await browser.close();
