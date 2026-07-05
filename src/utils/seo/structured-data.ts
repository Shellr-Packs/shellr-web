/**
 * @fileoverview JSON-LD structured data helpers.
 *
 * Structured data lets search engines understand the site as entities
 * (Organization, WebSite, WebPage) rather than just text — improving rich
 * results. Render the output inside a `<script type="application/ld+json">` tag.
 *
 * Every node is linked by `@id` and every `@id` is an absolute URL built from
 * `siteConfig.url`, which is what lets a crawler see one organisation described
 * in two places rather than two organisations. Nothing in here is invented: a
 * `sameAs` list of social profiles the studio does not have, or an address it
 * has not given, is a structured-data penalty rather than a rich result.
 */

import { siteConfig } from "@/lib/site";

/** The graph's stable identifiers — written once, referenced everywhere. */
export const schemaId = {
  organization: `${siteConfig.url}/#organization`,
  website: `${siteConfig.url}/#website`,
  home: `${siteConfig.url}/#webpage`,
} as const;

/**
 * Organization + WebSite schema for the site root. Emit once, in the root
 * layout. The two nodes are linked by `@id` so crawlers treat them as related.
 */
export function getSiteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": schemaId.organization,
        name: siteConfig.name,
        description: siteConfig.description,
        url: siteConfig.url,
        logo: {
          "@type": "ImageObject",
          url: `${siteConfig.url}/android-icon-192x192.png`,
          width: 192,
          height: 192,
        },
        image: `${siteConfig.url}${siteConfig.ogImage}`,
      },
      {
        "@type": "WebSite",
        "@id": schemaId.website,
        name: siteConfig.name,
        description: siteConfig.description,
        url: siteConfig.url,
        inLanguage: siteConfig.language,
        publisher: { "@id": schemaId.organization },
      },
    ],
  };
}

/**
 * The home page as a `WebPage`, hung off the `WebSite` the layout emits.
 *
 * A page-level node is what carries the title, the share image and the language
 * of *this* URL — the site-level pair above says nothing about any one page. Add
 * one per public route as the site grows, each with its own `@id`.
 */
export function getHomeStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": schemaId.home,
    url: siteConfig.url,
    name: siteConfig.title,
    description: siteConfig.description,
    inLanguage: siteConfig.language,
    isPartOf: { "@id": schemaId.website },
    about: { "@id": schemaId.organization },
    primaryImageOfPage: `${siteConfig.url}${siteConfig.ogImage}`,
  };
}
