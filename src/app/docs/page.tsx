import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { docsPage } from "@/data/mocks/docs";
import { DocsShell } from "@/views/docs";
import { generateMetadata as pageMetadata } from "@/utils/seo/generate-page-metadata";

const page = docsPage("");

export const metadata: Metadata = pageMetadata({
  title: page?.title ?? "Documentation",
  description: page?.description,
  url: "/docs",
});

export default function Docs() {
  if (!page) notFound();
  return <DocsShell page={page} />;
}
