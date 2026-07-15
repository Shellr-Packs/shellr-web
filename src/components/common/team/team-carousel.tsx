"use client";

// 📖 Docs: obsidian/frontend/components/common.md

import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";

import type { HomeTeamMember } from "@/data/mocks/home";
import { subscribeToTicker } from "@/lib/animation/ticker";

export interface TeamCarouselProps {
  members: HomeTeamMember[];
  /** Accessible name for the group. */
  label: string;
  /** Which card is at the front — the section names it underneath. */
  index: number;
  onIndex: (index: number) => void;
  /** `false` parks it: no pointer, no tab stops. */
  active: boolean;
  /**
   * Pointer on the ring, or off it — what puts the chip on the cursor.
   *
   * The ring is the one thing on the page that has to be *told* it can be
   * dragged: it looks like a row of photographs, and a row of photographs
   * carries no promise that it moves.
   */
  onHint?: (over: boolean) => void;
}

/**
 * The ring.
 *
 * A **real cylinder**, which the two builds before this were not. Each card is
 * `rotateY(--a) translateZ(-r)` on a ring that is itself
 * `translateZ(push) rotateY(--rot)` — and `push` is the whole trick: it carries
 * the ring forward by `r · (1 − arcDepth)` so the front card ends up at the
 * viewer rather than a radius away. That is what makes the arc read as *concave*
 * — the row curving away from you — while every card is genuinely turned to face
 * the axis it stands on.
 *
 * Faking that with a hand-built depth curve and a separate tilt (the previous
 * build) cannot work: the two are one thing on a ring, and separating them puts
 * every card at the wrong angle for where it stands.
 */
const RING = {
  /**
   * Roughly how many cards to hang on the ring; the real count is rounded to a
   * **whole number of passes through the members** — see `slots()` below.
   */
  slots: 14,
  /**
   * Card height over width.
   *
   * **This is the pack's own proportion**, and the card art is cropped to the
   * silhouette to match it — see `public/assets/team/tok*-v85.webp`. It was
   * 1.36, which left the foil floating in its render's black margin with the
   * frame drawn round the margin rather than round the pack.
   */
  ratio: 1.79,
  /** Ring radius as a multiple of card width. */
  radius: 3,
  /** `0` a flat row, `1` fully concave — the viewer at the ring's centre. */
  arcDepth: 0.7,
  /**
   * Perspective as a multiple of the window's width; lower is punchier.
   *
   * Longer than the punchy 0.8 this started on, and for a reason that is not
   * taste: the ring's *sides* pass close to the lens, and at 0.8 they rendered
   * half again as tall as the front card — tall enough to run up behind the
   * heading. Lengthening the perspective flattens that difference **and** makes
   * the front card bigger, which is the right direction on both counts.
   */
  perspective: 1.15,
  /**
   * How far the front card is pushed out of the ring, as a share of the radius.
   *
   * On a concave ring the front card is the **furthest** point from the lens —
   * its neighbours stand nearer by `r · (1 − cos θ)` — so the sides were drawn
   * over the middle, which is backwards for the one card the section is naming.
   * Lifting it clear along its own normal puts it in front of everything within
   * about two slots either side, which is all that ever overlaps it.
   */
  lift: 0.26,
  /** Degrees of ring rotation per pixel dragged. */
  drag: 0.16,
  /** Inertia decay per frame after release. */
  damp: 0.94,
  /** Below this the throw is over and the nearest card is eased to the centre. */
  rest: 0.05,
  /** How hard it is pulled to that centre each frame. */
  snap: 0.14,
  /**
   * Where a card starts fading as it goes round, and where it is gone.
   *
   * The ring used to simply **switch** at 96° — one frame a card was solid, the
   * next it was not there — and a row of photographs blinking out at both edges
   * is the first thing the eye goes to. It fades across the last third of its
   * travel instead, so what the edges do is *leave* rather than *stop*.
   */
  fadeFrom: 58,
  fadeTo: 92,
};

/**
 * How many slots to build for a given number of members.
 *
 * A multiple of the member count, always. With fourteen slots and nine members
 * the ring ran 1…9 and then 1…5 before meeting its own start, so going round it
 * once passed a seam where the order jumped — the same card twice with four of
 * them skipped in between. Rounding up to a whole number of passes closes the
 * ring into one continuous sequence.
 *
 * Rounding **up** rather than to nearest, because the count also sets how close
 * together the cards sit: ten members rounded to nearest gives ten slots at 36°
 * apart, and since a card is hidden past 90° that leaves five on screen instead
 * of nine. Ten members become twenty slots at 18°.
 */
const slotsFor = (members: number): number =>
  Math.ceil(RING.slots / members) * members;

/**
 * Gap between the card at the front and the frame around it, in pixels a side.
 *
 * Written as a *multiplier* on the card (`--frame`) rather than as padding on
 * the frame, because the card grows into it: a fixed padding is a different
 * fraction of the width than of the height, so a card scaled to touch the sides
 * would overrun the top. One multiplier lands it on all four edges at once.
 */
const FRAME_GAP = 10;

const wrap = (value: number, size: number): number =>
  ((value % size) + size) % size;

/** An angle folded into (−180, 180] — how far round the ring a card has got. */
const turn = (degrees: number): number => wrap(degrees + 180, 360) - 180;

/**
 * The team's cards, on a draggable 3D ring.
 *
 * **Drag, throw, snap.** The pointer turns the ring a sixth of a degree per
 * pixel; letting go leaves it spinning and the spin decays; once it is slow
 * enough the nearest card is eased to dead centre and the rotation stops
 * changing exactly, which is what keeps a hover from shivering. Arrow keys and
 * the dock's buttons step it by one, clicking a card brings that card round.
 *
 * The ring is **endless** — `rot` and the target index are unbounded and every
 * slot's content is `members[slot % members.length]`, so spinning past the ends
 * wraps with nothing to hide.
 *
 * **This one is not a spring**, which is the one place the scene's rule bends:
 * it is a thrown object with friction, and the settle is the tail of that same
 * motion. See [[decisions-log]] ADR-0030. It still runs on the shared ticker,
 * and still writes transforms straight to the nodes — a drag fires on every
 * pointer move, and a state round-trip per move would re-render the tree a
 * hundred times a second. React state carries only the index.
 */
export const TeamCarousel = ({
  members,
  label,
  index,
  onIndex,
  active,
  onHint,
}: TeamCarouselProps) => {
  const count = members.length;
  /** Slots on the ring, and the angle between them. Declared before anything
      that reads them: the settle loop and the front-slot lookup both do. */
  const slots = slotsFor(count);
  const step = 360 / slots;

  const stage = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  /** Everything the loop owns. None of it belongs in React. */
  const spin = useRef({
    rot: 0,
    velocity: 0,
    dragging: false,
    lastX: 0,
    downX: 0,
    moved: false,
    target: 0,
    settled: true,
    written: Number.NaN,
    pointer: -1,
  });

  /** The slot the ring has turned to the front, wrapped into the list. */
  const frontSlot = useCallback(
    () => wrap(Math.round(-spin.current.rot / step), slots),
    [slots, step],
  );

  /** Where the ring is now, in whole cards, unbounded. */
  const nearest = useCallback(
    () => Math.round(-spin.current.rot / step),
    [step],
  );

  const go = useCallback(
    (delta: number) => {
      spin.current.target = Math.round(-spin.current.rot / step) + delta;
      spin.current.settled = true;
      spin.current.velocity = 0;
    },
    [step],
  );

  /** Bring one ring slot round, whichever way is shorter. */
  const focusSlot = useCallback(
    (slot: number) => {
      const from = nearest();
      let hop = wrap(slot - wrap(from, slots), slots);
      if (hop > slots / 2) hop -= slots;
      // Cards, not degrees — `hop` is a slot count and `target` is measured in
      // slots. Adding the angular pitch here sent the ring most of a turn away.
      spin.current.target = from + hop;
      spin.current.settled = true;
      spin.current.velocity = 0;
    },
    [nearest, slots],
  );

  /**
   * What `--grow` has to reach for the front card to sit on the frame.
   *
   * Not simply the frame's multiplier. The frame is drawn flat on the stage,
   * but the card is a radius back and only pushed *most* of the way forward, so
   * it sits behind the stage plane and the perspective renders it smaller than
   * its own CSS size. Growing it by the frame's multiplier alone therefore
   * lands it short — visibly, which is what a bare multiplier did. Divide by
   * that foreshortening and it arrives on the edges.
   */
  const growTo = useRef(1);

  /** How far out of the ring the front card is pushed, in px. */
  const liftBy = useRef(0);

  // Card size, ring radius and the push that brings its front to the viewer.
  // Re-derived whenever the window changes: everything here is a length, and
  // the whole row would otherwise keep the proportions of the window it was
  // first laid out in.
  useEffect(() => {
    const measure = (): void => {
      const node = stage.current;
      if (!node) return;

      // **No upper cap.** With one, a wide window kept 238px cards on a 714px
      // radius and the arc simply stopped short of both edges — a band of empty
      // black down each side. The ring grows with the window instead.
      //
      // The window's *height* is the other limit, and the binding one on
      // anything wide: the ring's sides pass near the lens and render half again
      // as tall as the front card, so the share of the height is set by what
      // those can be without running up behind the heading — not by the front
      // card, which ends up about a quarter of it.
      //
      // **The share of the width is not one number.** A sixth of the window is
      // a generous card at 1440 and a postage stamp at 390 — the ring was
      // falling back to its 150px floor on every phone, which is a third of the
      // screen for the thing the whole panel is about. The narrower the window,
      // the larger the share it can afford, because there is no longer any
      // question of the row reaching both edges. The height cap is unchanged and
      // still wins wherever it is the tighter of the two.
      const share =
        window.innerWidth < 640 ? 0.52 : window.innerWidth < 1024 ? 0.3 : 0.17;
      const width = Math.max(
        150,
        Math.min(window.innerWidth * share, window.innerHeight * 0.26),
      );
      const radius = width * RING.radius;
      const frame = (width + FRAME_GAP * 2) / width;
      const perspective = Math.max(900, window.innerWidth * RING.perspective);
      // How far behind the stage the front card sits, and how much the
      // perspective shrinks it there.
      // Where the front card ends up once it is lifted, and how much the
      // perspective still shrinks it there.
      liftBy.current = radius * RING.lift;
      const depth = radius * RING.arcDepth - liftBy.current;
      growTo.current = (frame * (perspective + depth)) / perspective;
      node.style.setProperty("--frame", `${frame}`);
      node.style.setProperty("--cw", `${width}px`);
      node.style.setProperty("--ch", `${width * RING.ratio}px`);
      node.style.setProperty("--r", `${radius}px`);
      node.style.setProperty("--push", `${radius * (1 - RING.arcDepth)}px`);
      node.style.perspective = `${perspective}px`;
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Throw, decay, settle — one pass on the shared ticker.
  useEffect(() => {
    let seen = -1;

    return subscribeToTicker(
      () => {
        const state = spin.current;

        if (!state.dragging) {
          state.rot += state.velocity;
          state.velocity *= RING.damp;

          if (Math.abs(state.velocity) < RING.rest) {
            if (!state.settled) {
              state.target = Math.round(-state.rot / step);
              state.settled = true;
            }
            const away = -state.target * step - state.rot;
            // Landed exactly, so `--rot` stops changing and a hovered card
            // holds perfectly still instead of shivering under the ease.
            if (Math.abs(away) < 0.01) state.rot = -state.target * step;
            else state.rot += away * RING.snap;
          } else state.settled = false;
        }

        if (state.rot !== state.written) {
          state.written = state.rot;
          ring.current?.style.setProperty("--rot", `${state.rot}deg`);

          // Drop the cards round the back out of the compositor. `backface-
          // visibility` already stops them being *drawn*, but each one is still
          // a layer to hold and transform, and on a weak GPU fourteen of them
          // at a third of the window each is the difference between sixty and
          // twenty. Only the frames where a card crosses the horizon pay for
          // this — the rest are string comparisons that write nothing.
          const cards = ring.current?.children;
          for (let i = 0; cards && i < cards.length; i += 1) {
            const away = Math.abs(turn(i * step + state.rot));
            const card = cards[i] as HTMLElement;
            // Faded out over the last of its travel, and only *then* dropped —
            // by which point it is already invisible, so the drop is free.
            const level = Math.min(
              Math.max((RING.fadeTo - away) / (RING.fadeTo - RING.fadeFrom), 0),
              1,
            );
            const opacity = level > 0.999 ? "" : level.toFixed(3);
            if (card.style.opacity !== opacity) card.style.opacity = opacity;
            const want = level > 0.001 ? "" : "hidden";
            if (card.style.visibility !== want) card.style.visibility = want;

            // Grow into the frame on the way to the front. Ramped over the one
            // slot either side rather than switched at the centre: the ring
            // coasts and settles, and a card that popped to full size would
            // snap while the row was still visibly moving.
            const near = Math.max(0, 1 - away / step);
            const full = growTo.current;
            const lift = (liftBy.current * near).toFixed(1);
            if (card.style.getPropertyValue("--lift") !== `${lift}px`) {
              card.style.setProperty("--lift", `${lift}px`);
            }
            const grow = (1 + (full - 1) * near).toFixed(4);
            if (card.style.getPropertyValue("--grow") !== grow) {
              card.style.setProperty("--grow", grow);
            }
          }
        }

        const front = frontSlot() % count;
        if (front !== seen) {
          seen = front;
          onIndex(front);
        }
      },
      () => 0,
    );
  }, [count, frontSlot, onIndex, step]);

  // The page owns the index too — the dock's buttons and the dots set it — so
  // follow it when it moves on its own.
  useEffect(() => {
    if (wrap(frontSlot(), count) === index) return;
    const from = Math.round(-spin.current.rot / step);
    // `hop`, not `step` — that name is the ring's angular pitch now.
    let hop = wrap(index - wrap(from, count), count);
    if (hop > count / 2) hop -= count;
    spin.current.target = from + hop;
    spin.current.settled = true;
    spin.current.velocity = 0;
  }, [index, count, frontSlot, step]);

  const onDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const state = spin.current;
    state.dragging = true;
    state.pointer = event.pointerId;
    state.lastX = state.downX = event.clientX;
    state.moved = false;
    state.velocity = 0;
    state.settled = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = spin.current;
    if (!state.dragging || state.pointer !== event.pointerId) return;

    const dx = event.clientX - state.lastX;
    state.lastX = event.clientX;
    if (Math.abs(event.clientX - state.downX) > 6) state.moved = true;
    // The ring *is* the thumb while it is down: the rotation is written, and
    // the same step is kept as the velocity the throw carries on with.
    state.velocity = -dx * RING.drag;
    state.rot += state.velocity;
  };

  const onUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = spin.current;
    if (state.pointer !== event.pointerId) return;
    state.dragging = false;
    state.pointer = -1;
    state.settled = false;

    // A tap rather than a drag brings that card round. Hit-tested at the
    // release point rather than taken from the event's target: the pointer
    // capture above has retargeted every event to the stage.
    if (state.moved) return;
    const hit = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-slot]");
    if (hit) focusSlot(Number(hit.dataset.slot));
  };

  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    go(event.key === "ArrowRight" ? 1 : -1);
  };

  return (
    <div
      ref={stage}
      role="group"
      aria-label={label}
      tabIndex={active ? 0 : -1}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerEnter={() => onHint?.(true)}
      onPointerLeave={() => onHint?.(false)}
      onKeyDown={onKey}
      className={`absolute inset-0 grid touch-none place-items-center select-none ${
        active
          ? "pointer-events-auto cursor-grab active:cursor-grabbing"
          : "pointer-events-none"
      }`}
    >
      <div
        ref={ring}
        className="relative size-0 [transform-style:preserve-3d] [transform:translateZ(var(--push))_rotateY(var(--rot,0deg))]"
      >
        {Array.from({ length: slots }, (_, slot) => {
          const member = members[slot % count];
          return (
            <article
              key={slot}
              data-slot={slot}
              style={{ ["--a" as string]: `${slot * step}deg` }}
              className="absolute top-[calc(var(--ch)/-2)] left-[calc(var(--cw)/-2)] h-[var(--ch)] w-[var(--cw)] backface-hidden [transform-style:preserve-3d] [transform:rotateY(var(--a))_translateZ(calc(var(--r)*-1_+_var(--lift,0px)))_scale(var(--grow,1))]"
            >
              <div className="group absolute inset-0 overflow-hidden rounded-2xl bg-black shadow-[0_16px_32px_-14px_rgba(6,10,22,.65),0_4px_10px_-6px_rgba(6,10,22,.5)] backface-hidden transition-transform duration-[var(--duration-normal)] ease-entrance hover:scale-105">
                <Image
                  src={member.image}
                  alt=""
                  width={348}
                  height={484}
                  draggable={false}
                  className="pointer-events-none absolute inset-0 size-full object-cover"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/25 via-30% to-transparent to-55%"
                />
                {/* Nothing printed on the card: the dock under the ring names
                    whichever one is at the front, and a number and a handle on
                    every face made the row read as a deck of tickets. The name
                    is still here for anything not looking at it. */}
                <span className="sr-only">{member.name}</span>
              </div>
            </article>
          );
        })}
      </div>

      {/* The frame round the card at the front. **Static** - it belongs to the
          stage, not to the ring, so it does not turn with the cards and does not
          live in the 3D space they do: the card the ring brings round arrives
          inside it. Slightly larger than a card on every side, which is what
          makes it read as a viewfinder rather than as a border on the photo.

          **Written after the ring on purpose.** The ring is positioned and
          carries a 3D context of its own, so it paints over anything
          positioned before it whatever colour the frame is given - which is
          exactly how this went invisible once already.

          Drawn as the page's own hairline rather than in the accent: the new
          card art is black foil on black, and a thin tinted line at this size
          disappeared into it. Corner ticks carry the rest - a full bright box
          would fight the card it is meant to point at. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute z-10 top-1/2 left-1/2 h-[calc(var(--ch)*var(--frame,1))] w-[calc(var(--cw)*var(--frame,1))] -translate-x-1/2 -translate-y-1/2 rounded-[1.25rem] border border-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_0_30px_rgba(255,255,255,0.12)]"
      >
        {/* Four ticks, written out rather than generated: each needs its own
            pair of edges and its own rounded corner, and a map that branches on
            its own key for both is longer than the four lines it replaces. */}
        <span className="absolute -top-px -left-px size-5 rounded-tl-[1.25rem] border-t-2 border-l-2 border-white" />
        <span className="absolute -top-px -right-px size-5 rounded-tr-[1.25rem] border-t-2 border-r-2 border-white" />
        <span className="absolute -bottom-px -left-px size-5 rounded-bl-[1.25rem] border-b-2 border-l-2 border-white" />
        <span className="absolute -right-px -bottom-px size-5 rounded-br-[1.25rem] border-r-2 border-b-2 border-white" />
      </span>
    </div>
  );
};
