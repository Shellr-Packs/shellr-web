// 📖 Docs: obsidian/frontend/components/common.md

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface SiteHeaderProps {
  /** Accessible name for the nav landmark. */
  label: string;
  /** The word at the left of the pill. */
  homeLabel: string;
  /**
   * Where that word goes.
   *
   * It used to be the way home, and home is one click away in the logo anyway.
   * Pointed at an `http` address it opens in its own tab — a launchpad listing
   * is somebody else's site, and taking the visitor off this one without
   * warning is worse than the extra tab.
   */
  homeHref?: string;
  menuLabel: string;
  contactLabel: string;
  /**
   * Where the pill's third label goes — **absent while nothing is there to go
   * to**, in which case the word renders as a word: no tab stop, no pointer, no
   * hover. An `http` address opens in its own tab; anything else is treated as
   * a route on this site.
   */
  contactHref?: string;
  /** What *Menu* drops open; `to` is a share of the page's scroll. */
  menuItems?: Array<{
    label: string;
    href?: string;
    to?: number;
    soon?: boolean;
    hint?: string;
  }>;
}

/**
 * The nav pill, pinned to the top of the window.
 *
 * Read off the Figma frame (node `1097:251` → *1441:331*) rather than eyeballed,
 * because almost everything about it was wrong the first time: the pill is
 * **translucent white at 20%** over a 3px backdrop blur with a border of the
 * same 20% — not a solid grey — and its radius is **6px**, not a stadium. The
 * chip is `#dbfffe`, 109 wide, also 6px. Type is Chakra Petch **SemiBold 14**
 * throughout; the readouts in [[components/common|the frame]] are the Regular
 * 16 ones.
 *
 * Both labels are placed by their **text centres** (`< >` at 42.5, `Contact` at
 * 50% + 97), which is how the design positions them, so the pill's spacing holds
 * whatever the strings are.
 *
 * `fixed`: the brief is that it stays at the top for the whole scroll. A server
 * component — nothing here holds state, and keeping it off the client is what
 * lets the route's only client leaf stay the scene.
 *
 * **On a phone the pill is the same pill, 79% of the size.** Every offset in it
 * is a text centre from the design, so the three labels cannot simply be let
 * loose in a flex row without moving all three; each one carries its own
 * smaller number instead, scaled off the pill's width, and the shape the design
 * drew survives the change of size. At 390px it comes to 240 of them, which is
 * what the frame's top row was sized around — see
 * [[components/common|`<SceneHud>`]].
 */
/** *Contact*'s place in the pill — one string, whether it is a link or not. */
const CONTACT =
  "absolute top-[0.5625rem] left-[calc(50%+4.8125rem)] -translate-x-1/2 text-[0.75rem] leading-[1.2] font-semibold whitespace-nowrap text-nav-text sm:top-[0.6875rem] sm:left-[calc(50%+6.0625rem)] sm:text-[0.875rem]";

export const SiteHeader = ({
  label,
  homeLabel,
  homeHref = "/",
  menuLabel,
  contactLabel,
  contactHref,
  menuItems = [],
}: SiteHeaderProps) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on a click anywhere else and on Escape. Both are what a menu is
  // expected to do, and without the first one the panel sits over the scene
  // catching drags meant for the room behind it.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  /** Jump to a share of the page — the acts are scroll positions, not anchors. */
  const goTo = (share: number): void => {
    setOpen(false);
    window.scrollTo({
      top: (document.documentElement.scrollHeight - window.innerHeight) * share,
      behavior: "smooth",
    });
  };

  return (
    <nav
      aria-label={label}
      // **`pointer-events-none` on the bar, `auto` on the pill.** The nav is a
      // full-width strip across the top of the window, and without this it
      // swallows every click along that strip — which is what made the dev
      // panel's button in the top-right corner unclickable.
      className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center font-sans sm:top-4"
    >
      <div
        ref={box}
        className="pointer-events-auto relative h-[2.25rem] w-[13.75rem] rounded-md border border-nav-surface bg-nav-surface backdrop-blur-[3px] sm:h-[2.5625rem] sm:w-[17.4375rem]"
      >
        {homeHref.startsWith("http") ? (
          <a
            href={homeHref}
            target="_blank"
            rel="noreferrer"
            className="absolute top-[0.5625rem] left-[2.125rem] -translate-x-1/2 text-[0.75rem] leading-[1.2] font-semibold whitespace-nowrap text-nav-text transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-70 sm:top-[0.6875rem] sm:left-[2.65625rem] sm:text-[0.875rem]"
          >
            {homeLabel}
          </a>
        ) : (
          <Link
            href={homeHref}
            className="absolute top-[0.5625rem] left-[2.125rem] -translate-x-1/2 text-[0.75rem] leading-[1.2] font-semibold whitespace-nowrap text-nav-text transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-70 sm:top-[0.6875rem] sm:left-[2.65625rem] sm:text-[0.875rem]"
          >
            {homeLabel}
          </Link>
        )}

        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((was) => !was)}
          className="absolute -top-px left-1/2 flex h-[2.25rem] w-[5.5rem] -translate-x-1/2 items-center gap-[0.375rem] rounded-md bg-nav-accent pr-4 pl-[1.25rem] transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-90 sm:h-[2.5625rem] sm:w-[6.8125rem] sm:gap-[0.4375rem] sm:pr-6 sm:pl-[1.5625rem]"
        >
          <span className="text-[0.75rem] leading-[1.2] font-semibold whitespace-nowrap text-nav-accent-ink sm:text-[0.875rem]">
            {menuLabel}
          </span>
          {/* Three rules, 14×1 each at 0 / 3 / 6 - an icon, so it carries no label
            of its own; the button's text is the accessible name. */}
          <span
            aria-hidden="true"
            className="relative block h-[0.4375rem] w-3 sm:w-3.5"
          >
            <span className="absolute inset-x-0 top-0 h-px bg-nav-accent-ink" />
            <span className="absolute inset-x-0 top-[0.1875rem] h-px bg-nav-accent-ink" />
            <span className="absolute inset-x-0 top-[0.375rem] h-px bg-nav-accent-ink" />
          </span>
        </button>

        {/* The panel. Same surface, border and radius as the pill it hangs from,
          so it reads as the pill opening rather than as a second component. */}
        {open && menuItems.length > 0 && (
          <div
            role="menu"
            className="absolute top-[calc(100%+0.5rem)] left-1/2 z-20 flex w-[9.5rem] -translate-x-1/2 flex-col rounded-md border border-nav-surface bg-nav-panel sm:w-[11rem]"
          >
            {menuItems.map((item) => {
              const face = `group relative flex items-center gap-2 px-4 py-[0.5625rem] text-left text-[0.75rem] leading-[1.2] font-semibold whitespace-nowrap sm:text-[0.875rem] ${
                item.soon ? "text-nav-text/40" : "text-nav-text"
              }`;
              // Beside the menu rather than under the row: the panel is nine rem
              // wide and the sentence is not.
              //
              // Which is why the panel above must not clip: it used to carry
              // `overflow-hidden` for its rounded corners, and that quietly cut
              // off every hint at the panel's edge. Nothing here paints outside
              // those corners anyway - the rows are text, and hover is opacity.
              const hint = item.hint ? (
                <span className="pointer-events-none absolute top-1/2 left-full z-10 ml-2 hidden w-[13rem] -translate-y-1/2 rounded-md border border-nav-surface bg-nav-panel px-3 py-2 text-[0.6875rem] leading-[1.45] font-normal whitespace-normal text-nav-text/70 opacity-0 transition-opacity duration-[var(--duration-fast)] ease-entrance group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">
                  {item.hint}
                </span>
              ) : null;
              const hover =
                " transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-70";
              // Dimmed rather than disabled: what is not built still has a page
              // saying what it will be, and a row that cannot be pressed is a row
              // people stop opening the menu for.
              const tag = item.soon ? (
                <span className="rounded-sm border border-nav-text/20 px-1 py-px text-[0.5rem] font-semibold tracking-[0.08em] text-nav-text/40 uppercase">
                  Soon
                </span>
              ) : null;
              if (item.href) {
                return (
                  <Link
                    key={item.label}
                    role="menuitem"
                    href={item.href}
                    target={item.href.startsWith("http") ? "_blank" : undefined}
                    rel={
                      item.href.startsWith("http")
                        ? "noreferrer noopener"
                        : undefined
                    }
                    onClick={() => setOpen(false)}
                    title={item.hint}
                    aria-label={
                      item.hint ? `${item.label} - ${item.hint}` : undefined
                    }
                    className={face + hover}
                  >
                    {item.label}
                    {tag}
                    {hint}
                  </Link>
                );
              }
              if (item.to !== undefined) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={() => goTo(item.to as number)}
                    title={item.hint}
                    aria-label={
                      item.hint ? `${item.label} - ${item.hint}` : undefined
                    }
                    className={face + hover}
                  >
                    {item.label}
                    {tag}
                    {hint}
                  </button>
                );
              }
              // Nowhere to go yet, so it is a word — the same treatment
              // *Contact* gets while its route does not exist.
              return (
                <span
                  key={item.label}
                  title={item.hint}
                  aria-label={
                    item.hint ? `${item.label} - ${item.hint}` : undefined
                  }
                  className={`${face} opacity-45`}
                >
                  {item.label}
                  {tag}
                  {hint}
                </span>
              );
            })}
          </div>
        )}

        {contactHref ? (
          <Link
            href={contactHref}
            target={contactHref.startsWith("http") ? "_blank" : undefined}
            rel={
              contactHref.startsWith("http") ? "noreferrer noopener" : undefined
            }
            className={`${CONTACT} transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-70`}
          >
            {contactLabel}
          </Link>
        ) : (
          <span className={CONTACT}>{contactLabel}</span>
        )}
      </div>
    </nav>
  );
};
