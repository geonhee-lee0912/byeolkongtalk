// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
//
// 🔴 비색인이다. `/relationship` 은 로그인 뒤에서 쓰는 상품 화면이라 형제 라우트
// (`/fortune`·`/shop`·`/tarot`·`/saju`·`/readings` …)와 성격이 같다.
// 2026-07-31 이전에는 `app/robots.ts` 의 disallow 목록에서 **이 라우트만 빠져 있었고**,
// 그건 의도가 아니라 누락이었다 — 그날 robots 에 추가하고 여기도 noindex 로 맞췄다.
// 검색 표면은 콘텐츠 존(`/guide/**`)으로 단일화한다. 지금 문제는 표면이 좁은 게 아니라
// 이미 만든 31 URL 이 크롤조차 안 되고 있는 것(`Discovered – currently not indexed`)이라,
// URL 을 늘리면 그 대기열과 경쟁만 시킨다.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "연애 상담",
  description:
    "상대를 등록하면 별콩이가 두 사람 사이를 기억해. 한 번의 풀이로 끝나지 않고 이어지는 연애 상담.",
});

export default function RelationshipLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
