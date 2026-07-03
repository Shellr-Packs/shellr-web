import type { Metadata } from "next";

import { siteConfig } from "@/lib/site";
import { generateMetadata } from "@/utils/seo/generate-page-metadata";
import { HomeView } from "@/views/home";

/**
 * The home route's own metadata.
 *
 * The one thing a route file holds besides its view — Next reads `metadata` from
 * the segment itself, so it cannot live in `src/views/` with the rest of the
 * page (hard rule #5 / [[decisions-log]] ADR-0003).
 *
 * `titleAbsolute` because `siteConfig.title` is already the whole title; run
 * through the layout's `%s — Shellr` template it would name the studio twice.
 * Everything else — description, canonical, the share card — comes from the
 * generator's defaults, which are this page's anyway.
 */
export const metadata: Metadata = generateMetadata({
  title: siteConfig.title,
  titleAbsolute: true,
  url: "/",
});

export default function Home() {
  return <HomeView />;
}
