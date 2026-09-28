// 색인 대상 `/fortune` 경로의 단일 원천 — `app/sitemap.ts` 와 `app/robots.ts` 가 같이 읽는다.
//
// 🔴 이 파일이 따로 있는 이유: robots 의 `Disallow: /fortune` 은 트리를 통째로 막는다.
//    sitemap 에만 URL 을 올리면 크롤러는 그 20개를 "robots.txt 에 의해 차단됨"으로 떨어뜨리는데,
//    tsc·유닛·build 는 전부 통과하고 화면도 멀쩡해서 Search Console 을 열기 전엔 아무도 모른다
//    (2026-09-28 prod 배포 직전 발견 — 상품 설명 페이지 16태스크가 통째로 무효화될 뻔했다).
//    두 파일이 이 배열 하나를 읽고, `indexable.test.ts` 가 "sitemap 에 오른 건 robots 가 막지
//    않는다"를 계약으로 잠근다.
import { FORTUNE_LIST } from "@/lib/fortune/types";

/** 진열(active) 중인 상품 설명 페이지 + FORTUNE_LIST 에 없는 무료 상품. */
export const INDEXABLE_FORTUNE_PATHS: readonly string[] = [
  ...FORTUNE_LIST.filter((f) => f.active).map((f) => f.href),
  // 공유 토큰(`?t=…`)이 붙은 결과는 페이지가 직접 noindex 를 찍는다 — 크롤을 열어야 그 태그를 읽는다.
  "/fortune/saju-mbti",
];
