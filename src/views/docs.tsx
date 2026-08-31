import Image from "next/image";
import Link from "next/link";

import {
  DOCS_NAV,
  docsGroup,
  docsLabel,
  docsPage,
  headingId,
  pageHeadings,
  type DocsPage,
} from "@/data/mocks/docs";

/**
 * The documentation shell — three columns on black.
 *
 * A plain document, deliberately: the home route is a WebGL room on a scroll
 * timeline, and somebody who has opened the docs wants a rule or a number, not
 * another ride. The only thing it borrows from the room is the palette.
 *
 * Left is where you are in the product, centre is the page, right is where you
 * are in the page. The two rails are sticky under a fixed bar and scroll on
 * their own; below `lg` they collapse — the contents rail disappears entirely
 * rather than becoming a second list above the text nobody reads.
 *
 * Server components, all of them. The sidebar marks the current page by
 * comparing slugs rather than reading the router, which is what keeps it off
 * the client.
 */

const href = (slug: string): string =>
  slug === "" ? "/docs" : `/docs/${slug}`;

/** Fixed, full width, and the reason every anchor carries a scroll margin. */
const Bar = () => (
  <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-white/10 bg-black/85 backdrop-blur-md">
    <div className="mx-auto flex h-full max-w-[90rem] items-center gap-4 px-5 sm:px-8">
      <Link
        href="/"
        className="flex items-center gap-2.5 transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-70"
      >
        {/* Drawn on a pixel grid, so it is left unsmoothed - a resampled copy
            turns its steps to mush at this size. */}
        <Image
          src="/assets/brand/shellr-mark-v93.png"
          alt=""
          width={704}
          height={768}
          className="w-6 [image-rendering:pixelated]"
          priority
        />
        <span className="font-display text-[1.375rem] leading-none font-semibold text-nav-text">
          Shellr
        </span>
      </Link>
      <span aria-hidden="true" className="h-5 w-px bg-white/15" />
      <Link
        href="/docs"
        className="text-[0.9375rem] text-nav-text/60 transition-colors hover:text-nav-text"
      >
        Docs
      </Link>

      <div className="ml-auto flex items-center gap-5">
        <Link
          href="/"
          className="hidden text-[0.9375rem] text-nav-text/60 transition-colors hover:text-nav-text sm:block"
        >
          Website
        </Link>
        <Link
          href="/#packs"
          className="paint-over rounded-full bg-white px-5 py-2 text-[0.875rem] font-semibold text-black transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-85"
        >
          Open app
        </Link>
      </div>
    </div>
  </header>
);

const Sidebar = ({ current }: { current: string }) => (
  <nav
    aria-label="Documentation"
    className="flex flex-col gap-8 border-b border-white/10 pb-10 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:border-b-0 lg:pb-0"
  >
    {DOCS_NAV.map((group) => (
      <div key={group.title}>
        <p className="px-3 text-[0.6875rem] font-semibold tracking-[0.12em] text-nav-text/40 uppercase">
          {group.title}
        </p>
        <ul className="mt-2.5 flex flex-col gap-0.5">
          {group.pages.map((slug) => {
            const page = docsPage(slug);
            if (!page) return null;
            const here = slug === current;
            return (
              <li key={slug || "index"}>
                <Link
                  href={href(slug)}
                  aria-current={here ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[0.9375rem] transition-colors duration-[var(--duration-fast)] ease-entrance ${
                    here
                      ? // The filled pill is the only strong mark in the rail:
                        // one place highlighted means "you are here" without a
                        // legend.
                        "bg-white font-semibold text-black"
                      : page.soon
                        ? // Dimmed, but still a link: the page exists and says
                          // what the thing will be. Greying the label is the
                          // signal; removing the link would hide the plan.
                          "text-nav-text/35 hover:text-nav-text/60"
                        : "text-nav-text/70 hover:bg-white/5 hover:text-nav-text"
                  }`}
                >
                  {docsLabel(page)}
                  {page.soon && (
                    <span className="rounded-sm border border-white/15 px-1.5 py-px text-[0.5625rem] font-semibold tracking-[0.08em] text-nav-text/40 uppercase">
                      Soon
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    ))}
  </nav>
);

/** Where you are in the page. Desktop only — see the shell's note. */
const Contents = ({ page }: { page: DocsPage }) => {
  const headings = pageHeadings(page);
  if (headings.length < 2) return null;

  return (
    <nav
      aria-label="On this page"
      className="hidden lg:sticky lg:top-24 lg:block"
    >
      <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-nav-text/40 uppercase">
        On this page
      </p>
      <ul className="mt-3 flex flex-col border-l border-white/10">
        {headings.map((heading) => (
          <li key={heading}>
            <a
              href={`#${headingId(heading)}`}
              className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[0.875rem] leading-[1.4] text-nav-text/55 transition-colors duration-[var(--duration-fast)] ease-entrance hover:border-nav-accent hover:text-nav-text"
            >
              {heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

const Blocks = ({ page }: { page: DocsPage }) => (
  <>
    {page.blocks.map((block, i) => {
      const key = `${page.slug}-${i}`;

      if (block.heading) {
        return (
          <h2
            key={key}
            id={headingId(block.heading)}
            // Cleared by the fixed bar plus a little air, so an anchor does not
            // land its own heading underneath the header.
            className="mt-14 scroll-mt-24 font-display text-[1.75rem] leading-[var(--leading-display)] font-semibold text-nav-text sm:text-[2rem]"
          >
            {block.heading}
          </h2>
        );
      }

      if (block.text) {
        return (
          <p
            key={key}
            className="mt-5 text-[1.0625rem] leading-[1.75] text-nav-text/75"
          >
            {block.text}
          </p>
        );
      }

      if (block.code) {
        return (
          <div
            key={key}
            className="mt-6 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4"
          >
            <code className="font-mono text-[0.875rem] whitespace-nowrap text-nav-accent">
              {block.code}
            </code>
          </div>
        );
      }

      if (block.list) {
        return (
          <ul
            key={key}
            className="mt-5 flex list-disc flex-col gap-2.5 pl-5 text-[1.0625rem] leading-[1.75] text-nav-text/75 marker:text-nav-accent"
          >
            {block.list.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        );
      }

      if (block.table) {
        return (
          // Scrolls on its own rather than shrinking the type: four columns of
          // figures do not fit a phone at a readable size.
          <div key={key} className="-mx-1 mt-6 overflow-x-auto px-1">
            <table className="w-full min-w-[32rem] border-collapse text-left text-[0.9375rem]">
              <thead>
                <tr>
                  {block.table.head.map((cell) => (
                    <th
                      key={cell}
                      className="border-b border-white/15 pr-5 pb-2.5 text-[0.75rem] font-semibold tracking-[0.08em] text-nav-text/50 uppercase"
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.table.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, c) => (
                      <td
                        key={`${row[0]}-${c}`}
                        className={`border-b border-white/[0.07] py-3.5 pr-5 align-top text-nav-text/70 ${
                          c === 0 ? "font-semibold text-nav-text" : ""
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      if (block.note) {
        return (
          <p
            key={key}
            className="mt-7 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-[0.9375rem] leading-[1.7] text-nav-text/65"
          >
            {block.note}
          </p>
        );
      }

      return null;
    })}
  </>
);

export const DocsShell = ({ page }: { page: DocsPage }) => (
  <div className="min-h-dvh bg-black font-sans text-nav-text">
    <Bar />

    <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-5 pt-24 pb-24 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)_14rem] lg:gap-14">
      <Sidebar current={page.slug} />

      <main className="min-w-0 max-w-[44rem]">
        <p className="text-[0.875rem] text-nav-text/45">
          {docsGroup(page.slug)}
        </p>
        {page.soon && (
          <p className="mt-3 inline-block rounded-full border border-white/20 px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.1em] text-nav-text/50 uppercase">
            Not live yet
          </p>
        )}
        <h1 className="mt-2 font-display text-[3rem] leading-[var(--leading-display)] font-semibold text-nav-text sm:text-[3.75rem]">
          {page.title}
        </h1>
        <p className="mt-5 max-w-[34rem] text-[1.25rem] leading-[1.55] text-nav-text/60">
          {page.lead}
        </p>
        <Blocks page={page} />
      </main>

      <Contents page={page} />
    </div>
  </div>
);
