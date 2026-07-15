import { SiteHeader } from "@/components/common/header/site-header";
import { HeroCopy } from "@/components/common/hero/hero-copy";
import { SceneHud } from "@/components/common/hud/scene-hud";
import { Preloader } from "@/components/common/preloader/preloader";
import { SceneWithPacks } from "@/components/common/packs/scene-with-packs";
import { homeHero } from "@/data/mocks/home";
import { getHomeStructuredData } from "@/utils/seo/structured-data";

/** `[ dd / mm / yy ]` — the frame's bottom-left readout, in the design's spacing. */
const stamp = (date: Date): string => {
  const two = (value: number): string => value.toString().padStart(2, "0");
  return `[ ${two(date.getDate())} / ${two(date.getMonth() + 1)} / ${two(
    date.getFullYear() % 100,
  )} ]`;
};

/**
 * Home view — a Server Component holding the 3D scene and the chrome over it.
 *
 * The scene itself is a client leaf (`LazyTvScene`), so this file stays on the
 * server (hard rule #6). The header and the frame are `fixed`: they belong to
 * the window rather than to the hero, and the brief is that they stay put for
 * the whole scroll. The hero's own words are positioned inside the sticky box,
 * so they leave with it.
 */
export const HomeView = () => {
  return (
    <main className="min-h-lvh w-full">
      {/* The page's own node in the JSON-LD graph, beside the Organization and
          WebSite the root layout emits. It lives with the page rather than in
          the route file, which holds nothing but its `metadata` and this view
          (hard rule #5). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(getHomeStructuredData()),
        }}
      />
      {/* Over everything until the room behind it is loaded, compiled and has
          drawn a frame - then clipped away from the bottom up, which is what
          starts the hero. */}
      <Preloader label={homeHero.loadingLabel} />
      <SiteHeader
        label={homeHero.nav.label}
        homeLabel={homeHero.nav.home}
        homeHref={homeHero.nav.homeHref}
        menuLabel={homeHero.nav.menu}
        contactLabel={homeHero.nav.contact}
        contactHref={homeHero.nav.contactHref}
        menuItems={homeHero.nav.menuItems}
      />
      <SceneHud
        date={stamp(new Date())}
        recordingLabel={homeHero.recordingLabel}
      />

      {/* The section is taller than the viewport purely to give the scene a
          scroll to be driven by; the scene itself sticks to the top and never
          scrolls out of frame. It grew from 700 to 840 to give the hand-over
          between the two black panels three times the room - every other act
          keeps the page distance it had, which is what the rescaled windows in
          `lib/scene/config.ts` are for. Four acts share that height: the flight, the
          carousel it lands on, the team block sliding up over the room, and -
          once that block has carried its sections past - the shot it slides
          away from. */}
      <section
        aria-label={homeHero.sceneLabel}
        className="relative h-[840lvh] w-full"
      >
        {/* Somewhere for *Buy Pack* to land. The acts are scroll positions on
            one tall section, not sections of their own, so the ring has nothing
            to jump to - this is a zero-height marker parked at the point in the
            scroll where the carousel is holding still. */}
        <span id="packs" aria-hidden="true" className="absolute top-[22%]" />

        <div className="sticky top-0 h-lvh w-full overflow-hidden bg-background">
          <SceneWithPacks
            modelUrl={homeHero.modelUrl}
            screenVideos={homeHero.screenVideos}
            screenVideoOverrides={homeHero.screenVideoOverrides}
            screenGlowScale={homeHero.screenGlowScale}
            flightSigns={homeHero.flightSigns}
            captionLabels={homeHero.captionLabels}
            finalShot={homeHero.finalShot}
            closing={homeHero.closing}
            cases={homeHero.cases}
            team={homeHero.team}
            about={homeHero.about}
            className="absolute inset-0 transform-gpu backface-hidden will-change-transform"
          />
        </div>

        {/* Outside the sticky box on purpose: the words belong to the *first*
            screen, and a sticky one would carry the headline over the carousel
            and the finale as well. Absolute over the first viewport, so it is
            pinned to the top and bottom edges while it is the shot, and it
            leaves with the scroll. */}
        <HeroCopy
          headline={homeHero.headline}
          intro={homeHero.intro}
          primary={homeHero.primaryCta}
          secondary={homeHero.secondaryCta}
        />
      </section>
    </main>
  );
};
