import { Suspense } from "react";
import { noindexMetadata } from "@/lib/seo/metadata";
import DayTabsBridge from "@/components/byeolmaru/DayTabsBridge";

export const metadata = noindexMetadata({
  title: "그날의 흐름 · 별마루",
  description: "그날의 사주·타로·우리를 한 자리에서 볼게.",
});

export default function ByeolmaruDayPage() {
  // 🔴 useSearchParams 를 쓰는 클라 컴포넌트는 Suspense 경계가 필요하다 — 없으면 빌드가
  //    "missing suspense boundary with useSearchParams" 로 실패한다.
  // ⚠️ fallback 에 완전한 뷰를 쓰면 안 된다 — 정적 프리렌더가 fallback 을 셸로 굳혀 그 인스턴스도
  //    마운트→fetch 를 한 번 타고, 이어서 실제 인스턴스가 또 fetch 한다(기존 saju/page.tsx
  //    주석의 실측: 캘린더 4회). 가벼운 로딩 문구로 그 인스턴스 자체가 안 생기게 한다.
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-md p-6 text-center text-text-light">펼치는 중…</main>}>
      <DayTabsBridge />
    </Suspense>
  );
}
