"use client";

import { PackOpener } from "@/components/common/packs/pack-opener";
import { PonsPack } from "@/components/common/packs/pons-pack";
import { LazyTvScene, type TvSceneProps } from "@/components/common/scene";
import { usePackSheet } from "@/lib/packs/sheet";

/**
 * The scene and both pack sheets, as one client leaf.
 *
 * Which sheet is open lives in `lib/packs/sheet.ts` rather than here, because
 * the Pons Pack is opened from the hero — a different tree, with
 * `views/home.tsx` between them, and that file stays a Server Component
 * (hard rule #6). Both sheets render here so the arrows can step from one to
 * the other without either of them knowing the other exists.
 */
export const SceneWithPacks = (props: TvSceneProps) => {
  const target = usePackSheet((state) => state.target);
  const open = usePackSheet((state) => state.open);
  const close = usePackSheet((state) => state.close);
  const step = usePackSheet((state) => state.step);

  return (
    <>
      <LazyTvScene
        {...props}
        onPickCase={(name) => open({ kind: "tier", name })}
      />
      <PackOpener
        tier={target?.kind === "tier" ? target.name : null}
        onClose={close}
        onStep={step}
      />
      <PonsPack open={target?.kind === "pons"} onClose={close} onStep={step} />
    </>
  );
};
