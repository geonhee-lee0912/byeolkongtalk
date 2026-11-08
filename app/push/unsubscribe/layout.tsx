// 메타데이터 전용 레이아웃 — 알림 버튼이 여는 화면이라 검색에 내보내지 않는다.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "광고 알림 수신거부",
  description: "별콩톡 광고 알림 수신거부",
});

export default function PushUnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
