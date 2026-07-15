"use client";

// 📖 Docs: obsidian/frontend/components/common.md

import { useState } from "react";

import { TeamCarousel } from "@/components/common/team/team-carousel";
import { ScatterText } from "@/components/common/text/scatter-text";
import type { HomeTeamContent } from "@/data/mocks/home";

export interface TeamPanelProps {
  content: HomeTeamContent;
  /** True only while this panel is the one over the window. */
  active: boolean;
  /** True from a third of the way in — what the heading resolves on. */
  arriving: boolean;
  /** Pointer on the ring — the panel has no chip of its own, the scene does. */
  onHint?: (over: boolean) => void;
}

/** Two digits — the design counts `[ 01 / 08 ]`. */
const pad = (value: number): string => value.toString().padStart(2, "0");

/**
 * The team, on the first of the black panels.
 *
 * Figma node `1442:352`: the heading in the hollow display face at the same
 * **97px** everything else sits at, the `[ 01 / 08 ]` counter under it, the card
 * ring across the middle of the frame, and the front card's name (**Inline 32**)
 * and three tags against the bottom on the usual 50px footing.
 *
 * The panel itself — how it arrives, when it is interactive — belongs to
 * [[components/common|`<PanelStack>`]]; this is only what is on it.
 */
export const TeamPanel = ({
  content,
  active,
  arriving,
  onHint,
}: TeamPanelProps) => {
  const [index, setIndex] = useState(0);
  const member = content.members[index] ?? content.members[0];

  return (
    <>
      <ScatterText
        tag="h2"
        active={arriving}
        className="absolute top-[5.25rem] left-1/2 z-10 -translate-x-1/2 text-center font-display text-[2.25rem] leading-none whitespace-nowrap text-nav-accent sm:top-[6.0625rem] sm:text-[3rem] lg:text-[4.5rem]"
      >
        {content.heading}
      </ScatterText>

      {/* Held one line under the heading at each size - the counter belongs to
          it, and a fixed 201px sits halfway down a phone's heading. */}
      <p className="absolute top-[8.75rem] left-1/2 z-10 -translate-x-1/2 text-[0.875rem] leading-[1.2] whitespace-nowrap text-hud-text tabular-nums sm:top-[10.5rem] sm:text-[1rem] lg:top-[12.5625rem]">
        [ {pad(index + 1)} / {pad(content.members.length)} ]
      </p>

      <TeamCarousel
        members={content.members}
        label={content.label}
        index={index}
        onIndex={setIndex}
        active={active}
        onHint={onHint}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-[4.5rem] z-10 flex flex-col items-center sm:bottom-[3.125rem]">
        <p className="mb-4 text-center font-display text-[1.5rem] leading-none text-nav-accent sm:mb-6 sm:text-[2rem]">
          {member.name}
        </p>
        {/* Wrapping: these are job titles, not chips - *9 years of experience*
            on its own is most of a phone's width. */}
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 px-6 text-center text-[0.875rem] leading-[1.2] text-hud-text sm:gap-x-8 sm:text-[1rem]">
          {member.tags.map((tag) => (
            <li key={tag}>( {tag} )</li>
          ))}
        </ul>
      </div>
    </>
  );
};
