import fs from 'node:fs';

/* Downloads the brand faces from Google Fonts into public/fonts/ and writes
   src/styles/fonts.css to match. Self-hosted, so the pages make no
   third-party request at runtime.

   Both families ship as variable fonts, so each is stored once and declared
   over a weight range rather than once per weight. */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const FAMILIES = [
  {
    name: 'Fraunces',
    query: 'Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,900',
    range: '100 900',
    note: 'display — an optical-size axis, so it stays sturdy at 88px and readable small',
  },
  {
    name: 'Inter',
    query: 'Inter:wght@300;400;500;600;700;800',
    range: '100 900',
    note: 'text and UI',
  },
];

fs.mkdirSync('public/fonts', { recursive: true });
for (const f of fs.readdirSync('public/fonts')) fs.unlinkSync(`public/fonts/${f}`);

let out =
  '/* Brand faces, self-hosted. Regenerate with `node scripts/fetch-fonts.mjs`.\n' +
  '   Both are variable fonts: one file each, declared over a weight range.\n' +
  '   The families the stylesheets ask for are set in nav-hero.css, so\n' +
  '   changing the typeface means changing them there and here. */\n\n';

for (const fam of FAMILIES) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${fam.query}&display=swap`, {
    headers: { 'user-agent': UA },
  }).then((r) => r.text());

  /* Google emits one @font-face per unicode subset, each preceded by a
     comment naming it. The copy is English with curly quotes and middots,
     which the latin subset covers on its own. */
  const latin = css
    .split('/*')
    .slice(1)
    .map((b) => ({ subset: b.slice(0, b.indexOf('*/')).trim(), body: b.slice(b.indexOf('*/') + 2) }))
    .find((b) => b.subset === 'latin');
  if (!latin) throw new Error(`no latin subset for ${fam.name}`);

  const url = (latin.body.match(/url\((https:[^)]+)\)/) || [])[1];
  const bytes = Buffer.from(
    await fetch(url, { headers: { 'user-agent': UA } }).then((r) => r.arrayBuffer()),
  );
  const file = `${fam.name.toLowerCase()}.woff2`;
  fs.writeFileSync(`public/fonts/${file}`, bytes);

  out +=
    `/* ${fam.name} · ${fam.note} */\n` +
    `@font-face {\n` +
    `  font-family: '${fam.name}';\n` +
    `  font-style: normal;\n` +
    `  font-weight: ${fam.range};\n` +
    `  font-display: swap;\n` +
    `  src: url('/fonts/${file}') format('woff2');\n` +
    `}\n\n`;

  console.log(`public/fonts/${file}  ${(bytes.length / 1024).toFixed(1)} KB`);
}

fs.writeFileSync('src/styles/fonts.css', out);
console.log('Wrote src/styles/fonts.css');
