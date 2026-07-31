// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata, TITLE_TEMPLATE } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  // 하위 라우트가 있어 template 을 다시 심는다 — 문자열로 두면 자식들이 접미사를 잃는다.
  title: { default: "문의 내역", template: TITLE_TEMPLATE },
  description: "별콩톡에 남긴 문의와 답변을 확인하는 곳이야.",
});

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
