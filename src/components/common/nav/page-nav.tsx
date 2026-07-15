"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Getting between the secondary pages without going home first.
 *
 * Every one of these carried a lone "Back to Shellr" and nothing else, so
 * moving from staking to the inventory meant the long way round through a
 * landing page built to be scrolled. Six destinations is few enough to name
 * them all, which is cheaper to read than a menu that has to be opened.
 *
 * `soon` marks a page that exists but does not do anything yet - it still
 * links, because the page explains itself better than a disabled button does.
 * What it must not do is look identical to a page that works.
 */

const PAGES = [
  { href: "/stocks", label: "Stock Packs" },
  { href: "/compacks", label: "Community Packs" },
  { href: "/staking", label: "Staking" },
  { href: "/inventory", label: "Inventory" },
  { href: "/battles", label: "Battles", soon: true },
  { href: "/launchpad", label: "Launchpad", soon: true },
];

export const PageNav = () => {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="mt-6 -mx-1 flex flex-wrap items-center gap-1.5"
    >
      {PAGES.map((page) => {
        const here = pathname === page.href;
        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={here ? "page" : undefined}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[0.8125rem] font-semibold transition-colors ${
              here
                ? "bg-nav-accent text-nav-accent-ink"
                : "bg-white/[0.05] text-nav-text/60 hover:bg-white/[0.1] hover:text-nav-text"
            }`}
          >
            {page.label}
            {page.soon && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[0.5625rem] tracking-[0.1em] uppercase ${
                  here ? "bg-black/20" : "bg-white/[0.08] text-nav-text/40"
                }`}
              >
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
};
