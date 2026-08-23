import { StocksView } from "@/views/stocks";
import { generateMetadata } from "@/utils/seo/generate-page-metadata";

export const metadata = generateMetadata({
  title: "Stock Packs",
  description:
    "Sealed packs that drop tokenized shares instead of memes, routed through Voxelithic's book across every venue on Robinhood Chain. Not live yet.",
  url: "/stocks",
});

export default function Stocks() {
  return <StocksView />;
}
