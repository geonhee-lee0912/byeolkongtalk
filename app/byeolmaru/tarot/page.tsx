import { Suspense } from "react";
import { noindexMetadata } from "@/lib/seo/metadata";
import TarotDateBridge from "@/components/byeolmaru/TarotDateBridge";

export const metadata = noindexMetadata({
  title: "오늘 타로 · 별마루",
  description: "카드 한 장으로 오늘을 가볍게 짚어볼게.",
});

export default function TarotTodayPage() {
  // 🔴 useSearchParams 를 쓰는 클라 컴포넌트는 Suspense 경계가 필요하다 — 없으면 빌드가
  //    "missing suspense boundary with useSearchParams" 로 실패한다(Next 앱 라우터 규칙).
  // ⚠️ fallback 을 <TarotTodayView /> 로 쓰면 안 된다 — 이 페이지는 정적 프리렌더(○)라 빌드가
  //    fallback 을 정적 셸로 굳히고, 클라에서 실제 자식으로 교체된다. 즉 fallback 이 완전한 뷰면
  //    그 인스턴스도 마운트→useEffect→fetch 를 한 번 타고 바로 이어 실제 인스턴스가 또 fetch 한다
  //    (SajuTodayPage 주석의 실측: /api/byeolmaru/calendar 4회 = 정상 2회의 2배). 가벼운 로딩
  //    문구로 바꿔 그 인스턴스 자체가 안 생기게 한다.
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-md p-6 text-center text-text-light">펼치는 중…</main>}>
      <TarotDateBridge />
    </Suspense>
  );
}
