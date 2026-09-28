import type { MetadataRoute } from "next";
import { INDEXABLE_FORTUNE_PATHS } from "@/lib/seo/indexable";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://byeolkongtalk.com";

  return {
    rules: [
      {
        userAgent: "*",
        // 🔴 `allow` 는 `disallow` 보다 **경로가 길 때만** 이긴다(robots.txt 최장 일치).
        // `/fortune` 은 트리째 막아 두고, 진열 중인 상품 설명 페이지만 정확한 경로로 되연다.
        // 목록의 원천은 sitemap 과 공유한다(`lib/seo/indexable.ts`) — 한쪽만 늘리면
        // 크롤러가 sitemap 의 URL 을 "차단됨"으로 떨어뜨리고 아무 게이트도 안 잡는다.
        allow: ["/", ...INDEXABLE_FORTUNE_PATHS],
        // 로그인 뒤에서 쓰는 상품·거래 화면은 전부 막는다. 검색 표면은 콘텐츠 존(/guide/**)
        // 하나로 단일화한다 — 지금 병목은 표면이 좁은 게 아니라 이미 만든 31 URL 이
        // 크롤조차 안 되는 것(`Discovered – currently not indexed`)이다.
        disallow: [
          "/api/",
          "/login",
          "/mypage",
          "/readings",
          "/concern",
          "/select",
          "/shop",
          "/fortune",
          "/saju",
          "/tarot",
          // 2026-07-31 추가 — 이 목록에서 유일하게 빠져 있었다(의도가 아니라 누락).
          // 그 탓에 상품 화면 중 /relationship 만 색인 가능한 상태였다.
          "/relationship",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
