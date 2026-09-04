/**
 * Placeholder content for the home view.
 *
 * Components take their content through props — this is the only place the
 * strings and asset paths live until real copy arrives.
 */

export interface HomeHeroContent {
  /** Page `<h1>` — one string; the design's 535px measure is what breaks it. */
  headline: string;
  /** The two lines under the scene. */
  intro: string;
  /**
   * The two calls to action under the intro.
   *
   * `href` is **optional, and absent until the route it names exists**. There is
   * one route on this site (`/`), and a call to action pointing at a page nobody
   * has built is a 404 with a button on it — so the label renders as a label
   * (see [[components/common|`<HeroCopy>`]]) and becomes a link the moment a
   * destination is written here.
   */
  primaryCta: { label: string; href?: string; opens?: "pons-pack" };
  secondaryCta: { label: string; href?: string; opens?: "pons-pack" };
  /** The nav pill's strings; `contactHref` follows the same rule as the CTAs. */
  nav: {
    label: string;
    home: string;
    homeHref?: string;
    menu: string;
    contact: string;
    contactHref?: string;
    /**
     * What the *Menu* button drops open.
     *
     * `to` is a **share of the page's scroll**, not an anchor: the whole route
     * is one tall scroll section driving a 3D scene, so the acts have no
     * elements to jump to — 0.22 is the pack carousel, 0.66 the panel that
     * explains the drop. `href` is for anywhere off the page. An item with
     * neither renders as plain text, the way *Contact* does while its route
     * does not exist.
     */
    menuItems: Array<{
      label: string;
      href?: string;
      to?: number;
      /** Dimmed, with a *Soon* tag. Still a link if it has somewhere to go. */
      soon?: boolean;
      /**
       * A line explaining the row, shown on hover and to a screen reader.
       *
       * For rows whose label alone does not say what the thing is - a word like
       * *Launchpad* means something different on every site it appears on.
       */
      hint?: string;
    }>;
  };
  /** Top-right of the frame — the tally light. */
  recordingLabel: string;
  /** Accessible name for the scene section. */
  sceneLabel: string;
  /** Accessible name for the curtain over the first paint. */
  loadingLabel: string;
  /** GLB served from `public/assets/hero/`. */
  modelUrl: string;
  /**
   * Videos for the television screens. Each file replaces the model texture of
   * the same name — `cat.mp4` takes over the screen textured `cat` — so which
   * television plays what is decided in the model, not here. A screen whose
   * texture has no matching file keeps its still image.
   */
  screenVideos: string[];
  /**
   * Clip for one specific screen, keyed by the number in its `screen N` name.
   * Beats the texture-name match — the way to give one screen its own clip when
   * it shares a texture with others that should keep theirs.
   */
  screenVideoOverrides: Record<string, string>;
  /**
   * How hard each screen glows, as a share of the wall's setting, keyed by
   * screen number. Absent means full strength.
   *
   * A screen's light is its own picture, so a clip on a **white background**
   * feeds the bloom far harder than the dark footage the wall was tuned on, and
   * burns out into a slab that washes the sets around it. Those clips are turned
   * down here rather than dimming the whole wall, which would leave the dark
   * ones looking switched off.
   */
  screenGlowScale: Record<string, number>;
  /**
   * The two lines the camera flies through between the wall and the carousel.
   *
   * They are geometry, not DOM — see [[scene-3d]] — so each carries its own
   * placement: where it stands in the room, how tall its letters are, and the
   * distances over which it fades up out of the fog and out again as the lens
   * goes past.
   */
  flightSigns: SceneSignContent[];
  /**
   * What the chip on the cursor says over each television.
   *
   * Keyed by the **texture on that screen** — the same key the videos are
   * matched on, so which set carries which case is decided in the model. The
   * fallback is for the noise sets and the stills: nothing is on them yet.
   */
  captionLabels: {
    byTexture: Record<string, string>;
    fallback: string;
    /** The word after the chip's divider. */
    action: string;
  };
  /** The carousel section: its heading, its controls, and the works themselves. */
  cases: HomeCasesContent;
  /** The first black panel — the people, on a card ring. */
  team: HomeTeamContent;
  /** The second black panel — what the studio is. */
  about: HomeAboutContent;
  /**
   * The last shot: the picture on that television's glass, and the line the
   * chip shows when the pointer finds it.
   */
  finalShot: { image: string; label: string };
  /** The words over the closing shot. */
  closing: HomeClosingContent;
}

export type HomeAboutIcon = "circle" | "triangle" | "square";

export interface HomeAboutContent {
  heading: string;
  /**
   * The lead paragraph, in clauses. Alternate ones are set at half strength —
   * the design's way of giving a single sentence a rhythm.
   */
  lead: Array<{ text: string; dim?: boolean }>;
  cards: Array<{ icon: HomeAboutIcon; body: string }>;
}

export interface HomeTeamMember {
  /** Printed under the carousel when the card is at the front. */
  name: string;
  /** Three of them, drawn `( like this )`. */
  tags: string[];
  /** Portrait for the card. Placeholders until the real photographs arrive. */
  image: string;
}

export interface HomeClosingContent {
  /** The `h2` over the last shot. */
  heading: string;
  /** One line under it. */
  lead: string;
}

export interface HomeTeamContent {
  heading: string;
  /** Accessible name for the carousel. */
  label: string;
  /** What the chip on the cursor says over the ring. */
  hint: string;
  members: HomeTeamMember[];
}

export interface SceneSignContent {
  text: string;
  /** World position of the line's centre. */
  position: [number, number, number];
  /** Cap height in world units — the near line is the big one. */
  size: number;
  /** `[appear, full]` in units ahead of the lens — what staggers the two. */
  fadeIn?: [number, number];
}

export interface HomeCase {
  name: string;
  /** Three of them in the design, drawn `( like this )`. */
  tags: string[];
  /**
   * Shown on the ring but not for sale yet.
   *
   * The call to action goes grey and stops being a control — there is no tier
   * behind this one in `lib/packs/pool.ts`, so a live button would open a
   * theatre for a pack that does not exist.
   */
  soon?: boolean;
  /** Case-study route, once one exists — see `primaryCta` above. */
  href?: string;
}

export interface HomeCasesContent {
  /** Accessible name for the section's controls. */
  label: string;
  heading: string;
  previous: string;
  next: string;
  explore: string;
  /**
   * The works, **in the ring's order** — `scroll.carousel.members` in
   * `lib/scene/config.ts`. The scene reports which one it has turned to the
   * front by index, so the two lists have to line up.
   */
  items: HomeCase[];
}

export const homeHero: HomeHeroContent = {
  headline: "The Home For Robinhood Memes.",
  intro:
    "Buy a pack in ETH, tear it open, and keep what drops - or sell it back on the spot. Unbox Fortune.",
  // *Buy Pack* opens the Pons Pack sheet on the spot. It used to scroll to the
  // ring, on the reasoning that which pack is the choice — but the ring is the
  // *tier* list, and the sheet is the one pack that prices itself off whatever
  // the visitor puts in. A first screen that answers its own button beats one
  // that sends you eight screens down to find the answer. The ring is still
  // there, and still opens the tier theatre.
  primaryCta: { label: "Buy Pack", opens: "pons-pack" },
  secondaryCta: { label: "View Inventory", href: "/inventory" },
  nav: {
    label: "Primary",
    home: "$SHELLR",
    /** The token's listing on Pons - somebody else's site, so a new tab. */
    homeHref:
      "https://ponsfamily.com/launchpad/0x77a719b0f3e7072fc80ed5d67f9aaa580b245462",
    menu: "Menu",
    contact: "Twitter",
    contactHref: "https://x.com/shellr_co",
    menuItems: [
      { label: "Inventory", href: "/inventory" },
      { label: "Packs", to: 0.22 },
      {
        label: "Community Packs",
        href: "/compacks",
        hint: "Build a pack out of your own memes and take a cut of every one that sells.",
      },
      // Not built, and with the documentation pulled they have nowhere to
      // point either - so they are rows with a hint and no destination. The
      // hint is doing the work a linked page used to.
      {
        label: "Launchpad",
        href: "/launchpad",
        soon: true,
        hint: "Launch a coin on Pons, pair it to a pack, and let the volume pay your holders.",
      },
      {
        label: "Stock Packs",
        href: "/stocks",
        hint: "The same sealed pack, dropping tokenized shares instead of memes.",
      },
      {
        label: "Pack Battles",
        href: "/battles",
        soon: true,
        hint: "Pick a pack, or several, and open them against another player. The biggest total across all rounds takes both sides' pulls.",
      },
      {
        label: "Staking",
        href: "/staking",
        hint: "Stake $SHELLR and earn WETH from what the token makes.",
      },
    ],
  },
  recordingLabel: "LIVE",
  sceneLabel:
    "Shellr's vault: a wall of televisions playing the memcoins in the packs",
  loadingLabel: "Opening the vault",
  modelUrl: "/assets/hero/TV.glb",
  // Nothing is matched by texture name any more: three screens share the `cat`
  // texture and two share `magic`, so a name match always put the same picture
  // on more than one of them. Every picture is placed by **screen number**
  // instead — see `screenVideoOverrides`.
  screenVideos: [],
  /**
   * Turned down where the picture is mostly white: 13 is the cash cat on paper
   * white, 5 the glass P on the same, 3 a bright sky and 10 a pale gradient. The
   * rest keep the wall's full strength — measured against the bloom, not picked
   * by eye off the source images.
   */
  screenGlowScale: {
    "3": 0.5,
    "5": 0.34,
    "9": 0.7,
    "10": 0.62,
    "13": 0.34,
  },
  /**
   * One picture per screen, keyed by the number in the model's `screen N`.
   *
   * Eight pictures on eight sets, no picture twice. The five sets that shipped
   * wearing a stock photograph (4, 6, 10, 11, 14) all had to be covered or the
   * old still shows through; the other three are spread across the wall so the
   * left and right stacks each carry four.
   *
   * Two sets are **not** listed here and keep the texture the model shipped
   * with: 9 stays on static and 12 stays on colour bars. Leaving those two is
   * deliberate — a wall with no dead sets on it stops reading as a wall of
   * televisions.
   *
   * **Each clip is pre-corrected for the set it lands on.** The screen meshes do
   * not all map their texture the same way, so there is no single flip that
   * fits the wall. Measured off the geometry (decode the Draco UVs, fit U and V
   * to world space, compare against world up and the screen normal):
   *
   * | screens              | what the mesh does   | encode with   |
   * | -------------------- | -------------------- | ------------- |
   * | 1, 2, 6, 11, 12, 13  | nothing              | *(no filter)* |
   * | 4, 5, 8, 10, 14      | mirrors horizontally | `hflip`       |
   * | 3, 9                 | turns 180 and mirrors| `vflip`       |
   * | 7                    | turns 90             | `transpose=2` |
   *
   * The correction is baked into the `.mp4` by the encode, not applied at
   * runtime, so **moving a clip to a set in another row of that table lands it
   * sideways or upside down.** Re-encode it with the new row's filter. Screen 7
   * additionally wants a *portrait* source (1080x1440): the turn is what makes
   * it read landscape on the glass, and a landscape source arrives squashed.
   */
  screenVideoOverrides: {
    // Left stack.
    "1": "/assets/hero/custom/pyramid-v13.mp4",
    "2": "/assets/hero/custom/robot-v14.mp4",
    "3": "/assets/hero/custom/hmmwall-v36.mp4",
    "4": "/assets/hero/custom/logoh-v13.mp4",
    "5": "/assets/hero/custom/logop-v14.mp4",
    "6": "/assets/hero/custom/smiley-v13.mp4",
    "7": "/assets/hero/custom/shiba-v13.mp4",
    // Right stack. 12 keeps its colour bars — one dead set is what stops the
    // wall reading as a grid of posters.
    "8": "/assets/hero/custom/catgreen-v14.mp4",
    "9": "/assets/hero/custom/logomark-v25.mp4",
    "10": "/assets/hero/custom/checker-v13.mp4",
    "11": "/assets/hero/custom/nugget-v13.mp4",
    "13": "/assets/hero/custom/cashcat-v13.mp4",
    "14": "/assets/hero/custom/logon-v13.mp4",
  },

  // Between the wall and the carousel there is nothing but fog, and the flight
  // through it is long. These two stand in it at different depths — the near one
  // large and just off the lens's axis, the far one small and to the other side
  // — so the camera reads as passing *through* a space rather than crossing an
  // empty one.
  //
  // Both live in the **corridor past the wall**: the lens runs from z 5.6 to
  // −9.4 and the last row of sets is at z ≈ −4.6, so the room for these is what
  // is left. The near line stands far enough back that `signs.clearOf` has
  // already opened by the time its own fade would have brought it up — nothing
  // shows while a television is still in frame.
  //
  // They lift out of the fog **one after the other**, which is what their own
  // `fadeIn` distances are for: the near line is up and already going past by
  // the time the far one starts to show. The flight changes gear for this — see
  // `scroll.flightSplit` — so each of those emergences is a few hundred pixels
  // of scroll rather than a blink.
  flightSigns: [
    {
      text: "One Pack. One Dream.",
      position: [-0.28, 1.6, -7.6],
      size: 0.34,
      fadeIn: [5, 3.2],
    },
    {
      text: "Keep the coin, or take the ETH.",
      position: [0, 1.18, -9.3],
      size: 0.13,
      fadeIn: [3, 1.8],
    },
  ],
  // Keyed by the clip now playing on the glass — the same names the carousel
  // members are picked by in `lib/scene/config.ts`. The five sets the carousel
  // lifts out of the wall carry a pack name; everything else falls back.
  captionLabels: {
    byTexture: {
      "nugget-v13": "Legendary Unbox",
      "checker-v13": "Rare Vault",
      "logon-v13": "Epic Pull",
      "smiley-v13": "Golden Drop",
      "cashcat-v13": "Mystery Box",
      "logoh-v13": "Hidden Memcoin",
      "pyramid-v13": "Hidden Memcoin",
      "shiba-v13": "Hidden Memcoin",
      "robot-v14": "Hidden Memcoin",
      "hmmwall-v36": "Hidden Memcoin",
      "logop-v14": "Hidden Memcoin",
      "catgreen-v14": "Hidden Memcoin",
      "logomark-v25": "Shellr",
    },
    fallback: "Hidden Memcoin",
    action: "Unbox",
  },
  closing: {
    heading: "Your turn",
    lead: "Pick a tier, break the seal, keep what drops.",
  },
  finalShot: {
    // Named apart from every other versioned asset on purpose. As `CTA-TV-vNN`
    // it kept being caught by bulk renames of the deck's `tok*-vNN` files —
    // twice — and the last shot silently went black each time.
    image: "/assets/CTA/closing-shot-v41.png",
    label: "Unbox. Collect. Dominate.",
  },
  cases: {
    label: "Unbox collection",
    heading: "Pull your legends",
    previous: "Previous",
    next: "Next",
    explore: "Unbox",
    /**
     * The packs, cheapest first — the order the ring turns them in, so it has to
     * match `carousel.members` in `lib/scene/config.ts` and the prices in
     * `lib/packs/pool.ts`. All three are edited together; the tier's name is
     * what the theatre looks itself up by.
     */
    items: [
      { name: "Basic Pack", tags: ["0.01 ETH"] },
      { name: "Common Pack", tags: ["0.02 ETH"] },
      { name: "Rare Pack", tags: ["0.05 ETH"] },
      { name: "Starter Pack", tags: ["0.1 ETH"] },
      { name: "Premium Pack", tags: ["0.5 ETH"] },
      { name: "SHELLR Holder Pack", tags: ["Free Everyday"], soon: true },
    ],
  },
  team: {
    heading: "What's in the packs",
    label: "The memcoins",
    hint: "Drag to browse",
    /**
     * The deck, richest first.
     *
     * Card art in `public/assets/team/tok1-v85.webp` … `tok10-v82.webp`; the
     * ticker, market cap and rarity are printed **on the pouch**, and the dock
     * under the ring repeats the name and tags for whichever is at the front.
     * Rarity is assigned off the same figure and is not stored anywhere else.
     *
     * Market caps are all-time highs held as text — nothing refetches them, so
     * they are a snapshot and will drift. **They also have to match the numbers
     * printed on the artwork**, which is the one place a stale edit here shows
     * up as two different answers on the same screen.
     *
     * One tag: the price. It used to carry the coin count beside it, which is
     * a number the pack cannot promise — the draw decides it, and printing a
     * range next to a fixed price reads as a guarantee.
     *
     * The third tag is where the coin launched. It used to say "Robinhood
     * Chain" on all ten, which the chain badge in the corner already says and
     * which told nobody anything — the launchpad is the part that differs from
     * card to card. Not all of them are Pons: the Pons Pack draws from a
     * subset, the deck is the whole shelf.
     */
    members: [
      {
        name: "PONS",
        tags: ["Mythic", "ATH $400M", "Pons"],
        image: "/assets/team/tok1-v85.webp",
      },
      {
        name: "CASHCAT",
        tags: ["Mythic", "ATH $240M", "Noxa.fun"],
        image: "/assets/team/tok2-v85.webp",
      },
      {
        name: "ARTIFICIAL INU",
        tags: ["Legendary", "ATH $114M", "Long.xyz"],
        image: "/assets/team/tok3-v85.webp",
      },
      {
        name: "NETNET",
        tags: ["Legendary", "ATH $110M", "Uniswap v4"],
        image: "/assets/team/tok4-v85.webp",
      },
      {
        name: "THINKING CAT",
        tags: ["Epic", "ATH $39M", "Pons"],
        image: "/assets/team/tok5-v85.webp",
      },
      {
        name: "TENDIES",
        tags: ["Epic", "ATH $34M", "Noxa.fun"],
        image: "/assets/team/tok6-v85.webp",
      },
      {
        name: "MICRODUCK",
        tags: ["Rare", "ATH $23M", "Pons"],
        image: "/assets/team/tok7-v85.webp",
      },
      {
        name: "DELTA",
        tags: ["Rare", "ATH $20M", "Pons"],
        image: "/assets/team/tok8-v85.webp",
      },
      {
        name: "THE JUGGERNAUT",
        tags: ["Common", "ATH $14M", "Noxa.fun"],
        image: "/assets/team/tok9-v85.webp",
      },
      {
        name: "HOOKR.FUN",
        tags: ["Common", "ATH $9M", "pools.trade"],
        image: "/assets/team/tok10-v85.webp",
      },
    ],
  },
  about: {
    heading: "How to Unbox",
    lead: [
      { text: "Connect wallet. ", dim: true },
      { text: "Buy a pack in ETH or USDG. " },
      { text: "Tear it open. ", dim: true },
      { text: "Claim your memcoins. The pull decides your fate." },
    ],
    cards: [
      {
        icon: "circle",
        body: "The Pack Drop. Pay in ETH, tear the pack open, and whatever it drew lands in your wallet. Cheaper packs play the shallow end; the dearest one is the only place PONS and CASHCAT turn up at all.",
      },
      {
        icon: "triangle",
        body: "Rarity Tiers. Common → Rare → Epic → Legendary → Mythic. Higher tier = bigger pot. Every pull resets the odds.",
      },
      {
        icon: "square",
        body: "Own Your Loot. Memcoins mint directly to your wallet on-chain. Trade them on any dex. Stake for yield. You own the pull.",
      },
    ],
  },
};
