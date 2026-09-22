# Kutlerri site

The Kutlerri.ai marketing pages, as a TypeScript project built with Vite.

```
npm install
npm run dev        # dev server with hot reload
npm run build      # typecheck, then build to build/
npm run typecheck  # tsc --noEmit on its own
npm run preview    # serve the built output

npm run fonts        # re-download the brand faces into public/fonts/
npm run shots        # screenshot each page (needs the dev server running)
npm run measure:hero # print where the hero entrance puts things, frame by frame
npm run shots:inbound # grab frames of the inbound diagram at chosen times
npm run check:inbound # watch the diagram play and report what it shows
```

The three script commands drive a real browser through the dev server, so
start `npm run dev` on port 5199 before running them.

## Layout

```
index.html              the three page shells; each loads one entry module
inbound.html
variants.html

src/
  pages/<page>/main.ts  entry: imports the stylesheets, then starts each feature
  lib/                  one module per feature, each exporting init()
  styles/               the stylesheets, split by what shares them

public/
  assets/               the films and their poster frames
  fonts/                the two variable faces, as .woff2
  images/               the logos and the app icon

scripts/                font fetching and the browser checks above
legacy/                 the original flat site, kept byte for byte
build/                  build output (gitignored)
```

## The modules

Every feature is a module exporting `init()`, which does nothing if the page
does not contain the markup it drives. A page entry calls them in the order
the original inline scripts ran.

| Module | What it drives | Used by |
| --- | --- | --- |
| `lib/motion-engine.ts` | the loop engine every scene is a pure function of | index, inbound |
| `lib/inbound-diagram.ts` | section 3, the channels flying out of the phone | index, inbound |
| `lib/hero.ts` | the hero entrance | index |
| `lib/how-it-works-scroll.ts` | the pinned "How it works" scroll story (design A) | index, variants |
| `lib/how-it-works-variants.ts` | designs B (deck) and C (player) | variants |
| `lib/proof-story.ts` | the RASA customer story dissolve | index |
| `lib/stop-motion-band.ts` | the stop-motion band before the footer | index, variants |
| `lib/outbound-film.ts` | the Outbound film and its play button | index, variants |

## The hero entrance

The copy does not ease into place, it is knocked there. The phone swings in
from the right, reaches the centred copy while still moving, and shoves it
into its column; the copy overshoots and rings back, and the phone, being the
heavier body, barely rebounds.

`spring.ts` solves the damped-spring equation in closed form, so the curve can
be sampled at any time and handed to the Web Animations API as keyframes. That
keeps the entrance seekable, which is what the review board's scrubber and
`npm run measure:hero` both rely on.

| | overshoot | settles |
| --- | --- | --- |
| the copy, struck | 10.5% of its travel | 774 ms |
| the phone, swinging in | 4.7% | 765 ms |

Both are tuned in `SPRING` in `hero.ts`. `npm run measure:hero` steps the
timeline and prints where each element actually is, which is how those numbers
were checked. Under `prefers-reduced-motion` none of it runs: the hero settles
straight into its final composition.

## The inbound diagram

The phone is the hub, so nothing is wired to it — everything comes out of it.
One agent card at a time is thrown from the phone's screen to the reading
position on the left, works its conversation through, closes down onto its
summary, and is drawn back in. The order it captured appears in Today the
moment it lands.

The flight out is the same closed-form spring as the hero, so the card leaves
with velocity and settles with a small overshoot; the flight back accelerates
away instead, because it is being taken rather than thrown. The card sits
behind the phone in the stacking order, so it emerges from it and disappears
into it. Nothing in the geometry is hard-coded: the flight is measured between
the card's slot and the middle of the phone's screen, which is why the card
flies sideways on a wide screen and straight up when the layout stacks.

The card is only ever as tall as the conversation it is holding. It opens just
far enough for the first message and grows a little ahead of each one after it,
reaching full height only once the transcript has filled and started to scroll,
so there is never an empty rectangle waiting to be filled:

| messages | 1 | 2 | 3 | 4 | 5 | 6 | captured |
| --- | --- | --- | --- | --- | --- | --- | --- |
| card height | 149 | 192 | 242 | 313 | 355 | 389 | 91 |

Each channel gets a 320 ms beat of an empty stage before the next is thrown,
which is punctuation between the three rather than a pause in one.

`SCRIPT` in `inbound-diagram.ts` holds each channel's rhythm, counted from the
moment it lands, and the loop is assembled from those. `npm run check:inbound`
watches it play with no seeking and prints which channel is out, how tall its
card is and how many messages are up. To watch a particular moment:

```
MARKS='[["landing",980],["talking",5200]]' npm run shots:inbound
```


`motion-engine.ts` still publishes `window.KMotion`, and the diagram still
publishes `window.KInbound`, because the scrubber, the preview board and the
MP4 render reach them that way. Within the project they are plain imports.

## The stylesheets

The three pages carried near-identical copies of one stylesheet. They are
split by what actually shares them, and each page imports its own set in the
original cascade order:

| Stylesheet | Used by |
| --- | --- |
| `shell.css` | all — the document reset the old `*-preview.html` wrappers supplied |
| `fonts.css` | all — the `@font-face` rules, generated by `npm run fonts` |
| `nav-hero.css` | all — navigation, hero and phone, and the design tokens |
| `home.css` | all — footer, how-it-works, outbound, managed service, responsive |
| `proof-rasa.css` | index — the RASA customer story |
| `proof-story.css` | inbound, variants — the older proof block |
| `inbound-diagram.css` | index, inbound |
| `variants-board.css` | variants |
| `inbound-page.css` | inbound — the one rule that puts it on white |

## Typography

Two self-hosted variable fonts: **Fraunces** for display and **Inter** for
text and UI. Nothing references them by name except three tokens at the top of
`nav-hero.css` and one in `inbound-diagram.css`, so changing the typeface
means editing those and re-running `npm run fonts`:

| Token | Used for |
| --- | --- |
| `--f-display` | headlines and the hero |
| `--f-text` | body copy, navigation, buttons |
| `--f-ui` | the app screen inside the phone mockups |
| `--sf` | left as the OS system stack on purpose, so the Today screen reads as a real iOS app |

Two places also name the families outside CSS: `fontsReady()` in `hero.ts` and
in `motion-engine.ts` list the faces to wait for before measuring. They have to
match, or the hero will measure its layout in the fallback font and place the
copy wrongly.

The headline puts one phrase in purple with `.hero__accent`, which is what the
palette comment in `nav-hero.css` means by rationing the accent to "one
headline phrase".

## Where this came from

The original was a flat folder of six HTML files, each a *fragment* with no
`<html>`, `<head>` or `<body>`, carrying roughly 1,500 lines of inline CSS
(including about 200 KB of base64-encoded fonts) and up to four inline
`<script>` blocks. The three `*-preview.html` files were those same fragments
wrapped in a small shell so they could be opened in a browser on their own.

Because the pages are now real documents, that wrapper is part of the page and
the separate preview copies are gone: `index.html` is what `preview.html` used
to show.

`legacy/` holds that original, byte for byte. Nothing reads from it any more:
the page shells, the stylesheets and the modules are all source now and have
since moved on from it, so the scripts that once regenerated them have been
removed rather than left lying around to overwrite hand edits. It is kept only
as a reference and can be deleted.
