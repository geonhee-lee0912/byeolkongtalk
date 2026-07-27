// lib/seo/metadata.ts — 콘텐츠 존 페이지 메타데이터 빌더 (순수)
//
// ⚠️ 왜 openGraph/twitter 의 공용 필드(siteName·locale·type·images·card)를 여기서
// 매번 재선언하는가 — Next 는 페이지 metadata 를 루트 layout 과 병합할 때
// `openGraph`/`twitter` 를 **필드별로 합치지 않고 객체 통째로 교체**한다
// (next/dist/docs .../generate-metadata.md "Overwriting fields").
// 즉 페이지에서 `openGraph: { title }` 만 주면 루트의 siteName·locale·type 은 물론
// app/opengraph-image.tsx 파일 컨벤션으로 붙던 og:image 4종까지 조용히 사라진다
// (빌드 산출물로 실증). "중복이니 지우자"는 리팩터가 곧 공유 카드 이미지 소실이므로
// 이 재선언은 의도된 것이다 — 지우지 말 것.
import type { Metadata } from "next";

/** OG 이미지는 app/opengraph-image.tsx 가 만드는 1200×630 PNG 를 그대로 쓴다.
 *  태그 히어로는 4:3·투명 PNG 혼재라 OG 규격에 맞지 않아 후보가 아니다.
 *  alt 는 그 파일의 `export const alt` 와 같은 문자열이어야 한다. */
const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  // 파일 컨벤션이 자동 생성하던 og:image:type 을 손으로 다시 채운다(그 파일의 contentType)
  type: "image/png",
  alt: "별콩톡 - 사주와 타로로 고민을 나누는 친구",
} as const;

export function contentMetadata(opts: {
  title: string;
  description: string;
  /** 사이트 루트 기준 절대 경로(예: "/guide/themes/reunion"). canonical·og:url 공용 */
  path: string;
}): Metadata {
  const { title, description, path } = opts;
  // og:title 에는 title.template 의 "· 별콩톡" 접미사를 붙이지 않는다 —
  // 템플릿은 openGraph.title 에 적용되지 않고, og:site_name 이 따로 나가 중복이 된다.
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "별콩톡",
      locale: "ko_KR",
      type: "website",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}
