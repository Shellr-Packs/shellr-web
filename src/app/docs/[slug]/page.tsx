import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DOCS_PAGES, docsPage } from "@/data/mocks/docs";
import { DocsShell } from "@/views/docs";
import { generateMetadata as pageMetadata } from "@/utils/seo/generate-page-metadata";

/**
 * Every docs page but the index.
 *
 * Statically generated from the content itself, so adding a page to
 * `data/mocks/docs.ts` is the whole of adding a page — there is no route to
 * write and no list to keep in step.
 */
export const generateStaticParams = (): Array<{ slug: string }> =>
  DOCS_PAGES.filter((page) => page.slug !== "").map((page) => ({
    slug: page.slug,
  }));

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> => {
  const { slug } = await params;
  const page = docsPage(slug);
  return pageMetadata({
    title: page?.title ?? "Documentation",
    description: page?.description,
    url: `/docs/${slug}`,
  });
};

export default async function DocsSlug({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = docsPage(slug);
  if (!page || page.slug === "") notFound();
  return <DocsShell page={page} />;
}
