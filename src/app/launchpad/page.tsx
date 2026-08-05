import { LaunchpadView } from "@/views/launchpad";
import { generateMetadata } from "@/utils/seo/generate-page-metadata";

export const metadata = generateMetadata({
  title: "Launchpad",
  description:
    "Launch a coin on Pons, pair it to a Shellr pack, and let its trading volume drop memes to your holders. Not live yet.",
  url: "/launchpad",
});

export default function Launchpad() {
  return <LaunchpadView />;
}
