"use client";

// 📖 Docs: obsidian/frontend/components/common.md

import { animated, useTrail } from "@react-spring/web";

import { ScatterText } from "@/components/common/text/scatter-text";
import type { HomeAboutContent, HomeAboutIcon } from "@/data/mocks/home";

/**
 * The three marks in the design's black tiles — a ring, a triangle, a rounded
 * square, all drawn rather than shipped as assets: three outlines at one stroke
 * weight are less code than three files, and they take the palette's colour.
 */
const Icon = ({ shape }: { shape: HomeAboutIcon }) => (
  <svg
    viewBox="0 0 36 36"
    fill="none"
    aria-hidden="true"
    className="size-5 text-nav-accent sm:size-[2.1875rem]"
  >
    {shape === "circle" ? (
      <circle
        cx="18"
        cy="18"
        r="16.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    ) : null}
    {shape === "triangle" ? (
      <path
        d="M18 3.5 34 32.5H2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    ) : null}
    {shape === "square" ? (
      <rect
        x="1.25"
        y="1.25"
        width="33.5"
        height="33.5"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    ) : null}
  </svg>
);

export interface AboutPanelProps {
  content: HomeAboutContent;
  /** True only while this panel is the one over the window. */
  active: boolean;
}

/**
 * The studio, on the second black panel.
 *
 * Figma node `1444:410`: the heading hard against the **60px** left margin at
 * the usual 97px, the lead paragraph beside it on a 667px measure — **Chakra
 * Petch 32/1.2**, with alternate clauses at half strength, which is what gives
 * the paragraph its rhythm — and three `#dbfffe` cards across the foot, 331 tall
 * on a 16px gutter, each with a black 66px tile at the top-left and its copy on
 * a 341px measure at the bottom. Every inset in a card is **32px**.
 *
 * The heading resolves out of a blur when the panel arrives and scatters back
 * into one when it leaves — see [[components/common|`<ScatterText>`]] — and the
 * three cards **rise into it one after another**, on a trail rather than three
 * delays: a trail is one spring pulling the next, so the row arrives as a run
 * of movement instead of three things landing on a metronome. They leave the
 * same way, in the same order, which is what makes the panel read as one object
 * rather than as a slide with contents.
 *
 * > [!important] It is a **column**, not four absolutely-placed boxes
 * > Every number above is still here — the 97px head, the 60px margins, the
 * > 50px footing, the 331px row on its 16px gutter — but they are now padding
 * > and a height on a `justify-between` column rather than four independent
 * > `top`/`bottom` offsets. Absolutely placed, the head and the foot of this
 * > panel were pinned to opposite edges of *whatever shape the window is*: on a
 * > 3:4 tablet that left a third of the panel as a black band in the middle, and
 * > on a phone the three cards were 69px wide with 32px of padding in them. A
 * > column can do what neither of those can — stack at one width, sit in a row
 * > at another, and give back the space between when there is none to give.
 */
export const AboutPanel = ({ content, active }: AboutPanelProps) => {
  const trail = useTrail(content.cards.length, {
    opacity: active ? 1 : 0,
    y: active ? 0 : 64,
    // Soft: low tension against high friction is a spring that arrives without
    // ever quite overshooting — these are big flat slabs, and a bounce on one
    // reads as a wobble in the whole row.
    config: { tension: 120, friction: 30 },
  });

  return (
    // **Centred until the frame is wide enough to hold a head and a footing
    // apart.** The design's 97px head and 50px foot are two ends of a 16:9
    // window; on a 3:4 tablet — and more so on a phone — they are two ends of
    // something much taller, and what sits between them is a hand's width of
    // black through the middle of the panel. `lg` is the width at which the
    // desktop layout takes over anyway, and it is also, near enough, the width
    // at which the frame stops being tall: every tablet is over it in landscape
    // and under it in portrait.
    <div className="absolute inset-0 flex flex-col justify-center px-6 pt-[5.25rem] pb-[4.5rem] sm:px-10 sm:pt-[6.0625rem] sm:pb-[3.125rem] lg:justify-between lg:px-[3.75rem]">
      {/* The head. Under `sm` the lead sits beneath the heading; from there it
          takes the **second and third columns** of the same three the row below
          stands in, which is what puts the paragraph and the card under it on
          one line at any width. */}
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <ScatterText
          tag="h2"
          active={active}
          className="font-display text-[2.25rem] leading-none whitespace-nowrap text-nav-accent sm:text-[3rem] lg:text-[4.5rem]"
        >
          {content.heading}
        </ScatterText>

        <p className="text-[1rem] leading-[1.35] text-nav-accent sm:col-span-2 sm:text-[1.5rem] sm:leading-[1.2] lg:max-w-[41.6875rem] lg:text-[2rem]">
          {content.lead.map((clause) => (
            <span
              key={clause.text}
              className={clause.dim ? "text-nav-accent/50" : ""}
            >
              {clause.text}
            </span>
          ))}
        </p>
      </div>

      {/* Three columns on the design's own 16px gutter, stacked into one under
          `sm` - three cards across a phone is 69px of card and 64px of padding.
          The 331px height is the design's and belongs to the row *as a row*; a
          stack takes whatever its copy needs. */}
      <ul className="mt-8 grid grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-3 sm:gap-4 lg:h-[20.6875rem]">
        {content.cards.map((card, index) => (
          <animated.li
            key={card.icon}
            style={{
              opacity: trail[index]?.opacity,
              transform: trail[index]?.y.to(
                (value) => `translate3d(0, ${value}px, 0)`,
              ),
            }}
            // A row on a phone — tile beside the copy — and the design's
            // tile-above-copy from `sm` up. Both are the same two children in
            // the same order, so nothing is duplicated to get the two shapes.
            className="flex items-center gap-4 rounded-2xl bg-nav-accent p-4 text-nav-accent-ink will-change-transform sm:flex-col sm:items-stretch sm:justify-between sm:gap-6 sm:p-6 lg:p-8"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-nav-accent-ink sm:size-[3.25rem] lg:size-[4.125rem]">
              <Icon shape={card.icon} />
            </span>
            <p className="text-[0.8125rem] leading-[1.3] sm:text-[0.9375rem] sm:leading-[1.2] lg:max-w-[21.3125rem] lg:text-[1rem]">
              {card.body}
            </p>
          </animated.li>
        ))}
      </ul>
    </div>
  );
};
