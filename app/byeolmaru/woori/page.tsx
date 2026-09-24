import { noindexMetadata } from "@/lib/seo/metadata";
import WooriTodayView from "@/components/byeolmaru/WooriTodayView";

export const metadata = noindexMetadata({
  title: "우리 오늘 · 별마루",
  description: "그 사람과 나, 오늘 둘 사이의 흐름을 별콩이가 짚어줄게.",
});

// 🔴 Suspense 경계가 사라졌다(2026-09-24) — 그건 `?subject=` 를 읽던 useSearchParams 때문에
//    필요했는데, 상대가 한 명이 되며 그 파라미터를 없앴다(WooriSubjectBridge 도 같이 삭제).
//    useSearchParams 를 다시 쓰게 되면 경계도 같이 되살려야 빌드가 통과한다.
export default function WooriTodayPage() {
  return <WooriTodayView />;
}
