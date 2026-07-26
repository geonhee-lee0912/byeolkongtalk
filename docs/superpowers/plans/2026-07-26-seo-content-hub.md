# SEO 콘텐츠 허브 (옵션② 풀 허브) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비브랜드 검색 유입 자산 ~105페이지를 만든다 — 타로 78장 의미 페이지(`/guide/tarot-cards/[slug]`) + 스프레드 가이드 14종(`/guide/spreads/[slug]`) + 감정 태그 랜딩 10종(`/guide/themes/[tag]`) + 로그인 없는 무료 도구(`/free/daily-card`) + sitemap/Footer/홈 진입 연결.

**Architecture:** 콘텐츠 존은 기존 앱과 달리 **서버 컴포넌트 + `generateStaticParams`(빌드 타임 정적) + 페이지별 Metadata/JSON-LD**. 에디토리얼 본문은 `data/seo/*.json`으로 코드와 분리 — **json에 항목이 있는 슬러그만 페이지가 생성**되므로(thin page 방지) 본문을 배치 단위로 채우며 점진 발행한다. robots는 무수정(`/guide`·`/free`는 disallow 목록에 없어 자동 허용 — `/tarot*` 프리픽스는 robots 문자열 매칭 때문에 사용 금지).

**Tech Stack:** Next.js 16 App Router Metadata API, 기존 자산 재사용(`data/tarot_card_data.json`, `lib/tarot/{cards,spreads}.ts`, `lib/emotions.ts`, `public/cards-webp/`).

**스펙:** [2026-07-25-profitability-restructure-design.md](../specs/2026-07-25-profitability-restructure-design.md) §4 이연 "SEO 콘텐츠 허브"

**스코프 노트:** 스펙의 "도구 2종" 중 **궁합 라이트(`/free/compat`)는 이 플랜에서 제외** — 점수 로직이 미설계라 별도 브레인스토밍 후 후속 태스크로 추가한다 (오늘의 카드가 커뮤니티 미끼 1호 역할). 카드별 OG 이미지도 YAGNI로 제외(루트 OG 상속).

**검증 컨벤션:** `npx tsc --noEmit`(타입) + `npm run build`(정적 생성 확인 — 빌드 로그에 생성 페이지 수가 찍힘) + `npm run start` 후 `curl`로 title/JSON-LD 확인 (2026-06-29 SEO 플랜과 동일 패턴).

---

### Task 1: 슬러그·데이터 레이어 (`lib/seo/`) + 카드 전체 조회 export

**Files:**
- Modify: `lib/tarot/cards.ts` (전체 카드 목록 export 추가)
- Create: `lib/seo/tarot-slugs.ts`
- Create: `lib/seo/tags.ts`
- Create: `data/seo/card-content.json` (샘플 2장으로 시작)
- Create: `data/seo/spread-content.json` (샘플 1종)
- Create: `data/seo/tag-content.json` (샘플 1종)

- [ ] **Step 1: `lib/tarot/cards.ts`에 전체 목록 export 추가**

`getCard` 함수 위(=`const ALL_CARDS` 아래)에 추가:

```ts
/** 전체 78장 (id 오름차순) — SEO 콘텐츠 허브 등 목록 소비자용. */
export function getAllTarotCards(): TarotCard[] {
  return ALL_CARDS;
}
```

- [ ] **Step 2: `lib/seo/tarot-slugs.ts` 생성**

메이저는 `name_en` 케밥(`The Fool`→`the-fool`), 마이너는 `name_en`이 JSON id(`W01`)라 슈트+랭크로 변환(`W01`→`wands-ace`):

```ts
// lib/seo/tarot-slugs.ts — 카드 id ↔ SEO 슬러그 (순수, 클라이언트 안전)
import { getAllTarotCards, type TarotCard } from "@/lib/tarot/cards";

const SUIT_EN: Record<string, string> = { W: "wands", C: "cups", S: "swords", P: "pentacles" };
const RANK_EN = [
  "", "ace", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "page", "knight", "queen", "king",
];

export function buildCardSlug(card: TarotCard): string {
  const m = card.name_en.match(/^([WCSP])(\d{2})$/);
  if (m) return `${SUIT_EN[m[1]]}-${RANK_EN[Number(m[2])]}`;
  return card.name_en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const SLUG_TO_CARD = new Map(getAllTarotCards().map((c) => [buildCardSlug(c), c]));

export function findCardBySlug(slug: string): TarotCard | undefined {
  return SLUG_TO_CARD.get(slug);
}

export function getAllCardSlugs(): string[] {
  return [...SLUG_TO_CARD.keys()];
}
```

- [ ] **Step 3: `lib/seo/tags.ts` 생성 (태그 ↔ 슬러그 10종)**

```ts
// lib/seo/tags.ts — 감정 태그 ↔ SEO 슬러그 (lib/emotions.ts 태그 체계 v3와 1:1)
import type { EmotionTag } from "@/lib/emotions";

export const TAG_SLUGS: Record<string, EmotionTag> = {
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
  return TAG_SLUGS[slug];
}
```

- [ ] **Step 4: 콘텐츠 스키마 + 샘플 작성**

`data/seo/card-content.json` — 슬러그 키, 값은 `{ intro, uprightLove, reversedLove, advice, oneLiner }` (전체 800자+, 별콩이 톤·단정 예언 금지 준수). 샘플 2장으로 시작:

```json
{
  "the-fool": {
    "intro": "바보(The Fool) 카드는 메이저 아르카나의 0번, 모든 여정의 출발점이야. 절벽 끝에서 하늘을 올려다보며 걸어가는 사람, 손에 든 흰 장미, 발치의 작은 개 — 아직 아무것도 정해지지 않았기에 오히려 모든 가능성이 열려 있는 순간을 그려. 계산보다 마음이 먼저 움직이는 때, 새로운 시작 앞에 선 마음의 카드야.",
    "uprightLove": "연애 자리에서 정방향 바보는 새로운 시작의 결이야. 이제 막 피어나는 감정, 재거나 계산하지 않고 다가가는 마음, 지금까지와는 다른 방식으로 관계를 시작할 가능성이 보여. 썸이라면 먼저 가볍게 다가가 보라는 신호로, 오래된 관계라면 처음 만났을 때의 설렘을 다시 꺼내보라는 결로 읽혀. 다만 '아무 계획 없음'이 매력이자 약점이라, 속도 조절은 네 몫이야.",
    "reversedLove": "역방향 바보는 흐름이 반대로 도는 게 아니라 안으로 향하거나 한 박자 쉬어가는 결이야. 준비가 덜 된 채 뛰어들려는 마음, 혹은 반대로 겁이 나서 첫걸음을 계속 미루는 상태를 비출 때가 많아. 상대에게 갈피를 못 잡은 인상을 주고 있진 않은지, 지금 움직이려는 게 설렘인지 도피인지 한 번 들여다보라는 메시지에 가까워.",
    "advice": "바보 카드가 나왔다면 '완벽한 준비'를 기다리지 말라는 뜻이야. 다만 방향 없는 돌진이 아니라, 가볍게 한 걸음 — 부담 없는 연락, 짧은 만남 제안 같은 작은 시작이 이 카드의 결을 살리는 방법이야.",
    "oneLiner": "새로운 시작의 카드 — 계산보다 마음이 먼저 움직여도 괜찮은 날이야."
  },
  "wands-ace": {
    "intro": "완드 에이스는 불의 슈트가 시작되는 자리, 구름 속에서 뻗어 나온 손이 새싹 돋은 지팡이를 쥔 장면이야. 열정과 창조, 에너지가 '지금 막 태어나는' 순간을 그려 — 아직 형태는 없지만 분명히 살아 있는 불씨의 카드야.",
    "uprightLove": "연애에서 정방향 완드 에이스는 감정에 새 불씨가 붙는 결이야. 갑자기 눈에 들어오는 사람, 식었다고 생각한 관계에서 다시 이는 열기, 먼저 움직이고 싶어지는 충동 — 머리보다 몸과 마음이 먼저 반응하는 시기야. 이 불씨는 방치하면 금방 사그라들어서, 지금의 끌림을 행동 하나로 옮겨보는 게 카드의 결과 맞아.",
    "reversedLove": "역방향이면 불씨가 꺼진 게 아니라 눌려 있는 상태로 읽혀. 마음은 있는데 타이밍을 놓쳤거나, 시작할 에너지가 다른 데(일·피로·불안)에 새고 있을 수 있어. 열정이 방향을 못 찾고 헛도는 느낌이라면, 관계 자체보다 내 에너지가 지금 어디로 새는지를 먼저 짚어보라는 신호야.",
    "advice": "완드 에이스는 '기회는 왔고, 불을 붙이는 건 너'라는 카드야. 크게 벌이지 말고 작게 — 오늘 보낼 수 있는 연락 하나, 잡을 수 있는 약속 하나면 충분해.",
    "oneLiner": "새 불씨의 카드 — 지금의 끌림을 작은 행동 하나로 옮겨봐."
  }
}
```

`data/seo/spread-content.json` — 키는 SpreadType, 값 `{ whenToUse, howToRead }` (400자+). 샘플 1종:

```json
{
  "relationship_5": {
    "whenToUse": "관계 스프레드(5장)는 '나와 그 사람, 지금 어디쯤일까'가 궁금할 때 펼치는 배열이야. 나의 자리와 상대의 자리를 따로 놓고, 서로에 대한 기대 두 장을 마주 보게 배치한 다음 관계의 방향 카드로 매듭을 지어 — 한쪽 마음만이 아니라 두 사람의 온도 차까지 같이 보고 싶을 때 가장 잘 맞아.",
    "howToRead": "읽는 순서는 ① 나 ② 상대 ③ 나의 기대 ④ 상대의 기대 ⑤ 관계의 방향. 포인트는 ①·②를 비교해 두 사람의 현재 온도 차를 먼저 보고, ③·④에서 기대가 어긋나는 지점을 찾은 뒤, ⑤를 결론이 아니라 '지금 결이 이어지면 향하는 곳'으로 읽는 거야. 방향 카드가 무겁게 나와도 확정이 아니라 지금 흐름의 경고등으로 받아들이면 돼."
  }
}
```

`data/seo/tag-content.json` — 키는 태그 슬러그, 값 `{ title, intro, faq: [{q, a}] }`. 샘플 1종:

```json
{
  "reunion": {
    "title": "재회 타로 — 다시 이어질 흐름, 어떻게 보는 걸까",
    "intro": "이별 후에 남는 질문은 결국 하나야 — '끝난 걸까, 아직인 걸까'. 재회 타로는 그 답을 점찍어주는 게 아니라, 두 사람을 갈라놓은 매듭이 뭔지·지금 각자의 마음이 어디를 향하는지·다시 이어진다면 어떤 조건에서인지를 카드로 펼쳐보는 상담이야. 별콩이는 재회 가능성을 무조건 긍정하지도, 말리지도 않아 — 카드가 보여주는 결을 그대로 짚고, 그 위에서 네가 선택할 수 있게 도와줘.",
    "faq": [
      { "q": "재회 타로는 몇 장짜리로 보는 게 좋아?", "a": "가볍게 흐름만 보려면 쓰리카드, 서로의 몫과 회복 조건까지 깊게 보려면 재회 스프레드(5장)나 재회 심층(7장)이 맞아. 고민이 무거울수록 카드 수가 많은 배열이 매듭을 잘게 나눠서 보여줘." },
      { "q": "카드가 안 좋게 나오면 어떡해?", "a": "타로 카드에 좋고 나쁨은 없어 — 무거운 카드는 '안 된다'가 아니라 지금 결이 무겁다는 신호야. 별콩이는 그 흐름에서 네가 해볼 수 있는 것까지 같이 짚어줘." }
    ]
  }
}
```

- [ ] **Step 5: 슬러그 유닛 테스트**

Create: `lib/seo/tarot-slugs.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCardSlug, findCardBySlug, getAllCardSlugs } from "./tarot-slugs.ts";
import { getCard } from "../tarot/cards.ts";

test("메이저 슬러그 — name_en 케밥", () => {
  assert.equal(buildCardSlug(getCard(0)!), "the-fool");
});

test("마이너 슬러그 — 슈트-랭크", () => {
  assert.equal(buildCardSlug(getCard(22)!), "wands-ace"); // W01 = id 22
});

test("78장 슬러그 전부 유일 + 역조회 일치", () => {
  const slugs = getAllCardSlugs();
  assert.equal(slugs.length, 78);
  assert.equal(new Set(slugs).size, 78);
  for (const s of slugs) assert.ok(findCardBySlug(s));
});
```

Run: `node --import tsx --test lib/seo/tarot-slugs.test.ts`
Expected: 3 tests pass. (실패하면 마이너 id 배열 순서를 `getCard(22)`로 실제 확인해 기대값 수정 — 카드 데이터가 권위.)

- [ ] **Step 6: Commit**

```bash
git add lib/tarot/cards.ts lib/seo data/seo
git commit -m "feat(seo): 카드 슬러그·태그 슬러그 레이어 + 콘텐츠 json 스키마(샘플 2장/1종/1종)"
```

---

### Task 2: 카드 의미 페이지 (`/guide/tarot-cards/[slug]`) + CTA 아일랜드

**Files:**
- Create: `app/(content)/guide/layout.tsx`
- Create: `components/seo/GuideCta.tsx`
- Create: `app/(content)/guide/tarot-cards/[slug]/page.tsx`

- [ ] **Step 1: 콘텐츠 존 공통 레이아웃**

`app/(content)/guide/layout.tsx` (서버 컴포넌트 — AppShell(Header/BottomTab)은 root layout이 pathname 기반으로 자동 부착하므로 여기선 본문 컨테이너만):

```tsx
export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full max-w-md mx-auto px-5 pt-6 pb-10 animate-fade-in">
      {children}
    </main>
  );
}
```

- [ ] **Step 2: CTA 아일랜드 (클라이언트)**

`components/seo/GuideCta.tsx` — 홈 태그 클릭과 동일한 진입(세션 스토리지 + /concern). **구현 전에 `app/page.tsx`의 태그 클릭 핸들러(handleSelect)가 쓰는 sessionStorage 키·값 형식을 grep으로 확인해 그대로 복제할 것** (`grep -n "byeolkong:emotion" app/page.tsx lib/*.ts`). 기대 형태:

```tsx
"use client";

import { useRouter } from "next/navigation";
import type { EmotionTag } from "@/lib/emotions";

/** 콘텐츠 페이지 하단 CTA — 홈 태그 클릭과 동일하게 감정 태그를 심고 상담 진입. */
export default function GuideCta({ tag, label }: { tag: EmotionTag; label?: string }) {
  const router = useRouter();
  const start = () => {
    try {
      sessionStorage.setItem("byeolkong:emotion", tag);
    } catch {}
    router.push("/concern");
  };
  return (
    <div className="mt-8 rounded-2xl border border-lilac-mid/40 bg-gradient-to-br from-lilac-soft/60 to-cream-warm p-4 text-center">
      <p className="text-[13.5px] font-bold text-eye-purple leading-snug">
        이 카드가 나온 고민, 지금 마음에 있다면
      </p>
      <p className="text-[11.5px] text-text-light mt-1">
        별콩이가 카드를 펼쳐서 너의 이야기로 읽어줄게 — 첫 회 무료
      </p>
      <button
        type="button"
        onClick={start}
        className="mt-3 w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
      >
        {label ?? "별콩이에게 물어보기"}
      </button>
    </div>
  );
}
```

(홈이 로그인 가드를 태그 클릭 시점에 거는 구조면 — grep 결과에 따라 — 여기선 걸지 않는다: /concern 진입 시 기존 가드가 처리.)

- [ ] **Step 3: 카드 페이지**

`app/(content)/guide/tarot-cards/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import cardContent from "@/data/seo/card-content.json";
import { findCardBySlug, buildCardSlug, getAllCardSlugs } from "@/lib/seo/tarot-slugs";
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

/** 본문이 작성된 카드만 발행 (thin page 방지 — json에 항목 추가 = 페이지 발행) */
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
    description: entry.oneLiner + " " + entry.intro.slice(0, 90),
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
        <Link href="/guide/tarot-cards" className="hover:text-eye-purple">타로 카드 도감</Link>
        <span className="mx-1">›</span>
        <span>{card.name_kr}</span>
      </nav>

      <h1 className="font-display text-[22px] text-eye-purple leading-snug">
        {card.name_kr} 카드 의미
      </h1>
      <p className="text-[12px] text-text-light mt-1">정방향 · 역방향 · 연애 타로 해석</p>

      <div className="relative w-[140px] h-[238px] mx-auto my-5 rounded-xl overflow-hidden shadow-md">
        <Image src={getCardImagePath(card.id)} alt={`${card.name_kr} 타로 카드`} fill sizes="140px" className="object-cover" />
      </div>

      <section className="space-y-5 text-[13.5px] text-eye-purple/90 leading-relaxed">
        <p>{entry.intro}</p>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">정방향 — 연애에서는</h2>
          <p>{entry.uprightLove}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {card.upright.map((k) => (
              <span key={k} className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full">#{k}</span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">역방향 — 연애에서는</h2>
          <p>{entry.reversedLove}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {card.reversed.map((k) => (
              <span key={k} className="text-[11px] font-bold text-text-light bg-cream-warm px-2 py-0.5 rounded-full border border-lilac-soft">#{k}</span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">별콩이의 한마디</h2>
          <p>{entry.advice}</p>
        </div>
      </section>

      <GuideCta tag="걔 속마음이 궁금해" />

      <nav className="flex justify-between mt-6 text-[12px] text-lilac-deep font-bold">
        {prev && buildCardSlug(prev) in CONTENT ? (
          <Link href={`/guide/tarot-cards/${buildCardSlug(prev)}`}>‹ {prev.name_kr}</Link>
        ) : <span />}
        {next && buildCardSlug(next) in CONTENT ? (
          <Link href={`/guide/tarot-cards/${buildCardSlug(next)}`}>{next.name_kr} ›</Link>
        ) : <span />}
      </nav>
    </article>
  );
}
```

- [ ] **Step 4: 빌드·렌더 검증**

```bash
npx tsc --noEmit && npm run build
```
Expected: 빌드 성공, 로그에 `/guide/tarot-cards/[slug]` 정적 2페이지(the-fool, wands-ace) 생성.

```bash
npm run start &
curl -s localhost:3000/guide/tarot-cards/the-fool | grep -o "<title>[^<]*</title>"
curl -s localhost:3000/guide/tarot-cards/the-fool | grep -c "application/ld+json"
```
Expected: `<title>바보 카드 의미 — 정방향·역방향 연애 타로 · 별콩톡</title>` + JSON-LD 1건. 확인 후 서버 종료.

- [ ] **Step 5: Commit**

```bash
git add app/\(content\) components/seo
git commit -m "feat(seo): 카드 의미 페이지 라우트 — 서버 컴포넌트 + 정적 생성 + CTA 아일랜드"
```

---

### Task 3: 도감 인덱스 + 허브 홈 (`/guide`, `/guide/tarot-cards`)

**Files:**
- Create: `app/(content)/guide/page.tsx`
- Create: `app/(content)/guide/tarot-cards/page.tsx`

- [ ] **Step 1: 도감 인덱스**

`app/(content)/guide/tarot-cards/page.tsx` — 발행된 카드만 링크(메이저/슈트별 그룹). 서버 컴포넌트:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import cardContent from "@/data/seo/card-content.json";
import { getAllTarotCards } from "@/lib/tarot/cards";
import { buildCardSlug } from "@/lib/seo/tarot-slugs";

export const metadata: Metadata = {
  title: "타로 카드 의미 도감 — 78장 정방향·역방향",
  description: "메이저 아르카나 22장과 마이너 아르카나 56장의 의미를 연애 맥락으로 풀어낸 별콩이의 타로 도감.",
  alternates: { canonical: "/guide/tarot-cards" },
};

const GROUPS: { title: string; filter: (id: number) => boolean }[] = [
  { title: "메이저 아르카나", filter: (id) => id <= 21 },
  { title: "완드 (불)", filter: (id) => id >= 22 && id <= 35 },
  { title: "컵 (물)", filter: (id) => id >= 36 && id <= 49 },
  { title: "소드 (바람)", filter: (id) => id >= 50 && id <= 63 },
  { title: "펜타클 (흙)", filter: (id) => id >= 64 && id <= 77 },
];

export default function TarotCardsIndex() {
  const published = getAllTarotCards().filter((c) => buildCardSlug(c) in cardContent);
  return (
    <div>
      <h1 className="font-display text-[22px] text-eye-purple">타로 카드 의미 도감</h1>
      <p className="text-[12.5px] text-text-light mt-1.5 leading-relaxed">
        78장의 카드가 연애에서 어떤 결을 보여주는지, 별콩이가 한 장씩 풀어놨어.
      </p>
      {GROUPS.map((g) => {
        const cards = published.filter((c) => g.filter(c.id));
        if (cards.length === 0) return null;
        return (
          <section key={g.title} className="mt-6">
            <h2 className="text-[14px] font-bold text-eye-purple mb-2">{g.title}</h2>
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
      })}
    </div>
  );
}
```

- [ ] **Step 2: 허브 홈 `/guide`**

`app/(content)/guide/page.tsx` — 도감·스프레드·무료 도구 진입 + **발행된 테마 랜딩 전체 링크**(태그 랜딩의 내부 링크 허브 역할):

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import tagContent from "@/data/seo/tag-content.json";

export const metadata: Metadata = {
  title: "별콩이의 타로 가이드 — 카드 의미·스프레드·무료 카드",
  description: "타로 카드 78장의 의미, 스프레드 보는 법, 고민별 타로 가이드를 별콩이가 정리했어. 오늘의 카드는 가입 없이 무료.",
  alternates: { canonical: "/guide" },
};

const HUBS = [
  { href: "/guide/tarot-cards", emoji: "📖", title: "타로 카드 도감", desc: "78장의 의미, 정방향·역방향 연애 해석" },
  { href: "/guide/spreads", emoji: "🃏", title: "스프레드 가이드", desc: "배열별로 언제·어떻게 보는지" },
  { href: "/free/daily-card", emoji: "🌙", title: "오늘의 카드", desc: "가입 없이 한 장, 무료" },
];

const THEMES = tagContent as Record<string, { title: string }>;

export default function GuideHome() {
  return (
    <div>
      <h1 className="font-display text-[22px] text-eye-purple">별콩이의 타로 가이드</h1>
      <p className="text-[12.5px] text-text-light mt-1.5 leading-relaxed">
        카드가 처음이어도 괜찮아 — 의미부터 보는 법까지 별콩이가 차근차근 정리해뒀어.
      </p>
      <div className="flex flex-col gap-2.5 mt-5">
        {HUBS.map((h) => (
          <Link
            key={h.href}
            href={h.href}
            className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-2xl p-3.5 border border-lilac-soft hover:border-lilac-deep/40 transition"
          >
            <span className="text-[24px]" aria-hidden>{h.emoji}</span>
            <div>
              <p className="text-[14px] font-bold text-eye-purple">{h.title}</p>
              <p className="text-[11.5px] text-text-light mt-0.5">{h.desc}</p>
            </div>
          </Link>
        ))}
      </div>
      <h2 className="text-[14px] font-bold text-eye-purple mt-6 mb-2">고민별 타로 가이드</h2>
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

- [ ] **Step 3: 검증 + Commit**

`npm run build` → `/guide`, `/guide/tarot-cards` 정적 생성 확인.

```bash
git add "app/(content)/guide"
git commit -m "feat(seo): 가이드 허브 홈 + 카드 도감 인덱스 (발행분만 노출)"
```

---

### Task 4: 스프레드 가이드 (`/guide/spreads/[slug]`)

**Files:**
- Create: `app/(content)/guide/spreads/page.tsx` (인덱스)
- Create: `app/(content)/guide/spreads/[slug]/page.tsx`

- [ ] **Step 1: 상세 페이지**

슬러그 = SpreadType 키의 `_`→`-` 치환(`relationship_5`→`relationship-5`). 데이터는 `SPREAD_INFO`(카드 수·라벨), `getSpreadDescription`, `getPositionLabels`(포지션 라벨) + `data/seo/spread-content.json`(작성분만 발행):

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import spreadContent from "@/data/seo/spread-content.json";
import { SPREAD_INFO, getPositionLabels, getSpreadDescription, type SpreadType } from "@/lib/tarot/spreads";
import GuideCta from "@/components/seo/GuideCta";

interface SpreadEntry { whenToUse: string; howToRead: string }
const CONTENT = spreadContent as Record<string, SpreadEntry>;

const toSlug = (k: string) => k.replace(/_/g, "-");
const fromSlug = (s: string) => s.replace(/-/g, "_") as SpreadType;

export function generateStaticParams() {
  return Object.keys(SPREAD_INFO)
    .filter((k) => k in CONTENT)
    .map((k) => ({ slug: toSlug(k) }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const key = fromSlug(slug);
  const info = SPREAD_INFO[key];
  if (!info || !(key in CONTENT)) return {};
  return {
    title: `${info.label} 스프레드 보는 법 — ${info.cardCount}장 배열`,
    description: CONTENT[key].whenToUse.slice(0, 120),
    alternates: { canonical: `/guide/spreads/${slug}` },
  };
}

export default async function SpreadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = fromSlug(slug);
  const info = SPREAD_INFO[key];
  const entry = CONTENT[key];
  if (!info || !entry) notFound();
  const labels = getPositionLabels(key, "love", null);
  return (
    <article>
      <h1 className="font-display text-[22px] text-eye-purple">{info.label} 스프레드 보는 법</h1>
      <p className="text-[12px] text-text-light mt-1">{info.cardCount}장 배열 · {getSpreadDescription(key, "love")}</p>
      <section className="space-y-5 text-[13.5px] text-eye-purple/90 leading-relaxed mt-5">
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">언제 펼치는 배열일까</h2>
          <p>{entry.whenToUse}</p>
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">포지션 읽는 순서</h2>
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            {labels.map((l, i) => <li key={i}>{l}</li>)}
          </ol>
          <p className="mt-3">{entry.howToRead}</p>
        </div>
      </section>
      <GuideCta tag="걔 속마음이 궁금해" label="이 스프레드로 상담 받기" />
    </article>
  );
}
```

주의: `SPREAD_INFO`의 실제 필드명(`label`·`cardCount`)과 `getSpreadDescription`/`getPositionLabels` 시그니처는 `lib/tarot/spreads.ts:34-46, 255-332`를 열어 확인 후 맞출 것 — 다르면 이 코드의 해당 호출만 조정.

- [ ] **Step 2: 인덱스 페이지** — Task 3 도감 인덱스와 동일 패턴으로 발행분 링크 목록 (`/guide/spreads`, metadata title "타로 스프레드 가이드").

- [ ] **Step 3: 검증 + Commit**

`npm run build` → `/guide/spreads/relationship-5` 생성 확인 + `npm run start` 후 curl title 확인.

```bash
git add "app/(content)/guide/spreads"
git commit -m "feat(seo): 스프레드 가이드 페이지 — 포지션 라벨 재사용 + 작성분 발행"
```

---

### Task 5: 감정 태그 랜딩 (`/guide/themes/[tag]`)

**Files:**
- Create: `app/(content)/guide/themes/[tag]/page.tsx`

- [ ] **Step 1: 랜딩 페이지**

h1 = tag-content의 title("재회 타로 — …" 류 검색 쿼리 타깃), 본문 = intro + 추천 스프레드(`TAG_SPREADS[tag]` → 스프레드 가이드 링크) + FAQ(JSON-LD FAQPage) + GuideCta(해당 태그 프리셋):

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import tagContent from "@/data/seo/tag-content.json";
import { TAG_SLUGS, findTagBySlug } from "@/lib/seo/tags";
import { TAG_SPREADS, SPREAD_INFO } from "@/lib/tarot/spreads";
import GuideCta from "@/components/seo/GuideCta";

interface TagEntry { title: string; intro: string; faq: { q: string; a: string }[] }
const CONTENT = tagContent as Record<string, TagEntry>;

export function generateStaticParams() {
  return Object.keys(TAG_SLUGS)
    .filter((slug) => slug in CONTENT)
    .map((tag) => ({ tag }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const entry = CONTENT[tag];
  if (!entry) return {};
  return {
    title: entry.title,
    description: entry.intro.slice(0, 120),
    alternates: { canonical: `/guide/themes/${tag}` },
  };
}

export default async function ThemePage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const emotionTag = findTagBySlug(tag);
  const entry = CONTENT[tag];
  if (!emotionTag || !entry) notFound();
  const spreads = TAG_SPREADS[emotionTag] ?? [];
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
      <h1 className="font-display text-[21px] text-eye-purple leading-snug">{entry.title}</h1>
      <p className="text-[13.5px] text-eye-purple/90 leading-relaxed mt-4">{entry.intro}</p>

      <h2 className="text-[15px] font-bold text-eye-purple mt-6 mb-2">이 고민에 맞는 스프레드</h2>
      <div className="flex flex-col gap-2">
        {spreads.map((s) => (
          <Link
            key={s}
            href={`/guide/spreads/${s.replace(/_/g, "-")}`}
            className="text-[13px] font-bold text-lilac-deep bg-white/80 border border-lilac-soft rounded-xl px-3.5 py-2.5 hover:border-lilac-deep/40 transition"
          >
            {SPREAD_INFO[s].label} ({SPREAD_INFO[s].cardCount}장) ›
          </Link>
        ))}
      </div>

      <h2 className="text-[15px] font-bold text-eye-purple mt-6 mb-2">자주 묻는 질문</h2>
      <div className="space-y-3">
        {entry.faq.map((f) => (
          <div key={f.q}>
            <p className="text-[13px] font-bold text-eye-purple">Q. {f.q}</p>
            <p className="text-[13px] text-eye-purple/90 leading-relaxed mt-1">{f.a}</p>
          </div>
        ))}
      </div>

      <GuideCta tag={emotionTag} label="이 고민 별콩이한테 물어보기" />
    </article>
  );
}
```

주의: 스프레드 가이드가 아직 미발행인 스프레드로의 링크가 생길 수 있음 — Task 8에서 spread-content 14종을 다 채우므로 최종 상태에선 깨진 링크 없음. 배치 발행 중엔 `spreads.filter((s) => ...)` 필요 시 spread-content 키로 필터.

- [ ] **Step 2: 검증 + Commit**

`npm run build` → `/guide/themes/reunion` 생성. curl로 title = tag-content title 확인.

```bash
git add "app/(content)/guide/themes"
git commit -m "feat(seo): 감정 태그 랜딩 — 추천 스프레드 링크 + FAQ JSON-LD + 태그 프리셋 CTA"
```

---

### Task 6: 무료 도구 — 오늘의 카드 (`/free/daily-card`, 로그인 없음)

**Files:**
- Create: `components/seo/DailyCardDraw.tsx`
- Create: `app/(content)/free/daily-card/page.tsx`

- [ ] **Step 1: 뽑기 아일랜드**

`components/seo/DailyCardDraw.tsx` — API·비용 0 (정적 데이터만). 카드 1장 + 방향 랜덤, oneLiner(작성분) 또는 키워드로 해석 표시:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import cardContent from "@/data/seo/card-content.json";
import { getAllTarotCards, getCardImagePath, CARD_BACK_IMAGE, type TarotCard } from "@/lib/tarot/cards";
import { buildCardSlug } from "@/lib/seo/tarot-slugs";
import Link from "next/link";

interface Drawn { card: TarotCard; reversed: boolean }
const CONTENT = cardContent as Record<string, { oneLiner: string }>;

export default function DailyCardDraw() {
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const draw = () => {
    const cards = getAllTarotCards();
    const card = cards[Math.floor(Math.random() * cards.length)];
    setDrawn({ card, reversed: Math.random() < 0.3 });
  };
  const slug = drawn ? buildCardSlug(drawn.card) : null;
  const keywords = drawn ? (drawn.reversed ? drawn.card.reversed : drawn.card.upright) : [];
  return (
    <div className="text-center">
      <div className="relative w-[150px] h-[255px] mx-auto rounded-xl overflow-hidden shadow-md">
        <Image
          src={drawn ? getCardImagePath(drawn.card.id) : CARD_BACK_IMAGE}
          alt={drawn ? `${drawn.card.name_kr} 카드` : "타로 카드 뒷면"}
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
            {slug && CONTENT[slug]?.oneLiner
              ? CONTENT[slug].oneLiner
              : `오늘 너에게 온 결 — ${keywords.join(", ")}`}
          </p>
          {slug && CONTENT[slug] && (
            <Link href={`/guide/tarot-cards/${slug}`} className="inline-block mt-2 text-[12px] font-bold text-lilac-deep">
              이 카드 의미 자세히 보기 ›
            </Link>
          )}
          <button type="button" onClick={draw} className="block mx-auto mt-3 text-[12px] text-text-light underline">
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

`app/(content)/free/layout.tsx`를 guide layout과 동일하게 생성:

```tsx
export default function FreeLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full max-w-md mx-auto px-5 pt-6 pb-10 animate-fade-in">
      {children}
    </main>
  );
}
```

`app/(content)/free/daily-card/page.tsx` (서버):

```tsx
import type { Metadata } from "next";
import DailyCardDraw from "@/components/seo/DailyCardDraw";
import GuideCta from "@/components/seo/GuideCta";

export const metadata: Metadata = {
  title: "오늘의 타로 카드 한 장 — 무료·가입 없음",
  description: "회원가입 없이 바로 뽑는 오늘의 타로 카드. 별콩이가 오늘 너에게 온 카드 한 장의 결을 읽어줘.",
  alternates: { canonical: "/free/daily-card" },
};

export default function DailyCardPage() {
  return (
    <div>
      <h1 className="font-display text-[22px] text-eye-purple text-center">오늘의 타로 카드</h1>
      <p className="text-[12.5px] text-text-light mt-1.5 mb-6 text-center leading-relaxed">
        가입 없이, 하루 한 장 — 오늘 너에게 온 카드의 결을 봐줄게.
      </p>
      <DailyCardDraw />
      <GuideCta tag="그냥 별콩이한테 털어놓고 싶어" label="별콩이랑 더 깊게 보기" />
    </div>
  );
}
```

- [ ] **Step 3: 검증 + Commit**

로컬에서 시크릿 창(비로그인)으로 `/free/daily-card` → 뽑기 동작 + Header/BottomTab 정상 부착 확인.

```bash
git add components/seo/DailyCardDraw.tsx "app/(content)/free"
git commit -m "feat(seo): 무료 오늘의 카드 도구 — 로그인 없는 미끼 페이지 (API 비용 0)"
```

---

### Task 7: 크롤 연결 — sitemap 데이터 생성 + Footer 링크 + 홈 진입 카드

**Files:**
- Modify: `app/sitemap.ts`
- Modify: `components/layout/Footer.tsx:38-57` (링크 행)
- Modify: `app/page.tsx:411-412` (다른 고민 그리드 아래)

- [ ] **Step 1: sitemap을 데이터 기반 생성으로 확장**

`app/sitemap.ts`의 return 배열 앞에 발행분 수집을 추가하고 배열 끝에 스프레드:

```ts
import type { MetadataRoute } from "next";
import cardContent from "@/data/seo/card-content.json";
import spreadContent from "@/data/seo/spread-content.json";
import tagContent from "@/data/seo/tag-content.json";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://byeolkongtalk.com";
  const lastModified = new Date();

  const contentEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/guide`, lastModified, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/guide/tarot-cards`, lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/guide/spreads`, lastModified, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/free/daily-card`, lastModified, changeFrequency: "daily", priority: 0.8 },
    ...Object.keys(cardContent).map((slug) => ({
      url: `${baseUrl}/guide/tarot-cards/${slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...Object.keys(spreadContent).map((key) => ({
      url: `${baseUrl}/guide/spreads/${key.replace(/_/g, "-")}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...Object.keys(tagContent).map((slug) => ({
      url: `${baseUrl}/guide/themes/${slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  return [
    // …기존 4개 항목 그대로…
    ...contentEntries,
  ];
}
```

- [ ] **Step 2: Footer에 콘텐츠 링크 행 추가**

기존 약관 링크 행(38-57행) 위에 동일 스타일로 한 행 추가:

```tsx
        {/* 콘텐츠 허브 — 크롤 경로 + 탐색 */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-lilac-soft/30">
          <Link href="/guide/tarot-cards" className="text-[11px] text-text-light/90 hover:text-eye-purple transition-colors">
            타로 카드 도감
          </Link>
          <Link href="/guide/spreads" className="text-[11px] text-text-light/90 hover:text-eye-purple transition-colors">
            스프레드 가이드
          </Link>
          <Link href="/free/daily-card" className="text-[11px] text-text-light/90 hover:text-eye-purple transition-colors">
            오늘의 카드
          </Link>
        </div>
```

- [ ] **Step 3: 홈 하단 진입 카드**

`app/page.tsx`에서 "다른 고민" 그리드 닫힘(`</div>`, 411행) 바로 뒤 · `</section>`(412행) 앞에 삽입 — 퍼널 위쪽을 건드리지 않는 최하단 배치:

```tsx
          {/* 별콩이의 타로 도감 — 콘텐츠 존 진입 (읽을거리·무료 도구) */}
          <div className="flex items-center gap-3 mb-4 mt-6" aria-hidden>
            <span className="flex-1 h-px bg-lilac-mid/40" />
            <span className="text-gold text-[11px]">✦</span>
            <span className="flex-1 h-px bg-lilac-mid/40" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <Link
              href="/guide/tarot-cards"
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-3.5 border border-lilac-soft hover:border-lilac-deep/40 transition text-left"
            >
              <div className="text-[22px] mb-1.5" aria-hidden>📖</div>
              <p className="text-[13px] font-bold text-eye-purple leading-snug">타로 카드 도감</p>
              <p className="text-[11px] text-text-light mt-1 leading-snug">78장의 의미, 연애 맥락으로</p>
            </Link>
            <Link
              href="/free/daily-card"
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-3.5 border border-lilac-soft hover:border-lilac-deep/40 transition text-left"
            >
              <div className="text-[22px] mb-1.5" aria-hidden>🌙</div>
              <p className="text-[13px] font-bold text-eye-purple leading-snug">오늘의 카드</p>
              <p className="text-[11px] text-text-light mt-1 leading-snug">가입 없이 한 장, 무료</p>
            </Link>
          </div>
```

- [ ] **Step 4: 검증 + Commit**

```bash
npm run build && npm run start &
curl -s localhost:3000/sitemap.xml | grep -c "<loc>"
```
Expected: 4(기존) + 허브 4 + 발행 콘텐츠 수(샘플 시점 2+1+1=4) = **12** `<loc>`. robots.txt는 무변경(디폴트 allow) — `curl -s localhost:3000/robots.txt`에 `/guide`·`/free` disallow 없음 확인.

```bash
git add app/sitemap.ts components/layout/Footer.tsx app/page.tsx
git commit -m "feat(seo): sitemap 데이터 생성 + Footer·홈 하단 콘텐츠 진입 (고아 페이지 방지)"
```

---

### Task 8: 본문 대량 생산 — 배치 발행 (78장 + 스프레드 14 + 태그 10)

**Files:**
- Modify: `data/seo/card-content.json`, `data/seo/spread-content.json`, `data/seo/tag-content.json`

**작성 워크플로우 (배치당 반복):** Claude가 Task 1 샘플의 스키마·톤(별콩이 반말, 단정 예언 금지 — "~한 흐름이야/~결이야", 연애 맥락 중심, 카드당 intro+uprightLove+reversedLove+advice 합계 800자+, `visual` 필드(메이저)와 upright/reversed 키워드를 근거로 사용)을 따라 초안 생성 → **사용자 검수(톤·단정 표현 스팟 체크)** → json에 병합 → 빌드 → commit. 마이너는 `visual`이 비어 있으므로 RWS 표준 도상 지식으로 묘사하되 슈트 원소(`suit_kr`·element·theme)를 근거로.

- [ ] **Step 1: 배치 A — 메이저 아르카나 22장** → 검수 → commit `feat(seo): 카드 본문 배치 A — 메이저 22장`
- [ ] **Step 2: 배치 B — 완드 14 + 컵 14장** → 검수 → commit `배치 B — 완드·컵 28장`
- [ ] **Step 3: 배치 C — 소드 14 + 펜타클 14장** → 검수 → commit `배치 C — 소드·펜타클 28장`
- [ ] **Step 4: 스프레드 14종 whenToUse/howToRead** (byeolkong_tarot.md의 스프레드별 흐름·신설 가이드 §를 근거 소스로) → commit
- [ ] **Step 5: 태그 랜딩 10종 title/intro/faq** (제목은 검색 쿼리형: "재회 타로", "짝사랑 타로 — 걔 속마음 보는 법", "썸 타로", "연락운 타로", "권태기 타로", "새로운 인연 타로", "진로 타로", "선택 타로", "인간관계 타로", "오늘의 고민 상담") → commit
- [ ] **Step 6: 최종 빌드 확인** — `npm run build` 로그에서 카드 78 + 스프레드 14 + 태그 10 + 인덱스/도구 = **105+페이지** 정적 생성 확인. `curl -s localhost:3000/sitemap.xml | grep -c "<loc>"` = 106개(±) 확인.

---

### Task 9: 배포 + 색인 요청 (사용자 콘솔 작업 핸드오프)

- [ ] **Step 1: dev push → 확인 → main fast-forward** (픽스 패키지 플랜 Task 9와 동일 절차. 이 플랜은 DB 변경 없음 — 마이그레이션 무관)
- [ ] **Step 2: prod 스모크** — `byeolkongtalk.com/guide/tarot-cards/the-fool` 200 + view-source에 title/JSON-LD + `/sitemap.xml`에 콘텐츠 URL 반영 확인
- [ ] **Step 3 (사용자):** 구글 서치콘솔 — sitemap 재제출 + `/guide/tarot-cards`·대표 태그 랜딩 2~3개 URL 검사 → 색인 요청. 네이버 서치어드바이저 — sitemap 재제출 + 수집 요청
- [ ] **Step 4 (관측):** 2~4주 후 서치콘솔 실적에서 노출 쿼리 확인 — "카드 이름+의미" 류 롱테일 노출 시작 여부. admin 유입별 카드에서 referrer=google 분리 관측 (스펙 §5 판독과 독립)

---

## 완료 조건 (스펙 매핑)

- [ ] robots 충돌 없는 신규 루트(`/guide`·`/free`)에 서버 컴포넌트 정적 페이지 — Task 1~6
- [ ] 타로 78장 + 스프레드 14 + 태그 랜딩 10 + 무료 도구 1 발행 — Task 8 (궁합 라이트는 후속 브레인스토밍으로 명시 제외)
- [ ] sitemap 데이터 생성 + Footer/홈 진입 링크 — Task 7
- [ ] prod 배포 + 색인 요청 — Task 9
