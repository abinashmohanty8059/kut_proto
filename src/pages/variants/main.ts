/* The review board: "How it works" in three designs side by side.
   A is the pinned list the home page ships; B and C are the alternatives. */

import '../../styles/shell.css';
import '../../styles/fonts.css';
import '../../styles/nav-hero.css';
import '../../styles/home.css';
import '../../styles/proof-story.css';
import '../../styles/variants-board.css';

import * as howItWorks from '../../lib/how-it-works-scroll';
import * as stopMotion from '../../lib/stop-motion-band';
import * as outboundFilm from '../../lib/outbound-film';
import * as variants from '../../lib/how-it-works-variants';

howItWorks.init();
stopMotion.init();
outboundFilm.init();
variants.init();
