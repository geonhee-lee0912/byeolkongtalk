import { Suspense } from "react";
import { noindexMetadata } from "@/lib/seo/metadata";
import WooriSubjectBridge from "@/components/byeolmaru/WooriSubjectBridge";

export const metadata = noindexMetadata({
  title: "우리 오늘 · 별마루",
  description: "그 사람과 나, 오늘 둘 사이의 흐름을 별콩이가 짚어줄게.",
});

export default function WooriTodayPage() {
  // 🔴 useSearchParams 를 쓰는 클라 컴포넌트는 Suspense 경계가 필요하다 — 없으면 빌드가
  //    "missing suspense boundary with useSearchParams" 로 실패한다(Next 앱 라우터 규칙,
  //    app/byeolmaru/saju/page.tsx 와 동일 이유).
  // ⚠️ fallback 을 <WooriTodayView /> 그대로 쓰면 안 된다 — SajuTodayPage 에서 실측된 것과 같은
  //    이유로 fetch 가 두 배가 된다(정적 프리렌더 셸이 fallback 을 굳히고 클라에서 실제 자식으로
  //    교체되며 각각 마운트→fetch). WooriTodayView 의 loading 마크업만 재사용해 그 인스턴스 자체가
  //    안 생기게 한다.
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-md p-6 text-center text-text-light">펼치는 중…</main>}>
      <WooriSubjectBridge />
    </Suspense>
  );
}
