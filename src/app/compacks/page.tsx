import { CompacksView } from "@/views/compacks";
import { generateMetadata } from "@/utils/seo/generate-page-metadata";

export const metadata = generateMetadata({
  title: "Community packs",
  description:
    "Build a pack from your own memes: add coins by contract, give it a logo and a price. Drafts only - publishing is not live yet.",
  url: "/compacks",
});

export default function Compacks() {
  return <CompacksView />;
}
