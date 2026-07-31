// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
// /relationship 은 app/robots.ts 의 disallow 목록에서 형제 라우트와 달리
// 빠져 있는 유일한 상품 화면이라 색인 대상으로 본다.
import { contentMetadata } from "@/lib/seo/metadata";

export const metadata = contentMetadata({
  title: "연애 상담 — 우리 사이를 계속 이야기하는 곳",
  description:
    "상대를 등록하면 별콩이가 두 사람 사이를 기억해. 재회·썸·권태기까지 한 번의 풀이로 끝나지 않고 이어지는 연애 상담이야.",
  path: "/relationship",
});

export default function RelationshipLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
