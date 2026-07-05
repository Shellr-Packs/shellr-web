/**
 * @fileoverview Standardised metadata + viewport generators for pages.
 *
 * `generateMetadata` builds a Next.js `Metadata` object — basic meta tags,
 * OpenGraph, Twitter cards, canonical URL, icons, robots. `metadataBase` is
 * always set (from `siteConfig`) so relative URLs (OG image, canonical)
 * resolve to absolute — required by social scrapers.
 *
 * `generateViewport` builds the `Viewport` export. `themeColor` lives here, not
 * in `Metadata` — Next deprecated it on the metadata object.
 */

import { Metadata, Viewport } from "next";

import { siteConfig } from "@/lib/site";

interface MetadataProps {
  /**
   * This page's title.
   *
   * Left out, the root layout's `%s — Shellr` template is bypassed and the
   * site's full title is used verbatim — which is what the home page wants, and
   * why the default is `siteConfig.title` rather than `siteConfig.name`: a home
   * page titled *Shellr — Shellr* is the classic way this goes wrong.
   */
  title?: string;
  /**
   * `%s — Shellr`. **Root layout only** — a template set on a segment is
   * applied to the titles its *children* declare, so exactly one place in the
   * tree should own it.
   */
  titleTemplate?: string;
  /**
   * Opt this page's title out of an ancestor's template.
   *
   * The home page needs it: its title is already the full one, and run through
   * the layout's template it would come out as *Shellr — … — Shellr*.
   */
  titleAbsolute?: boolean;
  description?: string;
  /** Canonical path (e.g. `/about`) or absolute URL for this page. */
  url?: string;
  /** Open Graph / Twitter image — path under `public/` or absolute URL. */
  ogImage?: string;
  twitterHandle?: string;
  author?: string;
  siteName?: string;
  // No `keywords`. It was dropped from this generator on purpose — every engine
  // that matters has ignored the tag for a decade. See
  // obsidian/frontend/seo-metadata.md.
}

export function generateMetadata({
  title = siteConfig.title,
  titleTemplate,
  titleAbsolute = false,
  description = siteConfig.description,
  url = "/",
  ogImage = siteConfig.ogImage,
  twitterHandle = siteConfig.twitterHandle,
  author = siteConfig.author,
  siteName = siteConfig.name,
}: MetadataProps = {}): Metadata {
  return {
    // Resolves every relative URL below to an absolute one.
    metadataBase: new URL(siteConfig.url),
    // The share cards below always take the plain string; only the document
    // title carries the template, because it is the only one an ancestor can
    // rewrite.
    title: titleTemplate
      ? { default: title, template: titleTemplate }
      : titleAbsolute
        ? { absolute: title }
        : title,
    description,
    applicationName: siteConfig.name,
    authors: [{ name: author }],
    creator: author,
    publisher: author,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName,
      // Declared from the asset's real size — see `siteConfig.ogImageSize`.
      images: [
        {
          url: ogImage,
          width: siteConfig.ogImageSize.width,
          height: siteConfig.ogImageSize.height,
          alt: description,
        },
      ],
      locale: siteConfig.locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: twitterHandle,
      creator: twitterHandle,
      images: [ogImage],
    },
    icons: {
      icon: [
        { url: "/favicon.ico" },
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: [
        { url: "/apple-icon-180x180.png", sizes: "180x180", type: "image/png" },
      ],
    },
    manifest: "/manifest.json",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        // Let Google use the whole share image and the whole snippet rather
        // than its own conservative defaults for a site it has not seen before.
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    // The page is a dark room with phone numbers nowhere in it; iOS turning
    // stray digits in the copy into call links is only ever a false positive.
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: siteConfig.themeColor,
    width: "device-width",
    initialScale: 1,
    // No `maximumScale` / `userScalable: false`. Pinch-zoom is the one way in
    // for anyone who needs the type larger than a 360px design draws it, and
    // taking it away is a WCAG 1.4.4 failure — see
    // obsidian/frontend/design-system.md → "The ladder".
  };
}
