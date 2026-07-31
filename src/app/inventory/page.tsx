import type { Metadata } from "next";

import { InventoryView } from "@/views/inventory";
import { generateMetadata } from "@/utils/seo/generate-page-metadata";

/**
 * The inventory route.
 *
 * Kept out of the index by hand: the page is one visitor's holdings, and every
 * copy a crawler could reach is empty — the vault lives in the browser. The
 * shared metadata helper has no switch for this, so `robots` is set here rather
 * than adding an option used by one route.
 */
export const metadata: Metadata = {
  ...generateMetadata({
    title: "Inventory",
    description: "The memcoins you have pulled and kept.",
    url: "/inventory",
  }),
  robots: { index: false, follow: true },
};

export default function Inventory() {
  return <InventoryView />;
}
