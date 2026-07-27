# E1-A 콘텐츠 존 25페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비브랜드 검색 유입 자산 25페이지를 만든다 — 감정 태그 랜딩 10종(`/guide/themes/[tag]`) + 로그인 없는 무료 도구(`/free/daily-card`) + 스프레드 가이드 14종(`/guide/spreads/[slug]`) + 허브·인덱스 + sitemap 확장.

**Architecture:** 콘텐츠 존은 기존 앱과 분리된 `app/(content)/` 라우트 그룹이다. **서버 컴포넌트 + `generateStaticParams`(빌드 타임 정적) + 페이지별 Metadata/JSON-LD**. 에디토리얼 본문은 `data/seo/*.json` 으로 코드와 분리하고, **json 에 항목이 있는 슬러그만 페이지가 생성**된다(thin page 방지 + 배치 발행). 기존 페이지는 `sitemap.ts` 외에 **한 줄도 수정하지 않는다** — 측정 창(day 0 = 2026-07-26) 중 배포하기 위한 조건이다.

**Tech Stack:** Next.js 16 App Router Metadata API, 기존 자산 재사용(`lib/tarot/{cards,spreads}.ts`, `lib/emotions.ts`, `data/tarot_card_data.json`, `public/cards-webp/`).

**스펙:** [2026-07-27-e1-ia-content-hierarchy-design.md](../specs/2026-07-27-e1-ia-content-hierarchy-design.md) §6

**배포 조건 (창 중간 예외):** 신규 URL만 추가 · 기존 화면 무변경 · 마이그레이션 0 · 새 env 0 · 프롬프트 무변경. **홈·푸터 콘텐츠 링크는 이 플랜에 없다** — 플랜 B(d28 이후)로 이관.

**검증 컨벤션:**
- 타입: `npx tsc --noEmit`
- 유닛 테스트: `node --import tsx --test <file>` (기존 `lib/*.test.ts` 와 동일 패턴 — `package.json` 에 `test` 스크립트 없음)
- 빌드: `npm run build` (로그에 생성 페이지 수가 찍힘)
- 렌더: `npm run start` 후 `curl` 로 title/JSON-LD 확인

**구 플랜 관계:** `plans/2026-07-26-seo-content-hub.md` 의 코드 골격을 재활용하되 **발행 순서를 뒤집었고**(태그 랜딩 1순위 / 78장 후순위), **구 플랜 Task 2 Step 2 의 "GuideCta 에 로그인 가드를 걸지 않는다"는 잘못된 가정이라 폐기**했다(Task 2 참조).

---

## 🎨 이미지 제안 프로토콜 (사용자 지시 2026-07-27)

**이미지 목록을 미리 확정하지 않는다.** 슬롯에 도달했을 때 실물 맥락에서 제안하고 승인받는다. 플랜 안의 `【이미지 제안】` 스텝이 그 지점이다.

**제안 형식 — 이 5줄을 반드시 채워서 묻는다**

```
【이미지 제안】 <슬롯 이름>
· 어디에      : <파일:라인 또는 화면 위치>, 실제 표시 크기 <px>
· 포즈·구도   : <별콩이가 무엇을 하고 있는지 / 앵글 / 시선>
· 곁들일 문구 : <이미지와 함께 나갈 카피. 별콩이 톤>
· 산출물      : public/<name>.webp · <비율> · 투명 or 배경 포함
· 크레딧      : 2안 생성 4 + remove_background N (누적 X/72)
→ 진행할까요?  예 / 다른 포즈로 / 이미지 없이 진행
```

**상시 규칙 (모든 이미지 공통)**

| | 규칙 | 근거 |
|---|---|---|
| 캐릭터 일관성 | `nano_banana_pro` + `public/byeolkong-main.png` 를 캐릭터 레퍼런스 media 로 전달 | `specs/2026-07-05-byeolkong-pose-set-design.md` 의 검증된 파이프라인 |
| 스타일 | **플랫 파스텔 일러스트. 3D 인형 스타일 금지.** 크림+라일락+골드 팔레트, 이마 별·후광·귀 장식·펜던트 유지 | 같은 스펙 §스타일 고정 |
| 배경 | 캐릭터 컷은 단색 배경 생성 → `remove_background` → 투명 PNG. 배너용 와이드 컷은 배경 포함 | |
| **파일 포맷** | **WebP, 장당 ≤150KB 목표.** 기존 `byeolkong-*.png` 는 장당 ~1MB(`public/` 41MB)이지만 **신규는 따라가지 않는다** — 콘텐츠 존은 SEO 자산이고 LCP 가 순위 요소다 | |
| 선택 게이트 | 포즈당 **2안 생성 → 사용자 선택** | 포즈셋 스펙 파이프라인 |
| 해상도 | 1k(1024px). `max-w-md`(448px)의 2배라 충분하고 2k 는 낭비 | |
| **크레딧 상한** | 단가 **2크레딧/장**(확인 2026-07-27, 잔액 112). **E2 웹툰 캐러셀용 40 크레딧은 건드리지 않는다.** 누적 소모가 **72** 를 넘길 시점에 사용자에게 알리고 승인받는다 | E2 는 패널 5~8장×2안 = 20~32 + 재시도 |
| 안 만드는 것 | **18~24px 아이콘**(오늘 블록·콘텐츠 카드·카테고리 헤딩) — 그 크기에서 캐릭터가 안 보인다. 이모지/Tabler 유지 | |

**첫 이미지 작업 전 1회만**: `public/byeolkong-main.png` 를 `media_upload` → `media_confirm` 해서 `media_id` 를 확보하고 이 플랜에 기록한다. 이후 모든 생성이 같은 레퍼런스를 재사용해 일관성을 유지한다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `lib/tarot/cards.ts` (수정) | `getAllTarotCards()` export 추가 — 목록 소비자용 |
| `lib/seo/tarot-slugs.ts` (신규) | 카드 id ↔ SEO 슬러그. 순수·클라 안전 |
| `lib/seo/spread-slugs.ts` (신규) | SpreadType ↔ 슬러그(`_`↔`-`) + 역조회 검증 |
| `lib/seo/tags.ts` (신규) | 감정 태그 ↔ 슬러그 10종 |
| `lib/consultation-entry.ts` (신규) | 상담 진입 경로 결정(로그인 가드 포함). 홈과 콘텐츠 존이 공유할 단일 원천 |
| `data/seo/tag-content.json` (신규) | 태그 랜딩 본문 |
| `data/seo/spread-content.json` (신규) | 스프레드 가이드 본문 |
| `data/seo/card-content.json` (신규) | 카드 본문 — **1차에는 빈 객체**(라우트만 존재) |
| `components/seo/GuideCta.tsx` (신규) | 콘텐츠 → 상담 진입 CTA (클라이언트 아일랜드) |
| `app/(content)/guide/layout.tsx` (신규) | 콘텐츠 존 본문 컨테이너 |
| `app/(content)/free/layout.tsx` (신규) | 동일 |
| `app/(content)/guide/page.tsx` (신규) | 허브 목차 — **발행분만** 노출 |
| `app/(content)/guide/themes/[tag]/page.tsx` (신규) | 태그 랜딩 10 |
| `app/(content)/guide/spreads/page.tsx` · `[slug]/page.tsx` (신규) | 스프레드 인덱스 + 상세 14 |
| `app/(content)/guide/tarot-cards/page.tsx` · `[slug]/page.tsx` (신규) | 카드 인덱스 + 상세 — 라우트만, 0 발행 |
| `components/seo/DailyCardDraw.tsx` · `app/(content)/free/daily-card/page.tsx` (신규) | 무료 도구 |
| `app/sitemap.ts` (수정) | 데이터 기반 URL 생성 |

**AppShell 은 콘텐츠 존에도 자동 부착된다 (확인 완료)** — `components/layout/AppShell.tsx:10-14` 의 `HIDE_SHELL_PREFIXES` 는 `/login`·`/admin`·`/start` **3개뿐**이라 `/guide`·`/free` 는 Header+BottomTab 을 자동으로 받는다. 별도 작업이 없다 — cold 트래픽의 제품 진입 경로다.

또한 AppShell 이 콘텐츠 래퍼 div 에 `paddingBottom: calc(4rem + safe-area)` 를 이미 준다(`:32`). 아래 콘텐츠 존 레이아웃의 `pb-10` 은 그 위에 얹히는 것이라 이중 패딩 문제가 아니다. 페이지가 자기 `<main>` 을 소유하는 것도 기존 패턴이다(`app/fortune/page.tsx:35`).

---

### Task 1: 슬러그·데이터 레이어

**Files:**
- Modify: `lib/tarot/cards.ts` (`:59` `getCardCount` 아래)
- Create: `lib/seo/tarot-slugs.ts`, `lib/seo/spread-slugs.ts`, `lib/seo/tags.ts`
- Create: `data/seo/card-content.json`, `data/seo/spread-content.json`, `data/seo/tag-content.json`
- Test: `lib/seo/slugs.test.ts`

- [ ] **Step 1: `lib/tarot/cards.ts` 에 전체 목록 export 추가**

`getCardCount()` 바로 아래(`:59` 뒤)에 삽입:

```ts
/** 전체 78장 (id 오름차순) — SEO 콘텐츠 허브·무료 도구 등 목록 소비자용. */
export function getAllTarotCards(): TarotCard[] {
  return ALL_CARDS;
}
```

- [ ] **Step 2: `lib/seo/tarot-slugs.ts` 생성**

메이저는 `name_en` 케밥(`The Fool`→`the-fool`), 마이너는 `name_en` 이 JSON id 라 슈트+랭크로 변환. `cards.ts:37` 이 `name_en: \`${card.id}\`` 로 넣는 값이 근거.

> ⚠️ **실데이터 확인 결과 (2026-07-27 구현 중 정정)**: 마이너 id 는 숫자 카드만 `W01`~`W10` 이고 **코트 카드는 문자 코드**(`WP`·`WN`·`WQ`·`WK`)다. 구 플랜(`2026-07-26-seo-content-hub.md`)과 이 플랜 초안이 쓴 정규식 `^([WCSP])(\d{2})$` 는 코트 16장을 못 잡아 `wp`·`pn` 같은 쓰레기 슬러그를 만든다. 아래 코드가 정정본이다. 슈트 `P`(pentacles)와 랭크 `P`(page)가 겹치므로 `PP`→`pentacles-page` 케이스를 테스트로 고정한다.

```ts
// lib/seo/tarot-slugs.ts — 카드 id ↔ SEO 슬러그 (순수, 클라이언트 안전)
import { getAllTarotCards, type TarotCard } from "@/lib/tarot/cards";

const SUIT_EN: Record<string, string> = {
  W: "wands",
  C: "cups",
  S: "swords",
  P: "pentacles",
};

// 마이너 랭크 코드 → 영문 랭크명. 숫자 카드는 "01"~"10", 코트 카드는 문자 1개
// (P=page, N=knight, Q=queen, K=king) — data/tarot_card_data.json 의 실제 id 표기.
const RANK_EN: Record<string, string> = {
  "01": "ace", "02": "two", "03": "three", "04": "four", "05": "five",
  "06": "six", "07": "seven", "08": "eight", "09": "nine", "10": "ten",
  P: "page", N: "knight", Q: "queen", K: "king",
};

export function buildCardSlug(card: TarotCard): string {
  // 숫자 부분을 0[1-9]|10 으로 좁힌다 — \d{2} 는 "00"~"99" 를 받는데 RANK_EN 은
  // "01"~"10" 만 정의하므로, 범위가 어긋나면 "wands-undefined" 가 조용히 나간다
  // (tsconfig 에 noUncheckedIndexedAccess 가 없어 타입으로도 안 걸린다).
  const m = card.name_en.match(/^([WCSP])(0[1-9]|10|[PNQK])$/);
  if (m) return `${SUIT_EN[m[1]]}-${RANK_EN[m[2]]}`;
  return card.name_en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const SLUG_TO_CARD = new Map(
  getAllTarotCards().map((c) => [buildCardSlug(c), c])
);

export function findCardBySlug(slug: string): TarotCard | undefined {
  return SLUG_TO_CARD.get(slug);
}

export function getAllCardSlugs(): string[] {
  return [...SLUG_TO_CARD.keys()];
}
```

- [ ] **Step 3: `lib/seo/spread-slugs.ts` 생성**

`SpreadType` 은 14종(`lib/tarot/spreads.ts:8-23`)이고 전부 `_`→`-` 치환으로 왕복한다(`stay_or_go_6` ↔ `stay-or-go-6`).

```ts
// lib/seo/spread-slugs.ts — SpreadType ↔ SEO 슬러그 (순수)
import { SPREAD_INFO, type SpreadType } from "@/lib/tarot/spreads";

export function buildSpreadSlug(type: SpreadType): string {
  return type.replace(/_/g, "-");
}

const SLUG_TO_SPREAD = new Map(
  (Object.keys(SPREAD_INFO) as SpreadType[]).map((t) => [buildSpreadSlug(t), t])
);

export function findSpreadBySlug(slug: string): SpreadType | undefined {
  return SLUG_TO_SPREAD.get(slug);
}

export function getAllSpreadSlugs(): string[] {
  return [...SLUG_TO_SPREAD.keys()];
}
```

- [ ] **Step 4: `lib/seo/tags.ts` 생성 (태그 ↔ 슬러그 10종)**

키는 `lib/emotions.ts:4-16` 의 `EmotionTag` 문자열과 **글자 하나까지 일치**해야 한다(코드베이스 표기는 "궁금해").

```ts
// lib/seo/tags.ts — 감정 태그 ↔ SEO 슬러그 (lib/emotions.ts 태그 체계 v3 와 1:1)
import type { EmotionTag } from "@/lib/emotions";

export const SLUG_TO_TAG: Record<string, EmotionTag> = {
  "his-mind": "걔 속마음이 궁금해",
  "reunion": "재회할 수 있을까",
  "contact-timing": "언제 연락 올까, 타이밍이 궁금해",
  "some": "썸, 이 관계 어떻게 될까",
  "relationship-cooling": "요즘 우리, 예전 같지 않아",
  "new-love": "새로운 인연, 언제쯤 올까",
  "career": "진로·방향이 고민이야",
  "choice": "어떤 선택이 맞을지 모르겠어",
  "work-people": "직장·학교에서 사람이 어려워",
  "free-talk": "그냥 별콩이한테 털어놓고 싶어",
};

export function findTagBySlug(slug: string): EmotionTag | undefined {
  return SLUG_TO_TAG[slug];
}
```

- [ ] **Step 5: 콘텐츠 json 3종 생성 (스키마 + 샘플 1종)**

`data/seo/card-content.json` — **1차에는 빈 객체**. 라우트는 존재하되 발행 페이지 0.

```json
{}
```

`data/seo/tag-content.json` — 키는 태그 슬러그, 값 `{ title, intro, faq: [{q,a}] }`. 샘플 1종:

```json
{
  "reunion": {
    "title": "재회 타로 — 다시 이어질 흐름, 어떻게 보는 걸까",
    "intro": "이별 후에 남는 질문은 결국 하나야 — '끝난 걸까, 아직인 걸까'. 재회 타로는 그 답을 점찍어주는 게 아니라, 두 사람을 갈라놓은 매듭이 뭔지·지금 각자의 마음이 어디를 향하는지·다시 이어진다면 어떤 조건에서인지를 카드로 펼쳐보는 상담이야. 별콩이는 재회 가능성을 무조건 긍정하지도, 말리지도 않아 — 카드가 보여주는 결을 그대로 짚고, 그 위에서 네가 선택할 수 있게 도와줘.",
    "faq": [
      {
        "q": "재회 타로는 몇 장짜리로 보는 게 좋아?",
        "a": "가볍게 흐름만 보려면 쓰리카드, 서로의 몫과 회복 조건까지 깊게 보려면 재회 스프레드(5장)나 재회 심층(7장)이 맞아. 고민이 무거울수록 카드 수가 많은 배열이 매듭을 잘게 나눠서 보여줘."
      },
      {
        "q": "카드가 안 좋게 나오면 어떡해?",
        "a": "타로 카드에 좋고 나쁨은 없어 — 무거운 카드는 '안 된다'가 아니라 지금 결이 무겁다는 신호야. 별콩이는 그 흐름에서 네가 해볼 수 있는 것까지 같이 짚어줘."
      }
    ]
  }
}
```

`data/seo/spread-content.json` — 키는 **SpreadType 원본**(슬러그 아님), 값 `{ whenToUse, howToRead }`. 샘플 1종:

```json
{
  "relationship_5": {
    "whenToUse": "관계 스프레드(5장)는 '나와 그 사람, 지금 어디쯤일까'가 궁금할 때 펼치는 배열이야. 나의 자리와 상대의 자리를 따로 놓고, 서로에 대한 기대 두 장을 마주 보게 배치한 다음 관계의 방향 카드로 매듭을 지어 — 한쪽 마음만이 아니라 두 사람의 온도 차까지 같이 보고 싶을 때 가장 잘 맞아.",
    "howToRead": "포인트는 나와 상대의 자리를 비교해 두 사람의 현재 온도 차를 먼저 보고, 기대 두 장에서 어긋나는 지점을 찾은 뒤, 마지막 방향 카드를 결론이 아니라 '지금 결이 이어지면 향하는 곳'으로 읽는 거야. 방향 카드가 무겁게 나와도 확정이 아니라 지금 흐름의 경고등으로 받아들이면 돼."
  }
}
```

- [ ] **Step 6: 슬러그 유닛 테스트 작성**

Create `lib/seo/slugs.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCardSlug, findCardBySlug, getAllCardSlugs } from "./tarot-slugs.ts";
import { buildSpreadSlug, findSpreadBySlug, getAllSpreadSlugs } from "./spread-slugs.ts";
import { SLUG_TO_TAG, findTagBySlug } from "./tags.ts";
import { getCard } from "../tarot/cards.ts";
import { EMOTION_OPTIONS } from "../emotions.ts";

test("메이저 슬러그 — name_en 케밥", () => {
  assert.equal(buildCardSlug(getCard(0)!), "the-fool");
});

test("마이너 슬러그 — 슈트-랭크", () => {
  assert.equal(buildCardSlug(getCard(22)!), "wands-ace");
});

test("마이너 코트 슬러그 — 문자 랭크 코드(P/N/Q/K), 슈트 P 와 랭크 P 겹침 없이 구분", () => {
  // data/tarot_card_data.json 의 코트 카드 id 는 "W11"~"W14" 가 아니라
  // "WP"/"WN"/"WQ"/"WK" 문자 코드 — 숫자 2자리만 가정하면 78장 중 16장이 깨진다.
  assert.equal(buildCardSlug(getCard(32)!), "wands-page");
  assert.equal(buildCardSlug(getCard(33)!), "wands-knight");
  assert.equal(buildCardSlug(getCard(34)!), "wands-queen");
  assert.equal(buildCardSlug(getCard(35)!), "wands-king");
  assert.equal(buildCardSlug(getCard(74)!), "pentacles-page"); // 슈트 코드 P + 랭크 코드 P
});

test("마이너 56장 — 수트별 id 오름차순이 ace→king 랭크와 값까지 일치", () => {
  // 기대 랭크 순서는 구현(RANK_EN)을 되읽지 않고 여기 독립적으로 적는다 —
  // 되읽으면 두 항목이 전치돼도 자기 자신과 일치해 그냥 통과한다.
  // 유일성·왕복 테스트도 전치를 못 잡는다(전치된 값도 여전히 유일하고 왕복함).
  const EXPECTED_RANKS = [
    "ace", "two", "three", "four", "five", "six", "seven",
    "eight", "nine", "ten", "page", "knight", "queen", "king",
  ];
  // 마이너는 id 22 부터 수트당 14장씩 완드→컵→소드→펜타클 순 (cards.ts getAllCards)
  const SUITS_IN_ID_ORDER = ["wands", "cups", "swords", "pentacles"];

  SUITS_IN_ID_ORDER.forEach((suit, suitIdx) => {
    EXPECTED_RANKS.forEach((rank, rankIdx) => {
      const id = 22 + suitIdx * 14 + rankIdx;
      assert.equal(buildCardSlug(getCard(id)!), `${suit}-${rank}`, `id ${id}`);
    });
  });
});

test("78장 슬러그 전부 유일 + 역조회 일치", () => {
  const slugs = getAllCardSlugs();
  assert.equal(slugs.length, 78);
  assert.equal(new Set(slugs).size, 78);
  for (const s of slugs) assert.ok(findCardBySlug(s), `역조회 실패: ${s}`);
});

test("스프레드 슬러그 14종 왕복", () => {
  const slugs = getAllSpreadSlugs();
  assert.equal(slugs.length, 14);
  for (const s of slugs) {
    const t = findSpreadBySlug(s);
    assert.ok(t, `역조회 실패: ${s}`);
    assert.equal(buildSpreadSlug(t), s);
  }
});

test("태그 슬러그 10종이 EmotionTag 와 정확히 일치", () => {
  const slugs = Object.keys(SLUG_TO_TAG);
  assert.equal(slugs.length, 10);
  const known = new Set(EMOTION_OPTIONS.map((o) => o.tag));
  for (const s of slugs) {
    const tag = findTagBySlug(s);
    assert.ok(tag, `역조회 실패: ${s}`);
    assert.ok(known.has(tag), `EmotionTag 불일치: ${tag}`);
  }
  assert.equal(new Set(Object.values(SLUG_TO_TAG)).size, 10);
});
```

- [ ] **Step 7: 테스트 실행 — 실패 확인**

Run: `node --import tsx --test lib/seo/slugs.test.ts`
Expected: FAIL — `Cannot find module './tarot-slugs.ts'` 또는 `getAllTarotCards is not a function` (Step 1~4 미완 상태에서 먼저 돌렸다면). Step 1~5 를 마친 상태라면 이 단계는 곧바로 PASS 로 넘어가도 된다.

- [ ] **Step 8: 테스트 실행 — 통과 확인**

Run: `node --import tsx --test lib/seo/slugs.test.ts`
Expected: `# pass 7` / `# fail 0`

실패 시: `getCard(22)` 의 실제 `name_en` 을 출력해 기대값을 고친다 — **카드 데이터가 권위**다.

- [ ] **Step 9: 타입 확인 + Commit**

```bash
npx tsc --noEmit
git add lib/tarot/cards.ts lib/seo data/seo
git commit -m "feat(seo): 슬러그 레이어(카드·스프레드·태그) + 콘텐츠 json 스키마"
```

---

### Task 2: 상담 진입 헬퍼 + GuideCta

**Files:**
- Create: `lib/consultation-entry.ts`
- Test: `lib/consultation-entry.test.ts`
- Create: `components/seo/GuideCta.tsx`

**왜 헬퍼를 만드나:** `app/concern/page.tsx:33-41` 은 `sessionStorage["byeolkong:emotion"]` 만 확인하고 **로그인 가드가 없다**. 가드는 `app/page.tsx:70-84` `handleSelect` 안에만 있다. 콘텐츠 존 유입은 정의상 **전부 비로그인**이므로 CTA 가 가드를 반드시 거쳐야 한다. 로직을 두 곳에 복제하면 드리프트하므로 단일 원천으로 뽑는다.

**⚠️ 이 태스크는 `app/page.tsx` 를 수정하지 않는다.** 홈을 헬퍼로 전환하는 것은 플랜 B Task 11 이다(측정 창 규율 — 홈은 퍼널 진입점).

- [ ] **Step 1: 실패 테스트 작성**

Create `lib/consultation-entry.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { consultationEntryPath, EMOTION_KEY } from "./consultation-entry.ts";

test("로그인 상태면 /concern 직행", () => {
  assert.equal(consultationEntryPath(true), "/concern");
});

test("비로그인이면 /login?next=/concern", () => {
  assert.equal(
    consultationEntryPath(false),
    `/login?next=${encodeURIComponent("/concern")}`
  );
});

test("EMOTION_KEY 는 기존 홈이 쓰는 키와 동일", () => {
  assert.equal(EMOTION_KEY, "byeolkong:emotion");
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `node --import tsx --test lib/consultation-entry.test.ts`
Expected: FAIL — `Cannot find module './consultation-entry.ts'`

- [ ] **Step 3: 헬퍼 구현**

Create `lib/consultation-entry.ts`:

```ts
// 상담 진입 경로의 단일 원천.
// app/page.tsx handleSelect 와 콘텐츠 존 GuideCta 가 공유한다.
// ⚠️ app/concern 은 로그인 가드가 없으므로(sessionStorage 만 확인) 가드는 여기가 책임진다.
import type { EmotionTag } from "@/lib/emotions";

/** 홈이 이미 쓰고 있는 세션 키 (app/page.tsx:67 · app/concern/page.tsx:36) */
export const EMOTION_KEY = "byeolkong:emotion";

/** 로그인 여부 → 진입 경로 (순수) */
export function consultationEntryPath(isLoggedIn: boolean): string {
  return isLoggedIn
    ? "/concern"
    : `/login?next=${encodeURIComponent("/concern")}`;
}

/**
 * localStorage 의 byeolkong_user 로 로그인 판정 (클라 전용, 홈과 동일 규칙).
 * 홈(app/page.tsx:81)이 `!user` 로 판정하므로 여기도 truthy 체크여야 한다 —
 * `!== null` 로 두면 falsy 스칼라(0·""·false)가 로그인으로 잡혀 플랜 B Task 12
 * 에서 홈을 이 헬퍼로 교체할 때 조용한 동작 변경이 된다.
 */
export function isLoggedInClient(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(JSON.parse(localStorage.getItem("byeolkong_user") ?? "null"));
  } catch {
    return false;
  }
}

/** 태그를 심고 이동할 경로를 반환 (클라 전용) */
export function beginConsultation(tag: EmotionTag): string {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(EMOTION_KEY, tag);
    } catch {
      /* 프라이빗 모드 등 — 저장 실패해도 진입은 막지 않는다 */
    }
  }
  return consultationEntryPath(isLoggedInClient());
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `node --import tsx --test lib/consultation-entry.test.ts`
Expected: `# pass 3` / `# fail 0`

- [ ] **Step 5: GuideCta 아일랜드 작성**

Create `components/seo/GuideCta.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import type { EmotionTag } from "@/lib/emotions";
import { beginConsultation } from "@/lib/consultation-entry";

/** 콘텐츠 페이지 하단 CTA — 홈 태그 클릭과 동일 진입(로그인 가드 포함). */
export default function GuideCta({
  tag,
  label,
}: {
  tag: EmotionTag;
  label?: string;
}) {
  const router = useRouter();
  return (
    <div className="mt-8 rounded-2xl border border-lilac-mid/40 bg-gradient-to-br from-lilac-soft/60 to-cream-warm p-4 text-center">
      <p className="text-[13.5px] font-bold text-eye-purple leading-snug">
        이 고민, 지금 마음에 있다면
      </p>
      <p className="text-[11.5px] text-text-light mt-1">
        별콩이가 카드를 펼쳐서 너의 이야기로 읽어줄게
      </p>
      <button
        type="button"
        onClick={() => router.push(beginConsultation(tag))}
        className="mt-3 w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
      >
        {label ?? "별콩이에게 물어보기"}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: 타입 확인 + Commit**

```bash
npx tsc --noEmit
git add lib/consultation-entry.ts lib/consultation-entry.test.ts components/seo/GuideCta.tsx
git commit -m "feat(seo): 상담 진입 헬퍼(로그인 가드 단일 원천) + GuideCta 아일랜드"
```

---

### Task 3: 콘텐츠 존 레이아웃 + 태그 랜딩 라우트 (1순위 자산)

**Files:**
- Create: `app/(content)/guide/layout.tsx`
- Create: `app/(content)/free/layout.tsx`
- Create: `app/(content)/guide/themes/[tag]/page.tsx`

- [ ] **Step 1: 공통 레이아웃 2개**

`app/(content)/guide/layout.tsx` — AppShell(Header/BottomTab)은 root layout 이 pathname 기반으로 붙이므로 여기선 본문 컨테이너만:

```tsx
export default function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="w-full max-w-md mx-auto px-5 pt-6 pb-10 animate-fade-in">
      {children}
    </main>
  );
}
```

`app/(content)/free/layout.tsx` — 동일 내용, 함수명만 `FreeLayout`:

```tsx
export default function FreeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="w-full max-w-md mx-auto px-5 pt-6 pb-10 animate-fade-in">
      {children}
    </main>
  );
}
```

- [ ] **Step 2: 태그 랜딩 페이지**

Create `app/(content)/guide/themes/[tag]/page.tsx`. 추천 스프레드는 `TAG_SPREADS[tag]`(`lib/tarot/spreads.ts:148`)에서 오고, **본문이 작성된 스프레드로만 링크**한다(Task 5 전까지 깨진 링크 방지).

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import tagContent from "@/data/seo/tag-content.json";
import spreadContent from "@/data/seo/spread-content.json";
import { SLUG_TO_TAG, findTagBySlug } from "@/lib/seo/tags";
import { buildSpreadSlug } from "@/lib/seo/spread-slugs";
import { SPREAD_INFO, TAG_SPREADS } from "@/lib/tarot/spreads";
import GuideCta from "@/components/seo/GuideCta";

interface TagEntry {
  title: string;
  intro: string;
  faq: { q: string; a: string }[];
}
const CONTENT = tagContent as Record<string, TagEntry>;
const SPREADS_PUBLISHED = spreadContent as Record<string, unknown>;

/** 본문이 작성된 태그만 발행 (thin page 방지 — json 에 항목 추가 = 페이지 발행) */
export function generateStaticParams() {
  return Object.keys(SLUG_TO_TAG)
    .filter((slug) => slug in CONTENT)
    .map((tag) => ({ tag }));
}
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const entry = CONTENT[tag];
  if (!entry) return {};
  return {
    title: entry.title,
    description: entry.intro.slice(0, 120),
    alternates: { canonical: `/guide/themes/${tag}` },
  };
}

export default async function ThemePage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const emotionTag = findTagBySlug(tag);
  const entry = CONTENT[tag];
  if (!emotionTag || !entry) notFound();

  // 본문이 작성된 스프레드만 링크 (배치 발행 중 깨진 링크 방지)
  const spreads = (TAG_SPREADS[emotionTag] ?? []).filter(
    (s) => s in SPREADS_PUBLISHED
  );

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: entry.faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
      <nav className="text-[11px] text-text-light mb-3">
        <Link href="/guide" className="hover:text-eye-purple">
          별콩이의 타로 가이드
        </Link>
        <span className="mx-1">›</span>
        <span>{entry.title.split("—")[0].trim()}</span>
      </nav>

      <h1 className="font-display text-[21px] text-eye-purple leading-snug">
        {entry.title}
      </h1>
      <p className="text-[13.5px] text-eye-purple/90 leading-relaxed mt-4">
        {entry.intro}
      </p>

      {spreads.length > 0 && (
        <>
          <h2 className="text-[15px] font-bold text-eye-purple mt-6 mb-2">
            이 고민에 맞는 스프레드
          </h2>
          <div className="flex flex-col gap-2">
            {spreads.map((s) => (
              <Link
                key={s}
                href={`/guide/spreads/${buildSpreadSlug(s)}`}
                className="text-[13px] font-bold text-lilac-deep bg-white/80 border border-lilac-soft rounded-xl px-3.5 py-2.5 hover:border-lilac-deep/40 transition"
              >
                {SPREAD_INFO[s].label} ({SPREAD_INFO[s].cardCount}장) ›
              </Link>
            ))}
          </div>
        </>
      )}

      <h2 className="text-[15px] font-bold text-eye-purple mt-6 mb-2">
        자주 묻는 질문
      </h2>
      <div className="space-y-3">
        {entry.faq.map((f) => (
          <div key={f.q}>
            <p className="text-[13px] font-bold text-eye-purple">Q. {f.q}</p>
            <p className="text-[13px] text-eye-purple/90 leading-relaxed mt-1">
              {f.a}
            </p>
          </div>
        ))}
      </div>

      <GuideCta tag={emotionTag} label="이 고민 별콩이한테 물어보기" />
    </article>
  );
}
```

- [x] **Step 3: 【이미지 제안】 태그 랜딩 히어로 — ✅승인 2026-07-27**

**결정: 신규 4종만 생성, 나머지 6종은 기존 포즈셋 재활용.**

| 슬러그 | 이미지 | 배경 |
|---|---|---|
| `reunion` | 🆕 `guide-hero-reunion.webp` (21.6KB) | 포함 → `object-cover` |
| `relationship-cooling` | 🆕 `guide-hero-relationship-cooling.webp` (32.0KB) | 포함 |
| `new-love` | 🆕 `guide-hero-new-love.webp` (21.4KB) | 포함 |
| `work-people` | 🆕 `guide-hero-work-people.webp` (32.6KB) | 포함 |
| `his-mind` | 기존 `byeolkong-curious.png` | 투명 → `object-contain` + CSS 그라데이션 |
| `contact-timing` | 기존 `byeolkong-focus.png` | 투명 |
| `some` | 기존 `byeolkong-joy.png` | 투명 |
| `choice` | 기존 `byeolkong-tarot.png` | 투명 |
| `career` | 기존 `byeolkong-saju.png` | 투명 |
| `free-talk` | 기존 `byeolkong-listen.png` | 투명 |

**두 종류가 섞이므로** 슬롯 비율(4:3)은 고정하고 배경 유무를 `lib/seo/tag-hero.ts` 의 `hasBackground` 플래그로 분기한다. 투명 컷은 컨테이너에 라일락 그라데이션을 깔아 신규 4종과 톤을 맞춘다.

**LCP 규율**: `priority` 를 붙이지 않는다 — 첫 화면 LCP 를 h1 텍스트가 잡게 둔다. `sizes="(max-width:448px) 100vw, 448px"`.

**alt 규율 (리뷰 결과 2026-07-27)**: 콘텐츠 존 히어로는 **`alt=""`**(장식)이다. 페이지의 정보는 `<h1>` 과 intro 가 전부 전달하므로 스크린리더 유저가 이미지에서만 얻는 것이 없다 — WCAG 기준 장식 이미지다. `alt="별콩이"` 도 쓰지 않는다(의미 없는 단어를 읽어주는 것이라 빈 alt 보다 나쁨). 근거: 같은 PNG 6종이 이미 `app/not-found.tsx:9`·`app/error.tsx:36`·`app/readings/page.tsx:268` 에서 `alt=""` 로 쓰인다.

**JSON-LD 이스케이프 (필수)**: `dangerouslySetInnerHTML` 의 `__html` 에 `.replace(/</g, "\\u003c")` 를 적용한다. `<script>` 는 raw text 요소라 `type` 과 무관하게 본문의 리터럴 `</script>` 가 태그를 조기 종료시킨다. `JSON.stringify` 는 `<`·`>`·`/` 를 이스케이프하지 않는다. **Task 9·10 에서 본문 22종을 LLM 이 생성하고 사용자는 톤만 검수**하므로(`</script>` 는 검수 항목이 아니다) 손으로 쓴 콘텐츠라는 전제가 곧 깨진다. `<` 는 JSON 파서가 `<` 로 되돌리므로 JSON-LD 유효성에는 영향이 없다.

**금지**: `TAG_SPREADS[emotionTag] ?? []` 류의 도달 불가 폴백. `TAG_SPREADS` 는 닫힌 리터럴 유니온 키의 mapped `Record` 이고 10 멤버 전부 채워져 있어 `undefined` 가 나올 수 없다.

**크레딧 정산**: 생성 9장 = **18 소모**(잔액 112 → 94). 승인은 16이었고 `reunion` 재생성 2장(4)이 초과분 — 최초 프롬프트가 라일락 케이프·리본·별 태그 펜던트를 묘사하지 않아 4종 중 `reunion` 만 캐릭터 시그니처가 빠졌다. **교훈: 프롬프트에 케이프·리본·펜던트·양쪽 귀 태슬·후광을 항목으로 열거해야 한다**(이후 이미지 작업에 적용).

**WebP 예산 결과**: 900×672 · q=88 에서 21~33KB — 목표 150KB 대비 크게 여유. 기존 `byeolkong-*.png`(~1MB) 대비 30~45배 작다.

<details><summary>승인 전 제안 원문</summary>

```
【이미지 제안】 감정 태그 랜딩 히어로 (10종)
· 어디에      : /guide/themes/[tag] h1 위, 가로 전체(max-w-md=448px) · 표시 ~160px 높이
· 포즈·구도   : 태그 감정에 맞는 반신 컷. 예 —
                  reunion(재회)     뒤를 살짝 돌아보는 옆모습, 손에 흐릿한 별 하나
                  relationship-cooling(권태기)  두 개의 별 사이에 앉아 한쪽을 바라봄
                  work-people(인간관계)  여러 작은 별에 둘러싸여 한 발 물러선 자세
· 곁들일 문구 : 없음 — h1 이 이미 검색 쿼리형 제목을 담당. 이미지는 분위기만
· 산출물      : public/guide-hero-<slug>.webp · 4:3 · 배경 포함(연한 라일락 그라데이션)
· 크레딧      : 2안 생성 4 + remove_background 0(배경 포함이라 불필요) × 종수
→ 진행할까요?  예 / 다른 포즈로 / 이미지 없이 진행
```

**⚠️ 제안과 함께 반드시 전달할 트레이드오프**: 이 페이지들은 SEO 자산이고 히어로 이미지는 **LCP 요소**가 된다. 10종 전부 넣으면 40 크레딧이고, 기존 8종 포즈셋 매핑으로 대체하면 0이다(다만 `byeolkong-listen` 이 4번 중복). **일부만 신규 생성하고 나머지는 매핑**하는 절충도 선택지로 함께 제시한다.

</details>

- [ ] **Step 4: 빌드 검증**

Run: `npx tsc --noEmit && npm run build`
Expected: 빌드 성공. 로그에 `/guide/themes/[tag]` 정적 **1페이지**(reunion) 생성.

- [ ] **Step 5: 렌더 검증**

```bash
npm run start &
sleep 3
curl -s localhost:3000/guide/themes/reunion | grep -o "<title>[^<]*</title>"
curl -s localhost:3000/guide/themes/reunion | grep -c "FAQPage"
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/guide/themes/some
```

Expected: title 에 `재회 타로` 포함 / `FAQPage` 1건 / 미발행 슬러그 `some` 은 **404**.
확인 후 서버 종료(`kill %1`).

- [ ] **Step 6: Commit**

```bash
git add "app/(content)"
git commit -m "feat(seo): 콘텐츠 존 레이아웃 + 감정 태그 랜딩 라우트(FAQ JSON-LD + 태그 프리셋 CTA)"
```

---

### Task 4: 무료 도구 — 오늘의 카드 (2순위 자산, 로그인 없음)

**Files:**
- Create: `components/seo/DailyCardDraw.tsx`
- Create: `app/(content)/free/daily-card/page.tsx`

- [ ] **Step 1: 뽑기 아일랜드**

API·비용 0 (정적 데이터만). `card-content.json` 이 비어 있으므로 **키워드 폴백이 1차의 기본 경로**이고, 카드 본문이 발행되면 자동으로 oneLiner + 상세 링크가 붙는다.

Create `components/seo/DailyCardDraw.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import cardContent from "@/data/seo/card-content.json";
import {
  getAllTarotCards,
  getCardImagePath,
  CARD_BACK_IMAGE,
  type TarotCard,
} from "@/lib/tarot/cards";
import { buildCardSlug } from "@/lib/seo/tarot-slugs";

interface Drawn {
  card: TarotCard;
  reversed: boolean;
}
const CONTENT = cardContent as Record<string, { oneLiner?: string }>;

export default function DailyCardDraw() {
  const [drawn, setDrawn] = useState<Drawn | null>(null);

  const draw = () => {
    const cards = getAllTarotCards();
    setDrawn({
      card: cards[Math.floor(Math.random() * cards.length)],
      reversed: Math.random() < 0.3,
    });
  };

  const slug = drawn ? buildCardSlug(drawn.card) : null;
  const keywords = drawn
    ? drawn.reversed
      ? drawn.card.reversed
      : drawn.card.upright
    : [];
  const oneLiner = slug ? CONTENT[slug]?.oneLiner : undefined;

  return (
    <div className="text-center">
      <div className="relative w-[150px] h-[255px] mx-auto rounded-xl overflow-hidden shadow-md">
        <Image
          src={drawn ? getCardImagePath(drawn.card.id) : CARD_BACK_IMAGE}
          alt={drawn ? `${drawn.card.name_kr} 타로 카드` : "타로 카드 뒷면"}
          fill
          sizes="150px"
          className={`object-cover ${drawn?.reversed ? "rotate-180" : ""}`}
        />
      </div>

      {drawn ? (
        <div className="mt-4">
          <p className="text-[16px] font-bold text-eye-purple">
            {drawn.card.name_kr} {drawn.reversed ? "(역방향)" : "(정방향)"}
          </p>
          <p className="text-[13px] text-eye-purple/90 leading-relaxed mt-2">
            {oneLiner ?? `오늘 너에게 온 결 — ${keywords.join(", ")}`}
          </p>
          {slug && CONTENT[slug] && (
            <Link
              href={`/guide/tarot-cards/${slug}`}
              className="inline-block mt-2 text-[12px] font-bold text-lilac-deep"
            >
              이 카드 의미 자세히 보기 ›
            </Link>
          )}
          <button
            type="button"
            onClick={draw}
            className="block mx-auto mt-3 text-[12px] text-text-light underline"
          >
            다시 뽑기
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={draw}
          className="mt-5 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
        >
          오늘의 카드 뽑기 (무료 · 가입 없음)
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 페이지 셸**

Create `app/(content)/free/daily-card/page.tsx`:

```tsx
import type { Metadata } from "next";
import DailyCardDraw from "@/components/seo/DailyCardDraw";
import GuideCta from "@/components/seo/GuideCta";

export const metadata: Metadata = {
  title: "오늘의 타로 카드 한 장 — 무료·가입 없음",
  description:
    "회원가입 없이 바로 뽑는 오늘의 타로 카드. 별콩이가 오늘 너에게 온 카드 한 장의 결을 읽어줄게.",
  alternates: { canonical: "/free/daily-card" },
};

export default function DailyCardPage() {
  return (
    <div>
      <h1 className="font-display text-[22px] text-eye-purple text-center">
        오늘의 타로 카드
      </h1>
      <p className="text-[12.5px] text-text-light mt-1.5 mb-6 text-center leading-relaxed">
        가입 없이, 하루 한 장 — 오늘 너에게 온 카드의 결을 봐줄게.
      </p>
      <DailyCardDraw />
      <GuideCta
        tag="그냥 별콩이한테 털어놓고 싶어"
        label="별콩이랑 더 깊게 보기"
      />
    </div>
  );
}
```

- [ ] **Step 3: 【이미지 제안】 오늘의 카드 화면 별콩이**

```
【이미지 제안】 무료 오늘의 카드 — 안내 일러스트
· 어디에      : /free/daily-card h1 아래, 뽑기 버튼 위 · 표시 ~120px (뽑기 전에만 노출)
· 포즈·구도   : 카드 한 장을 내밀며 살짝 미소, 시선은 정면(유저를 초대하는 앵글).
                기존 byeolkong-tarot.png 는 카드 부채꼴 5장이라 "한 장"과 안 맞음
· 곁들일 문구 : "오늘 너에게 온 한 장, 뽑아볼래?"
· 산출물      : public/free-daily-card.webp · 1:1 · 투명 배경(remove_background)
· 크레딧      : 2안 생성 4 + remove_background N (누적 X/72)
→ 진행할까요?  예 / 다른 포즈로 / 기존 byeolkong-tarot.png 재활용 / 이미지 없이 진행
```

**이 슬롯은 값이 특히 높다** — 이 페이지가 커뮤니티 공유 미끼(스펙 §6-2 2순위)이고, 승인된 이미지는 **OG 이미지로도 재사용**할 수 있다. 다만 OG 는 1200×630 이 필요하니 별건으로 다시 물을 것.

- [ ] **Step 4: 빌드 + 비로그인 동작 검증**

Run: `npx tsc --noEmit && npm run build`
Expected: 빌드 성공, `/free/daily-card` 정적 생성.

```bash
npm run start &
sleep 3
curl -s localhost:3000/free/daily-card | grep -o "<title>[^<]*</title>"
```

Expected: title 에 `오늘의 타로 카드` 포함.

그리고 **시크릿 창(비로그인)** 으로 `localhost:3000/free/daily-card` 를 열어 확인:
- [뽑기] 버튼 → 카드 뒤집힘 + 이름/방향/키워드 표시
- Header + BottomTab 정상 부착
- "이 카드 의미 자세히 보기" 링크는 **안 보여야 함**(card-content.json 이 비어 있음)

- [ ] **Step 5: Commit**

```bash
git add components/seo/DailyCardDraw.tsx "app/(content)/free"
git commit -m "feat(seo): 무료 오늘의 카드 — 로그인 없는 미끼 페이지(API 비용 0)"
```

---

### Task 5: 스프레드 가이드 (3순위 자산) — 상세 + 인덱스

**Files:**
- Create: `app/(content)/guide/spreads/[slug]/page.tsx`
- Create: `app/(content)/guide/spreads/page.tsx`

데이터는 `SPREAD_INFO[type]` = `{type, cardCount, starCost, label, tagline, description, accent}`(`lib/tarot/spreads.ts:34-42`), `getPositionLabels(spread, category, rawTag?)`(`:255`), `getSpreadDescription(spread, category)`(`:322`). 카테고리는 **`"default"`** 를 쓴다 — 가이드 페이지는 특정 고민 맥락이 없고, 두 함수 모두 `default` 키가 타입으로 보장된다.

- [ ] **Step 1: 상세 페이지**

Create `app/(content)/guide/spreads/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import spreadContent from "@/data/seo/spread-content.json";
import { findSpreadBySlug, getAllSpreadSlugs } from "@/lib/seo/spread-slugs";
import {
  SPREAD_INFO,
  getPositionLabels,
  getSpreadDescription,
} from "@/lib/tarot/spreads";
import GuideCta from "@/components/seo/GuideCta";

interface SpreadEntry {
  whenToUse: string;
  howToRead: string;
}
const CONTENT = spreadContent as Record<string, SpreadEntry>;

/** 본문이 작성된 스프레드만 발행 */
export function generateStaticParams() {
  return getAllSpreadSlugs()
    .filter((slug) => {
      const t = findSpreadBySlug(slug);
      return t !== undefined && t in CONTENT;
    })
    .map((slug) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const type = findSpreadBySlug(slug);
  if (!type || !(type in CONTENT)) return {};
  const info = SPREAD_INFO[type];
  return {
    title: `${info.label} 스프레드 보는 법 — 타로 ${info.cardCount}장 배열`,
    description: CONTENT[type].whenToUse.slice(0, 120),
    alternates: { canonical: `/guide/spreads/${slug}` },
  };
}

export default async function SpreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const type = findSpreadBySlug(slug);
  if (!type || !(type in CONTENT)) notFound();

  const info = SPREAD_INFO[type];
  const entry = CONTENT[type];
  const labels = getPositionLabels(type, "default", null);

  return (
    <article>
      <nav className="text-[11px] text-text-light mb-3">
        <Link href="/guide/spreads" className="hover:text-eye-purple">
          스프레드 가이드
        </Link>
        <span className="mx-1">›</span>
        <span>{info.label}</span>
      </nav>

      <h1 className="font-display text-[21px] text-eye-purple leading-snug">
        {info.label} 스프레드 보는 법
      </h1>
      <p className="text-[12px] text-text-light mt-1">
        {info.cardCount}장 배열 · {getSpreadDescription(type, "default")}
      </p>

      <section className="space-y-5 text-[13.5px] text-eye-purple/90 leading-relaxed mt-5">
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">
            언제 펼치는 배열일까
          </h2>
          <p>{entry.whenToUse}</p>
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">
            포지션 읽는 순서
          </h2>
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            {labels.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
          <p className="mt-3">{entry.howToRead}</p>
        </div>
      </section>

      <GuideCta
        tag="걔 속마음이 궁금해"
        label="이 스프레드로 상담 받기"
      />
    </article>
  );
}
```

- [ ] **Step 2: 인덱스 페이지**

Create `app/(content)/guide/spreads/page.tsx` — 발행분만 카드 수 오름차순으로:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import spreadContent from "@/data/seo/spread-content.json";
import { buildSpreadSlug } from "@/lib/seo/spread-slugs";
import { SPREAD_INFO, type SpreadType } from "@/lib/tarot/spreads";

export const metadata: Metadata = {
  title: "타로 스프레드 가이드 — 배열별로 언제·어떻게 보는지",
  description:
    "원카드부터 7장 심층 배열까지, 각 스프레드를 언제 펼치고 어떤 순서로 읽는지 별콩이가 정리했어.",
  alternates: { canonical: "/guide/spreads" },
};

const CONTENT = spreadContent as Record<string, unknown>;

export default function SpreadsIndex() {
  const published = (Object.keys(SPREAD_INFO) as SpreadType[])
    .filter((t) => t in CONTENT)
    .sort((a, b) => SPREAD_INFO[a].cardCount - SPREAD_INFO[b].cardCount);

  return (
    <div>
      <h1 className="font-display text-[22px] text-eye-purple">
        타로 스프레드 가이드
      </h1>
      <p className="text-[12.5px] text-text-light mt-1.5 leading-relaxed">
        몇 장을 펼치느냐에 따라 보이는 게 달라져 — 배열별로 언제 쓰는지
        정리해뒀어.
      </p>
      <div className="flex flex-col gap-2.5 mt-5">
        {published.map((t) => (
          <Link
            key={t}
            href={`/guide/spreads/${buildSpreadSlug(t)}`}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-3.5 border border-lilac-soft hover:border-lilac-deep/40 transition"
          >
            <p className="text-[14px] font-bold text-eye-purple">
              {SPREAD_INFO[t].label}{" "}
              <span className="text-[11.5px] font-normal text-text-light">
                {SPREAD_INFO[t].cardCount}장
              </span>
            </p>
            <p className="text-[11.5px] text-text-light mt-0.5 leading-snug">
              {SPREAD_INFO[t].tagline}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 빌드 + 렌더 검증**

Run: `npx tsc --noEmit && npm run build`
Expected: `/guide/spreads` + `/guide/spreads/[slug]` 정적 **1페이지**(relationship-5) 생성.

```bash
npm run start &
sleep 3
curl -s localhost:3000/guide/spreads/relationship-5 | grep -o "<title>[^<]*</title>"
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/guide/spreads/one-card
```

Expected: title 에 `관계 스프레드 스프레드 보는 법` 형태로 `관계 스프레드` 포함 / 미발행 `one-card` 는 **404**.

> ⚠️ **실측 확인 (2026-07-27)**: `label` **3종이 이미 "스프레드"로 끝난다** — `관계 스프레드`·`재회 스프레드`·`가능성 스프레드`. 그래서 `"관계 스프레드 스프레드 보는 법"` 이 된다. 하지만 `원카드`·`쓰리카드` 처럼 "스프레드"가 없는 label 에서 그 단어를 빼면 SEO 키워드("타로 스프레드")를 잃는다 → **조건부로 중복만 제거**한다:
> ```ts
> /** label 이 이미 "스프레드"를 포함하는 3종에서 "스프레드 스프레드" 중복을 막는다 */
> const spreadTitle = (label: string) =>
>   label.includes("스프레드") ? `${label} 보는 법` : `${label} 스프레드 보는 법`;
> ```
> `generateMetadata` 의 `title` 과 페이지 `<h1>` **둘 다** 적용.

> ✅ **검증된 것**: `getPositionLabels(type,"default",null).length === SPREAD_INFO[type].cardCount` 가 **14종 전부 일치**한다(전수 확인). 포지션 목록이 카드 수와 어긋나는 페이지는 없다.

**CTA 태그는 스프레드별로 매핑한다** — 초안은 전 스프레드를 `"걔 속마음이 궁금해"` 로 고정했는데, `reunion_5`·`healing_6` 같은 페이지에서 어긋난다. 전환 페이지라 이 불일치는 실제 손실이다. `TAG_SPREADS`(`lib/tarot/spreads.ts:148`) 역인덱싱으로 각 스프레드가 어느 태그의 **시그니처 배열**(그 태그 목록 index 3·4 = 전용)인지 확인해 확정했다. 10종은 단일 시그니처라 명확하고, 4종(`relationship_5`·`deep_feelings_5`·`potential_7`·`stay_or_go_6`)은 복수라 의미로 골랐다. `one/two/three_card` 는 10태그 공용이므로 중립 태그.

`Record<SpreadType, EmotionTag>` 로 타이핑해 14종을 강제한다 — `Partial` 이나 인덱스 시그니처로 느슨하게 만들면 안전망이 사라진다. 상수는 소비자가 1곳이므로 `lib/` 로 뽑지 않고 페이지 안에 둔다.

- [ ] **Step 4: Commit**

```bash
git add "app/(content)/guide/spreads"
git commit -m "feat(seo): 스프레드 가이드 상세·인덱스 — 포지션 라벨 재사용, 발행분만 노출"
```

---

### Task 6: 카드 도감 라우트 (4순위 — 라우트만, 발행 0)

**Files:**
- Create: `app/(content)/guide/tarot-cards/[slug]/page.tsx`
- Create: `app/(content)/guide/tarot-cards/page.tsx`

**왜 지금 만드나:** `card-content.json` 이 비어 있어 **생성 페이지는 0장**이다. 그래도 라우트를 지금 두면 ①`DailyCardDraw` 의 조건부 링크가 본문 발행 즉시 작동 ②78장을 채울 때 스캐폴딩 작업이 다시 필요 없다. 비용은 파일 2개다.

- [ ] **Step 1: 상세 페이지**

Create `app/(content)/guide/tarot-cards/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import cardContent from "@/data/seo/card-content.json";
import {
  findCardBySlug,
  buildCardSlug,
  getAllCardSlugs,
} from "@/lib/seo/tarot-slugs";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import GuideCta from "@/components/seo/GuideCta";

interface CardEntry {
  intro: string;
  uprightLove: string;
  reversedLove: string;
  advice: string;
  oneLiner: string;
}
const CONTENT = cardContent as Record<string, CardEntry>;

/** 본문이 작성된 카드만 발행 (1차에는 0장) */
export function generateStaticParams() {
  return getAllCardSlugs()
    .filter((slug) => slug in CONTENT)
    .map((slug) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = findCardBySlug(slug);
  const entry = CONTENT[slug];
  if (!card || !entry) return {};
  return {
    title: `${card.name_kr} 카드 의미 — 정방향·역방향 연애 타로`,
    description: `${entry.oneLiner} ${entry.intro.slice(0, 90)}`,
    alternates: { canonical: `/guide/tarot-cards/${slug}` },
  };
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = findCardBySlug(slug);
  const entry = CONTENT[slug];
  if (!card || !entry) notFound();

  const prev = getCard(card.id - 1);
  const next = getCard(card.id + 1);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `${card.name_kr} 카드 의미 — 정방향·역방향`,
            author: { "@type": "Organization", name: "별콩톡" },
            image: `https://byeolkongtalk.com${getCardImagePath(card.id)}`,
          }),
        }}
      />
      <nav className="text-[11px] text-text-light mb-3">
        <Link href="/guide/tarot-cards" className="hover:text-eye-purple">
          타로 카드 도감
        </Link>
        <span className="mx-1">›</span>
        <span>{card.name_kr}</span>
      </nav>

      <h1 className="font-display text-[22px] text-eye-purple leading-snug">
        {card.name_kr} 카드 의미
      </h1>
      <p className="text-[12px] text-text-light mt-1">
        정방향 · 역방향 · 연애 타로 해석
      </p>

      <div className="relative w-[140px] h-[238px] mx-auto my-5 rounded-xl overflow-hidden shadow-md">
        <Image
          src={getCardImagePath(card.id)}
          alt={`${card.name_kr} 타로 카드`}
          fill
          sizes="140px"
          className="object-cover"
        />
      </div>

      <section className="space-y-5 text-[13.5px] text-eye-purple/90 leading-relaxed">
        <p>{entry.intro}</p>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">
            정방향 — 연애에서는
          </h2>
          <p>{entry.uprightLove}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {card.upright.map((k) => (
              <span
                key={k}
                className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
              >
                #{k}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">
            역방향 — 연애에서는
          </h2>
          <p>{entry.reversedLove}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {card.reversed.map((k) => (
              <span
                key={k}
                className="text-[11px] font-bold text-text-light bg-cream-warm px-2 py-0.5 rounded-full border border-lilac-soft"
              >
                #{k}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">
            별콩이의 한마디
          </h2>
          <p>{entry.advice}</p>
        </div>
      </section>

      <GuideCta tag="걔 속마음이 궁금해" />

      <nav className="flex justify-between mt-6 text-[12px] text-lilac-deep font-bold">
        {prev && buildCardSlug(prev) in CONTENT ? (
          <Link href={`/guide/tarot-cards/${buildCardSlug(prev)}`}>
            ‹ {prev.name_kr}
          </Link>
        ) : (
          <span />
        )}
        {next && buildCardSlug(next) in CONTENT ? (
          <Link href={`/guide/tarot-cards/${buildCardSlug(next)}`}>
            {next.name_kr} ›
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}
```

- [ ] **Step 2: 인덱스 페이지 (발행 0이면 안내 문구)**

Create `app/(content)/guide/tarot-cards/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import cardContent from "@/data/seo/card-content.json";
import { getAllTarotCards } from "@/lib/tarot/cards";
import { buildCardSlug } from "@/lib/seo/tarot-slugs";

export const metadata: Metadata = {
  title: "타로 카드 의미 도감 — 78장 정방향·역방향",
  description:
    "메이저 아르카나 22장과 마이너 아르카나 56장의 의미를 연애 맥락으로 풀어낸 별콩이의 타로 도감.",
  alternates: { canonical: "/guide/tarot-cards" },
};

const CONTENT = cardContent as Record<string, unknown>;

const GROUPS: { title: string; from: number; to: number }[] = [
  { title: "메이저 아르카나", from: 0, to: 21 },
  { title: "완드 (불)", from: 22, to: 35 },
  { title: "컵 (물)", from: 36, to: 49 },
  { title: "소드 (바람)", from: 50, to: 63 },
  { title: "펜타클 (흙)", from: 64, to: 77 },
];

export default function TarotCardsIndex() {
  const published = getAllTarotCards().filter(
    (c) => buildCardSlug(c) in CONTENT
  );

  return (
    <div>
      <h1 className="font-display text-[22px] text-eye-purple">
        타로 카드 의미 도감
      </h1>
      <p className="text-[12.5px] text-text-light mt-1.5 leading-relaxed">
        78장의 카드가 연애에서 어떤 결을 보여주는지, 별콩이가 한 장씩
        풀어놨어.
      </p>

      {published.length === 0 ? (
        <p className="text-[12.5px] text-text-light mt-6 leading-relaxed">
          카드 풀이는 지금 한 장씩 쓰고 있어. 먼저{" "}
          <Link href="/free/daily-card" className="font-bold text-lilac-deep">
            오늘의 카드
          </Link>
          를 뽑아볼래?
        </p>
      ) : (
        GROUPS.map((g) => {
          const cards = published.filter(
            (c) => c.id >= g.from && c.id <= g.to
          );
          if (cards.length === 0) return null;
          return (
            <section key={g.title} className="mt-6">
              <h2 className="text-[14px] font-bold text-eye-purple mb-2">
                {g.title}
              </h2>
              <div className="flex flex-wrap gap-2">
                {cards.map((c) => (
                  <Link
                    key={c.id}
                    href={`/guide/tarot-cards/${buildCardSlug(c)}`}
                    className="text-[12px] font-bold text-lilac-deep bg-white/80 border border-lilac-soft rounded-full px-3 py-1.5 hover:border-lilac-deep/40 transition"
                  >
                    {c.name_kr}
                  </Link>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 3: 빌드 검증**

Run: `npx tsc --noEmit && npm run build`
Expected: 빌드 성공. `/guide/tarot-cards` 정적 1페이지 · `/guide/tarot-cards/[slug]` **0페이지**(json 이 비어 있으므로 정상).

- [ ] **Step 4: Commit**

```bash
git add "app/(content)/guide/tarot-cards"
git commit -m "feat(seo): 카드 도감 라우트 스캐폴딩 — 본문 발행 시 자동 생성(현재 0장)"
```

---

### Task 7: `/guide` 허브 — 발행분만 노출

**Files:**
- Create: `app/(content)/guide/page.tsx`

허브는 **B 플랜의 홈 콘텐츠 카드가 가리킬 대상**이다. 그래서 발행되지 않은 섹션은 아예 감춰야 한다 — 78장 도감이 비어 있는 채로 홈에서 링크되면 빈 페이지로 착지한다.

- [ ] **Step 1: 허브 페이지**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import tagContent from "@/data/seo/tag-content.json";
import spreadContent from "@/data/seo/spread-content.json";
import cardContent from "@/data/seo/card-content.json";

export const metadata: Metadata = {
  title: "별콩이의 타로 가이드 — 고민별 타로·스프레드·무료 카드",
  description:
    "재회·짝사랑·썸 같은 고민별 타로 가이드와 스프레드 보는 법을 별콩이가 정리했어. 오늘의 카드는 가입 없이 무료.",
  alternates: { canonical: "/guide" },
};

const THEMES = tagContent as Record<string, { title: string }>;
const SPREADS = spreadContent as Record<string, unknown>;
const CARDS = cardContent as Record<string, unknown>;

export default function GuideHome() {
  const hubs = [
    {
      href: "/free/daily-card",
      title: "오늘의 카드",
      desc: "가입 없이 한 장, 무료",
      show: true,
    },
    {
      href: "/guide/spreads",
      title: "스프레드 가이드",
      desc: "배열별로 언제·어떻게 보는지",
      show: Object.keys(SPREADS).length > 0,
    },
    {
      href: "/guide/tarot-cards",
      title: "타로 카드 도감",
      desc: "78장의 의미, 연애 맥락으로",
      show: Object.keys(CARDS).length > 0,
    },
  ].filter((h) => h.show);

  return (
    <div>
      <h1 className="font-display text-[22px] text-eye-purple">
        별콩이의 타로 가이드
      </h1>
      <p className="text-[12.5px] text-text-light mt-1.5 leading-relaxed">
        카드가 처음이어도 괜찮아 — 고민별로 무엇을 어떻게 보는지 차근차근
        정리해뒀어.
      </p>

      <div className="flex flex-col gap-2.5 mt-5">
        {hubs.map((h) => (
          <Link
            key={h.href}
            href={h.href}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-3.5 border border-lilac-soft hover:border-lilac-deep/40 transition"
          >
            <p className="text-[14px] font-bold text-eye-purple">{h.title}</p>
            <p className="text-[11.5px] text-text-light mt-0.5">{h.desc}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-[14px] font-bold text-eye-purple mt-6 mb-2">
        고민별 타로 가이드
      </h2>
      <div className="flex flex-wrap gap-2">
        {Object.entries(THEMES).map(([slug, t]) => (
          <Link
            key={slug}
            href={`/guide/themes/${slug}`}
            className="text-[12px] font-bold text-lilac-deep bg-white/80 border border-lilac-soft rounded-full px-3 py-1.5 hover:border-lilac-deep/40 transition"
          >
            {t.title.split("—")[0].trim()}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 【이미지 제안】 가이드 허브 히어로**

```
【이미지 제안】 /guide 허브 히어로
· 어디에      : /guide h1 위 · 표시 ~140px. 콘텐츠 존의 얼굴
· 포즈·구도   : 책(또는 펼친 두루마리)과 카드를 함께 든 안내자 포즈, 정면 반신.
                기존 byeolkong-saju.png(두루마리)·byeolkong-tarot.png(카드)를
                합친 성격 — "가이드"라는 정체를 한 컷으로
· 곁들일 문구 : "카드가 처음이어도 괜찮아" (기존 소개 문구와 이어짐)
· 산출물      : public/guide-hub-hero.webp · 4:3 · 배경 포함(연한 크림→라일락)
· 크레딧      : 2안 생성 4 (누적 X/72)
→ 진행할까요?  예 / 다른 포즈로 / 기존 byeolkong-tarot.png 재활용 / 이미지 없이 진행
```

- [ ] **Step 3: 빌드 + 렌더 검증**

```bash
npx tsc --noEmit && npm run build && npm run start &
sleep 3
curl -s localhost:3000/guide | grep -c "타로 카드 도감"
```

Expected: **0** — `card-content.json` 이 비어 있으므로 도감 카드가 렌더되지 않아야 한다. `스프레드 가이드`는 1건 나온다.

- [ ] **Step 4: Commit**

```bash
git add "app/(content)/guide/page.tsx"
git commit -m "feat(seo): 가이드 허브 — 발행분만 노출(빈 섹션 자동 숨김)"
```

---

### Task 8: sitemap 데이터 생성 + robots 검증

**Files:**
- Modify: `app/sitemap.ts` (전체 교체)

**robots.ts 는 수정하지 않는다** — `/guide`·`/free` 는 disallow 목록에 없어 자동 허용이다(스펙 §6-1).

- [ ] **Step 1: sitemap 교체**

`app/sitemap.ts` 전체를 아래로 교체(기존 4개 항목은 그대로 유지하고 콘텐츠 항목을 추가):

```ts
import type { MetadataRoute } from "next";
import tagContent from "@/data/seo/tag-content.json";
import spreadContent from "@/data/seo/spread-content.json";
import cardContent from "@/data/seo/card-content.json";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://byeolkongtalk.com";
  const lastModified = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified, changeFrequency: "weekly", priority: 1.0 },
    { url: `${baseUrl}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/refund`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];

  const hubEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/guide`, lastModified, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/free/daily-card`, lastModified, changeFrequency: "daily", priority: 0.8 },
  ];
  if (Object.keys(spreadContent).length > 0) {
    hubEntries.push({
      url: `${baseUrl}/guide/spreads`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  if (Object.keys(cardContent).length > 0) {
    hubEntries.push({
      url: `${baseUrl}/guide/tarot-cards`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  const contentEntries: MetadataRoute.Sitemap = [
    ...Object.keys(tagContent).map((slug) => ({
      url: `${baseUrl}/guide/themes/${slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...Object.keys(spreadContent).map((key) => ({
      url: `${baseUrl}/guide/spreads/${key.replace(/_/g, "-")}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...Object.keys(cardContent).map((slug) => ({
      url: `${baseUrl}/guide/tarot-cards/${slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return [...staticEntries, ...hubEntries, ...contentEntries];
}
```

- [ ] **Step 2: 검증 — URL 수 + 개인 결과 혼입 확인 (스펙 §8-3, §8-4)**

```bash
npm run build && npm run start &
sleep 3
curl -s localhost:3000/sitemap.xml | grep -c "<loc>"
curl -s localhost:3000/sitemap.xml | grep -Ec "/readings|/mypage|/tarot/reading|/saju/reading|/fortune/result|/shop|/concern"
curl -s localhost:3000/robots.txt
```

Expected:
- `<loc>` 수 = **9** — static 4(`/`·terms·privacy·refund) + hub 3(`/guide`·`/free/daily-card`·`/guide/spreads`) + 태그 1(reunion) + 스프레드 1(relationship-5). 도감 인덱스·카드 상세는 `card-content.json` 이 비어 제외
- 개인 결과 경로 매칭 = **0** — 하나라도 걸리면 즉시 제거(색인 사고)
- `robots.txt` 에 `/guide`·`/free` disallow 가 **없어야** 한다

- [ ] **Step 3: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat(seo): sitemap 데이터 기반 생성 — 발행분만 자동 등재"
```

---

### Task 9: 본문 배치 발행 ① — 감정 태그 랜딩 10종 【사용자 검수 게이트】

**Files:**
- Modify: `data/seo/tag-content.json`

**이 태스크는 코드가 아니라 에디토리얼 작업이다.** 플레이스홀더가 아니라, 아래 제약이 산출물의 명세다. Task 1 Step 5 의 `reunion` 항목이 **완성 예시**이므로 그 밀도·톤을 기준으로 삼는다.

**작성 제약**
- 스키마: `{ title, intro, faq: [{q,a}] }`. `faq` 는 항목당 **2~3개**
- `title` = **검색 쿼리형**. 아래 표의 제목을 그대로 쓴다
- `intro` = **250~400자**, 별콩이 톤(반말, 1인칭 `별콩이는`, 2인칭 `너`)
- `faq.a` = 항목당 80~200자
- **금지**: 단정적 예언("~할 거야", "반드시", "확실히"), 불안 자극, 운명론적 협박, 기한 확언("2주 안에")
- **권장 어미**: "~한 흐름이야", "~할 가능성이 열려", "내가 보기엔"
- 근거 소스: `lib/emotions.ts` 의 `EMOTION_OPTIONS[].description`·`hashtags` + `TAG_SPREADS[tag]` 의 추천 배열

**제목 10종 (확정)**

| 슬러그 | title |
|---|---|
| `reunion` | 재회 타로 — 다시 이어질 흐름, 어떻게 보는 걸까 ✅Task 1 완료 |
| `his-mind` | 짝사랑 타로 — 걔 속마음, 카드로 보는 법 |
| `contact-timing` | 연락운 타로 — 언제 연락이 올까, 타이밍 보는 법 |
| `some` | 썸 타로 — 이 관계가 어디로 갈지 보는 법 |
| `relationship-cooling` | 권태기 타로 — 예전 같지 않은 우리, 어떻게 볼까 |
| `new-love` | 새로운 인연 타로 — 언제 어떤 사람이 올까 |
| `career` | 진로 타로 — 방향이 안 보일 때 카드로 짚는 법 |
| `choice` | 선택 타로 — 어떤 길이 맞을지 고를 때 |
| `work-people` | 인간관계 타로 — 직장·학교에서 사람이 어려울 때 |
| `free-talk` | 마음 털어놓기 — 정리 안 된 고민도 괜찮아 |

- [ ] **Step 1: 배치 초안 작성 (9종 추가)**

`data/seo/tag-content.json` 에 위 표의 9종을 추가한다. 슬러그 키는 `lib/seo/tags.ts` 의 `SLUG_TO_TAG` 키와 **정확히 일치**해야 한다.

- [ ] **Step 2: 【게이트】 사용자 톤 검수**

사용자에게 9종 본문을 제시하고 확인받는다. 체크 항목:
- 단정적 예언 표현 0건
- 별콩이 반말 톤 일관
- 제목이 검색 쿼리와 자연스러운지

**사용자 승인 없이 Step 3 으로 진행하지 않는다.**

- [ ] **Step 3: 빌드 검증**

```bash
npx tsc --noEmit && npm run build
```
Expected: `/guide/themes/[tag]` 정적 **10페이지** 생성.

```bash
npm run start &
sleep 3
for s in his-mind contact-timing some relationship-cooling new-love career choice work-people free-talk; do
  curl -s -o /dev/null -w "$s %{http_code}\n" localhost:3000/guide/themes/$s
done
```
Expected: 9줄 전부 `200`.

- [ ] **Step 4: Commit**

```bash
git add data/seo/tag-content.json
git commit -m "content(seo): 감정 태그 랜딩 본문 10종 — 검색 쿼리형 제목 + FAQ"
```

---

### Task 10: 본문 배치 발행 ② — 스프레드 가이드 14종 【사용자 검수 게이트】

**Files:**
- Modify: `data/seo/spread-content.json`

## ⚠️ 이 태스크의 브리프가 바뀌었다 (2026-07-27 SERP 확인 결과)

웹 검색으로 실제 SERP 를 확인한 결과 **스프레드 이름 14종 중 11종은 검색어가 아니다** — 우리가 붙인 상품명이다.

| 검색어가 되는 것 | 우리 상품명일 뿐인 것 |
|---|---|
| `원카드` · `투카드` · `쓰리카드` (경쟁 글들이 전부 다룸) | 관계 스프레드 · 속마음 심층 · 재회 스프레드 · 재회 심층 · 가능성 스프레드 · 관계 체크인 · 계속? 그만? · 새 인연 찾기 · 새 사랑 준비도 · 마음 치유 · 마음 차크라 **(11종)** |

*"재회 심층 스프레드 보는 법"* 을 검색하는 사람은 없다. 경쟁 글이 다루는 표준 배열은 원카드·쓰리카드·**켈틱크로스**이고, 켈틱크로스는 우리가 팔지 않으므로 다루지 않는다(억지로 넣으면 상품과 콘텐츠가 어긋난다).

**→ 11종의 역할 재정의**: 직접 검색 자산이 아니라 ①**태그 랜딩의 내부 링크 대상**(태그 랜딩은 "재회 타로" 처럼 실제 검색량이 있다) ②**전환 보조**(태그 랜딩에서 넘어온 사람이 배열을 고르고 구매) ③도메인 주제 깊이.

**→ 작성 방향**: 키워드를 심는 글이 아니라 **"이 배열이 네 고민에 맞는 이유"를 짧고 설득적으로.** 태그 랜딩에서 넘어온 독자를 전제로 쓴다. `원카드`·`투카드`·`쓰리카드` 3종만 검색 유입을 상정해 조금 더 설명적으로.

**검증 한계**: 확인한 것은 **SERP 구성과 경쟁 글의 어휘**다. 검색량 자체는 키워드 툴이 없어 미확인 — 강한 추론이지 실측이 아니다. Task 11 배포 후 서치콘솔 노출 쿼리로 확인한다.

**작성 제약**
- 스키마: `{ whenToUse, howToRead }`. 키는 **SpreadType 원본**(`relationship_5`, `stay_or_go_6` …)
- 각 필드 **180~300자**, 합계 400자+ — 단 위 브리프대로 11종은 **하한(180자대)에서 설득적으로**, 3종(원/투/쓰리카드)은 상한 쪽으로 설명적으로
- 근거 소스: `SPREAD_INFO[type]` 의 `label`·`tagline`·`description` + `getPositionLabels(type, "default", null)` 의 실제 포지션 라벨 + `data/persona/byeolkong_tarot.md` 의 스프레드별 흐름 가이드
- **`howToRead` 는 포지션 라벨을 실제로 반영**해야 한다 — 페이지가 라벨 목록을 함께 렌더하므로 어긋나면 눈에 띈다
- 금지·권장 어미는 Task 9 와 동일

**14종**: `one_card` · `two_card` · `three_card` · `relationship_5`✅ · `deep_feelings_5` · `reunion_5` · `reunion_deep_7` · `potential_7` · `checkin_6` · `stay_or_go_6` · `new_love_5` · `readiness_6` · `healing_6` · `chakra_7`

- [ ] **Step 1: 포지션 라벨 먼저 출력해 근거 확보**

```bash
node --import tsx -e "import {SPREAD_INFO,getPositionLabels} from './lib/tarot/spreads.ts'; for (const t of Object.keys(SPREAD_INFO)) console.log(t, '|', SPREAD_INFO[t].label, '|', getPositionLabels(t,'default',null).join(' / '));"
```
Expected: 14줄. 이 출력이 `howToRead` 작성의 근거다.

- [ ] **Step 2: 배치 초안 작성 (13종 추가)**

- [ ] **Step 3: 【게이트】 사용자 톤 검수**

Task 9 Step 2 와 동일 체크 + **포지션 라벨 일치 여부**. 사용자 승인 없이 진행하지 않는다.

- [ ] **Step 4: 빌드 검증**

```bash
npx tsc --noEmit && npm run build
```
Expected: `/guide/spreads/[slug]` 정적 **14페이지**. 태그 랜딩의 "이 고민에 맞는 스프레드" 링크가 **전부 활성**(필터가 통과).

```bash
npm run start &
sleep 3
curl -s localhost:3000/sitemap.xml | grep -c "<loc>"
```
Expected: **31** = static 4 + hub 3 + 태그 10 + 스프레드 14 + 카드 0.

> `hubEntries` 는 `/guide` · `/free/daily-card` · `/guide/spreads` 3개. 도감 인덱스는 `cardContent` 가 비어 있어 제외된다.

- [ ] **Step 5: Commit**

```bash
git add data/seo/spread-content.json
git commit -m "content(seo): 스프레드 가이드 본문 14종 — 포지션 라벨 기반"
```

---

### Task 11: 배포 + 색인 요청

- [ ] **Step 1: dev push → 확인**

```bash
git push origin dev
```
Vercel Preview 빌드 성공 확인 후 `dev.byeolkongtalk.com/guide/themes/reunion` 200 확인.
**마이그레이션 없음 · 새 env 없음** — Supabase Workflow 확인 불필요.

- [ ] **Step 2: main fast-forward**

```bash
git checkout main && git merge --ff-only dev && git push origin main && git checkout dev
```

- [ ] **Step 3: prod 스모크**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://byeolkongtalk.com/guide/themes/reunion
curl -s https://byeolkongtalk.com/guide/themes/reunion | grep -o "<title>[^<]*</title>"
curl -s https://byeolkongtalk.com/robots.txt | grep -E "guide|free"
curl -s https://byeolkongtalk.com/sitemap.xml | grep -c "<loc>"
```
Expected: 200 / title 정상 / **robots 매칭 0줄**(disallow 없음) / `<loc>` 31.

- [ ] **Step 4: 기존 퍼널 무영향 확인**

prod 에서 홈 → 태그 클릭 → `/concern` → `/tarot` 진입이 정상인지 1회 확인. 이 플랜은 `app/sitemap.ts` 만 기존 파일을 수정했으므로 회귀 가능성은 낮지만, 측정 창 중 배포이므로 확인한다.

- [ ] **Step 5 (사용자):** 구글 서치콘솔 — sitemap 재제출 + `/guide` · `/guide/themes/reunion` · `/free/daily-card` URL 검사 → 색인 요청

- [ ] **Step 6 (관측, 2~4주 후):** 서치콘솔 실적에서 노출 쿼리 확인 — "재회 타로" 류 상업 의도 쿼리 노출 시작 여부. 스펙 §6-6 대로 **d28 판정과 독립된 시계**로 본다.

---

## 완료 조건 (스펙 §6 매핑)

- [ ] robots 무변경 + 신규 루트 `/guide`·`/free` 자동 허용 확인 — Task 8, 11
- [ ] 감정 태그 랜딩 10종(1순위) — Task 3, 9
- [ ] 무료 도구 1종(2순위, 로그인 없음) — Task 4
- [ ] 스프레드 가이드 14종(3순위) — Task 5, 10
- [ ] 카드 도감 라우트 존재 + 발행 0 (4순위 후순위) — Task 6
- [ ] 허브가 발행분만 노출 — Task 7
- [ ] sitemap 데이터 생성, 개인 결과 혼입 0 — Task 8
- [ ] CTA 가 로그인 가드를 거침(콘텐츠 유입은 전부 비로그인) — Task 2
- [ ] **홈·푸터 링크는 이 플랜에 없음** — 플랜 B 로 이관(측정 창 규율)
