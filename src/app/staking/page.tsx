import { StakingView } from "@/views/staking";
import { generateMetadata } from "@/utils/seo/generate-page-metadata";

export const metadata = generateMetadata({
  title: "Staking",
  description:
    "Stake $SHELLR and earn WETH. Rewards are funded from what the token makes - nothing is minted and no rate is promised.",
  url: "/staking",
});

export default function Staking() {
  return <StakingView />;
}
