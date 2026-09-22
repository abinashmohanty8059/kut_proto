/* The home page: hero entrance, the "How it works" scroll story, the two
   films, the living inbound diagram and the RASA customer story.
   The stylesheets are imported in the order the original page declared them,
   so the cascade is unchanged. */

import '../../styles/shell.css';
import '../../styles/fonts.css';
import '../../styles/nav-hero.css';
import '../../styles/home.css';
import '../../styles/proof-rasa.css';
import '../../styles/proof-encore.css';
import '../../styles/inbound-diagram.css';

// The engine publishes window.KMotion, which the diagram and the review
// board both read, so it is imported before anything that uses it.
import '../../lib/motion-engine';

import * as hero from '../../lib/hero';
import * as howItWorks from '../../lib/how-it-works-scroll';
import * as stopMotion from '../../lib/stop-motion-band';
import * as outboundFilm from '../../lib/outbound-film';
import * as inboundDiagram from '../../lib/inbound-diagram';
import * as proofStory from '../../lib/proof-story';
import * as proofEncore from '../../lib/proof-encore';

hero.init();
howItWorks.init();
stopMotion.init();
outboundFilm.init();
inboundDiagram.init();
proofStory.init();
proofEncore.init();
