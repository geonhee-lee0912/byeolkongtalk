// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
// robots·canonical 은 /fortune 하위 전체로 상속된다 — 아래 화면들은 title 만 덮어쓴다.
import { noindexMetadata, TITLE_TEMPLATE } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  // 하위 라우트가 있어 template 을 다시 심는다 — 문자열로 두면 자식들이 접미사를 잃는다.
  title: { default: "별콩 운세", template: TITLE_TEMPLATE },
  description: "길게 얘기할 시간 없을 땐 한 장으로. 오늘의 운세부터 궁합·사주 분석까지 리포트로 받아봐.",
});

export default function FortuneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
