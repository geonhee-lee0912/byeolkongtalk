import { noindexMetadata } from "@/lib/seo/metadata";
import SajuTodayView from "@/components/byeolmaru/SajuTodayView";

export const metadata = noindexMetadata({
  title: "오늘 사주 · 별마루",
  description: "오늘부터 한 달, 너에게 맞는 날과 챙길 날을 별콩이가 짚어줄게.",
});

export default function SajuTodayPage() {
  return <SajuTodayView />;
}
