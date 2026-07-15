"use client";

import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useScroll } from "@/hooks/smooth-scroll/use-scroll";
import { subscribeToTicker } from "@/lib/animation/ticker";
import { scrollTo } from "@/utils/scroll-to";
import { useShallow } from "zustand/react/shallow";

export const scrollSpeed = { current: 1 };

export function ScrollLayout({ children }: { children: React.ReactNode }) {
  // Server-safe rendering
  return (
    <div className="scroll-layout">
      {/* Static content that can be rendered on server */}
      <div className="scroll-layout-content">{children}</div>

      {/* Client-only functionality */}
      <ScrollController />
    </div>
  );
}

function ScrollController() {
  const isEnableScroll = useScroll((state) => state.isEnableScroll);
  const [hash, setHash] = useState<string>("");
  const [lenis, setLenis] = useScroll(
    useShallow((state) => [state.lenis, state.setLenis]),
  );
  const pathname = usePathname();
  const savedPathname = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
    const lenis = new Lenis({
      smoothWheel: true,
      // Softer than the 0.1 default and a slightly shorter wheel step: this page
      // is eight screens of one continuous shot, and a scroll that arrives in
      // hard steps is a shot that arrives in hard steps. Everything on the page
      // reads its position through one low-pass on top of this
      // (`lib/animation/scroll-progress.ts`), so the two are tuned together.
      lerp: 0.085,
      wheelMultiplier: 0.9,
      // syncTouch: true,
    });
    (window as typeof window & { lenis: Lenis }).lenis = lenis;
    setLenis(lenis);

    // **On the shared ticker, not a loop of its own** — and first in it, because
    // this layout mounts before anything on the page does and the ticker calls
    // its subscribers in the order they arrived. Two independent rAF loops meant
    // Lenis wrote the scroll position in one and everything reading it ran in
    // the other, so on any frame where the order fell the wrong way the page was
    // drawn from last frame's number. One loop, Lenis first, and every reader
    // downstream sees the position it was actually given this frame.
    const off = subscribeToTicker(
      (time) => lenis.raf(time),
      () => 0,
    );

    return () => {
      // Unsubscribe before destroying — otherwise the ticker keeps calling
      // `raf` on a destroyed instance after unmount/HMR.
      off();
      lenis.destroy();
      setLenis(null);
    };
  }, [setLenis]);

  useEffect(() => {
    if (isEnableScroll) {
      lenis?.start();
      enableNativeScroll(true);
    } else {
      lenis?.stop();
      enableNativeScroll(false);
    }
  }, [isEnableScroll, lenis]);

  useEffect(() => {
    if (lenis && hash) {
      setTimeout(() => {
        scrollTo(hash, true);
      }, 300);
    }
  }, [lenis, hash]);

  useEffect(() => {
    if (savedPathname.current !== pathname) {
      savedPathname.current = pathname;
      if (pathname.includes("#")) {
        const hash = pathname.split("#").pop();
        if (hash) {
          setHash(hash);
        }
      }
    }
  }, [pathname, setHash]);

  return null; // This component doesn't render anything visible
}

const enableNativeScroll = (value: boolean) => {
  if (typeof document === "undefined") return;
  if (!document) return;
  const html = document.querySelector("html");
  if (!html) return;
  if (!value) {
    html.style.position = "relative";
    html.style.overflow = "hidden";
    html.style.height = "100%";
  } else {
    html.style.removeProperty("position");
    html.style.removeProperty("overflow");
    html.style.removeProperty("height");
  }
};
