"use client";

// 구매 모듈이 뷰포트에 들어온 순간 1회. "설명을 읽고 내려왔나"를 CTA 점프와 분리해 잰다.
import { useEffect, useRef } from "react";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export default function PurchaseReachedBeacon({ type }: { type: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const sent = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || sent.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !sent.current) {
        sent.current = true;
        trackUiEvent("fortune_landing_purchase_reached", { meta: { type } });
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [type]);

  return <div ref={ref} aria-hidden className="h-px" />;
}
