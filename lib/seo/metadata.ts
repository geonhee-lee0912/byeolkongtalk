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
 *  alt 는 그 파일의 `export const alt` 와 같은 문자열이어야 한다.
 *
 *  ⚠️ 캐시버스터 해시가 없다 — 파일 컨벤션이 자동으로 붙일 때는
 *  `/opengraph-image?<내용해시>` 로 나가지만, 손으로 선언하면 맨 경로가 된다.
 *  해시는 빌드 산출물이라 코드에서 얻을 방법이 없고, 하드코딩하면 이미지를
 *  바꿀 때마다 실제 파일과 어긋난 채 방치될 위험이 더 크다.
 *  → 결과: **app/opengraph-image.tsx 의 디자인을 바꾸면** 루트는 해시가 변해
 *  스크래퍼가 재수집하지만 콘텐츠 존은 URL 이 그대로여서 카카오·페이스북이
 *  구 이미지를 계속 뿌린다. 무효화 대상은 이 URL 하나뿐이니,
 *  이미지를 교체하면 **카카오 캐시 초기화 도구로 한 번 퍼지**하면 된다. */
/** app/opengraph-image.tsx 의 `export const alt` 와 반드시 같은 문자열.
 *  그 파일은 전 페이지 공유 이미지를 만드는 prod 경로라 여기서 import 해가지
 *  않는다(모듈 그래프에 next/og 를 끌어오지 않으려는 쪽이 그 파일이다).
 *  대신 lib/seo/slugs.test.ts 가 두 파일을 대조해 드리프트를 잡는다. */
export const OG_IMAGE_ALT = "별콩톡 - 사주와 타로로 고민을 나누는 친구";

/** app/layout.tsx 의 `title.template` 과 반드시 같은 문자열.
 *  하위 라우트를 가진 세그먼트가 title 을 덮어쓸 때 이 접미사가 끊기지 않게 다시 심는다.
 *  루트에서 import 해 오지 않는 이유는 OG_IMAGE_ALT 와 같다(그쪽이 원본, 여기는 사본) —
 *  드리프트는 lib/seo/slugs.test.ts 가 두 파일 소스를 대조해 잡는다. */
export const TITLE_TEMPLATE = "%s · 별콩톡";

const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  // 파일 컨벤션이 자동 생성하던 og:image:type 을 손으로 다시 채운다(그 파일의 contentType)
  type: "image/png",
  alt: OG_IMAGE_ALT,
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

/** 로그인·결제·상담 진행처럼 검색 결과에 뜨면 안 되는 화면용.
 *
 *  ⚠️ 여기서 `openGraph`/`twitter` 를 **일부러 선언하지 않는다.** Next 는 그 두 키를
 *  선언한 세그먼트에서 객체 통째로 교체하므로(위 주석), 일부만 적으면 루트가 주던
 *  siteName·locale·type 과 app/opengraph-image.tsx 의 og:image 4종이 조용히 날아간다.
 *  키를 아예 빼면 루트 값이 그대로 상속된다 — 카톡 공유는 이 화면들에서도 살아 있어야 하니
 *  그게 맞는 동작이다. "여기도 og 를 채우자"는 손질은 곧 공유 카드 이미지 소실이다.
 *
 *  ⚠️ `canonical: null` 은 자기참조 canonical 을 빼먹은 게 아니라 **명시적 해제**다.
 *  루트 layout 이 `canonical: "/"` 를 선언해 두어서, 하위가 alternates 를 안 주면
 *  이 화면들이 전부 "나는 사실 홈이다"라고 신고한다(실제 결함이었다).
 *  noindex 와 타 페이지 canonical 이 겹치면 구글이 noindex 를 canonical 대상(=홈)으로
 *  옮겨 해석할 수 있어 자기참조보다 해제가 안전하고, 트리 하위로 상속되므로
 *  새 하위 라우트가 layout 을 안 만들어도 홈 canonical 로 되돌아가지 않는다. */
export function noindexMetadata(opts: {
  /** ⚠️ 하위 라우트가 있는 트리 루트(예: /mypage, /tarot)는 평범한 문자열 대신
   *  `{ default, template: TITLE_TEMPLATE }` 를 준다. `title` 을 문자열로 주면 Next 가
   *  그 세그먼트에서 루트 layout 의 title.template 을 끊어버려 자식들만 "· 별콩톡"
   *  접미사를 잃는다(자기 자신은 멀쩡해서 눈에 잘 안 띈다). resolveTitle 은
   *  부모 template 을 `default` 에도 적용하므로 트리 루트 자신의 제목은 그대로다. */
  title: NonNullable<Metadata["title"]>;
  description: string;
}): Metadata {
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: null },
    robots: { index: false, follow: false },
  };
}
