// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
// robots·canonical 은 /mypage 하위 전체로 상속된다 — 아래 화면들은 title 만 덮어쓴다.
import { noindexMetadata, TITLE_TEMPLATE } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  // 하위 라우트가 있어 template 을 다시 심는다 — 문자열로 두면 자식들이 접미사를 잃는다.
  title: { default: "내 정보", template: TITLE_TEMPLATE },
  description: "내 사주 프로필과 별 잔액, 계정 설정을 관리하는 곳이야.",
});

export default function MypageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
