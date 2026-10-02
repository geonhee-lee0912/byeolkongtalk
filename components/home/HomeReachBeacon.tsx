"use client";

// 홈의 어떤 블록이 뷰포트에 들어온 순간 1회. "안 보여서 안 눌렀나 / 봤는데 안 눌렀나"를 가른다.
//
// 왜 필요한가(2026-10-02): 홈은 스크롤 깊이를 전혀 재지 않아, 아래쪽 블록의 저조한 클릭이
// 노출 부족 때문인지 매력 부족 때문인지 구분할 수 없었다. 그래서 자리를 정할 때마다
// 추측에 기대야 했다. 도달과 클릭을 나눠 재면 다음 판단은 데이터로 한다.
// 패턴은 `fortune/landing/PurchaseReachedBeacon` 과 동일.
import { useEffect, useRef } from "react";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export default function HomeReachBeacon({ block }: { block: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const sent = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || sent.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !sent.current) {
        sent.current = true;
        trackUiEvent("home_block_reached", { meta: { block } });
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [block]);

  // 높이 0 — 레이아웃에 영향을 주지 않는 관측 지점
  return <div ref={ref} aria-hidden />;
}
