import { BattlesView } from "@/views/battles";
import { generateMetadata } from "@/utils/seo/generate-page-metadata";

export const metadata = generateMetadata({
  title: "Pack Battles",
  description:
    "Open the same packs as another player at the same time. The bigger total by value takes every coin off both sides. Not live yet.",
  url: "/battles",
});

export default function Battles() {
  return <BattlesView />;
}
