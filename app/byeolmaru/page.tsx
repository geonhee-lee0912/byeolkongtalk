import { noindexMetadata } from "@/lib/seo/metadata";
import ByeolmaruView from "@/components/byeolmaru/ByeolmaruView";

// 로그인 게이트 + 전개인화 화면 — noindex 로 뺀다. 루트 layout 의 canonical:"/" 를 상속하면
// 이 화면이 "나는 홈이다"라고 신고하게 된다(실제 결함 사례, lib/seo/metadata.ts 참고).
export const metadata = noindexMetadata({
  title: "별마루",
  description: "오늘부터 한 달, 너에게 맞는 날과 챙길 날을 별콩이가 짚어줄게.",
});

export default function ByeolmaruPage() {
  return <ByeolmaruView />;
}
