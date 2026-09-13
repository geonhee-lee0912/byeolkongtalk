import { noindexMetadata } from "@/lib/seo/metadata";
import TarotTodayView from "@/components/byeolmaru/TarotTodayView";

export const metadata = noindexMetadata({
  title: "오늘 타로 · 별마루",
  description: "카드 한 장으로 오늘을 가볍게 짚어볼게.",
});

export default function TarotTodayPage() {
  return <TarotTodayView />;
}
