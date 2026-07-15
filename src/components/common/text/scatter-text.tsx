"use client";

// 📖 Docs: obsidian/frontend/components/common.md

import { useSpring, animated } from "@react-spring/web";
import { useMemo, type ElementType } from "react";

export interface ScatterTextProps {
  children: string;
  /** `false` scatters it back out. */
  active: boolean;
  /** The element the line is rendered as — `h1`, `h2`, `p`. */
  tag?: ElementType;
  className?: string;
}

/** How far out of focus a letter starts, in pixels. */
const BLUR = 14;
/** Slowest and fastest a letter may resolve — the spread *is* the effect. */
const TENSION = [42, 190] as const;

/**
 * A stable pseudo-random `0`–`1` from an integer.
 *
 * **Not `Math.random`.** The letters are laid out on the server and hydrated on
 * the client, and two different draws would mean two different animations for
 * the same markup — React would keep the server's and the effect would be
 * whatever it happened to be. Hashed from the index instead, so both sides
 * agree and the same heading always resolves the same way.
 */
const scatter = (index: number): number => {
  const value = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

/**
 * One letter, on its own spring.
 *
 * A component rather than a loop, because each of these needs a hook of its own
 * — which is the whole point: **every letter runs at a different speed from the
 * same starting gun**.
 */
const Letter = ({
  char,
  seed,
  active,
}: {
  char: string;
  seed: number;
  active: boolean;
}) => {
  // **The exit is the entrance inverted.** The letter that resolved first is the
  // last to go, because its speed on the way out is drawn from `1 - seed`. With
  // the same speed both ways the line simply plays backwards, which reads as an
  // undo rather than as the words leaving.
  const pace = active ? seed : 1 - seed;
  const style = useSpring({
    opacity: active ? 1 : 0,
    filter: `blur(${active ? 0 : BLUR}px)`,
    config: {
      tension: TENSION[0] + (TENSION[1] - TENSION[0]) * pace,
      friction: 26 + pace * 10,
    },
  });

  return (
    <animated.span aria-hidden="true" style={style} className="inline-block">
      {char}
    </animated.span>
  );
};

/**
 * A line whose letters resolve out of a blur, each at its own speed.
 *
 * The brief: *letters appear at random, not left to right — all at once but at
 * different speeds*. That is one spring per letter with a **different config**
 * and a **shared start**, which is exactly the shape [[text-engine]] cannot
 * make: its staggers are single numbers applied by sequential index, and one
 * `letterConfig` covers every letter, so what it produces is always a sweep. A
 * deliberate exception to hard rule #3 — see [[decisions-log]] ADR-0031.
 *
 * Words are kept whole (`whitespace-nowrap` per word) so a line still breaks
 * between words rather than between letters, and the plain string is left in
 * the DOM for screen readers and crawlers while the split copy is
 * `aria-hidden` — the same bargain the text engine's own `seo` prop strikes.
 */
export const ScatterText = ({
  children,
  active,
  tag: Tag = "span",
  className,
}: ScatterTextProps) => {
  const words = useMemo(() => children.split(" "), [children]);
  let index = 0;

  return (
    <Tag className={className}>
      <span className="sr-only">{children}</span>
      {words.map((word, wordIndex) => (
        <span
          key={`${word}-${wordIndex}`}
          className="inline-block whitespace-nowrap"
        >
          {[...word].map((char, charIndex) => {
            const seed = scatter(index);
            index += 1;
            return (
              <Letter
                key={`${char}-${charIndex}`}
                char={char}
                seed={seed}
                active={active}
              />
            );
          })}
          {wordIndex < words.length - 1 ? (
            <span aria-hidden="true">&nbsp;</span>
          ) : null}
        </span>
      ))}
    </Tag>
  );
};
