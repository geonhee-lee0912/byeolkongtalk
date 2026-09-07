import { noindexMetadata } from "@/lib/seo/metadata";
import WooriTodayView from "@/components/byeolmaru/WooriTodayView";

export const metadata = noindexMetadata({
  title: "우리 오늘 · 별마루",
  description: "그 사람과 나, 오늘 둘 사이의 흐름을 별콩이가 짚어줄게.",
});

export default function WooriTodayPage() {
  return <WooriTodayView />;
}
