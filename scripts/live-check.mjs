import { chromium } from 'playwright-core';

/* Watches the diagram play on its own, with no seeking, and reports which
   channel is on screen and how tall its card is. Proves the loop advances by
   itself and that each card is only as tall as the conversation it holds. */

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5199/inbound.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);

const rows = await page.evaluate(async () => {
  const names = ['call', 'email/sms', 'web chat'];
  const out = [];
  const branches = [...document.querySelectorAll('.ib-branch')];
  const start = performance.now();
  while (performance.now() - start < 17000) {
    const shown = branches
      .map((b, i) => ({ i, b }))
      .filter(({ b }) => getComputedStyle(b).display !== 'none');
    const bubbles = shown.length
      ? [...shown[0].b.querySelectorAll('[data-turn]')].filter(
          (t) => parseFloat(getComputedStyle(t).opacity) > 0.5,
        ).length
      : 0;
    out.push({
      ms: Math.round(performance.now() - start),
      on: shown.map(({ i }) => names[i]).join('+') || '(none)',
      h: shown.length ? Math.round(shown[0].b.querySelector('[data-card]').getBoundingClientRect().height) : 0,
      msgs: bubbles,
    });
    await new Promise((r) => setTimeout(r, 900));
  }
  return out;
});

console.log('   ms  channel     card h  messages');
for (const r of rows) {
  console.log(String(r.ms).padStart(6), r.on.padEnd(12), String(r.h).padStart(5), String(r.msgs).padStart(6));
}
console.log('\nerrors', errs.length);
errs.slice(0, 3).forEach((e) => console.log('  ', e.slice(0, 120)));
await browser.close();
