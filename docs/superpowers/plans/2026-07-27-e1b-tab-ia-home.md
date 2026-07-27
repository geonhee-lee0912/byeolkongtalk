# E1-B 하단탭 IA + 홈 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하단탭 5칸을 재정의하고(라벨만 — URL 변경 0) 홈을 슬롯 구조로 재구성한다 — hero 슬롯(무이력=현행 / 재방문=홍보 캐러셀) + 오늘 블록 + 고민톡 태그(현행 크기 유지) + 크로스링크 슬롯 2 + 콘텐츠 링크. 운세 탭에 의도축 카테고리를 넣어 리포트 확장을 수용한다.

**Architecture:** 홈(`app/page.tsx`)은 이미 `hasResumable`·`welcomeNudge` 로 상태 분기를 하고 있다. 그 패턴을 연장해 **hero 슬롯과 오늘 블록을 상태 기반으로 렌더**한다. 오늘 블록의 신호 4종은 클라에서 여러 API 를 긁지 않고 **`/api/home/today` 단일 집계 엔드포인트**가 서버 권위로 계산한다. 홈이 이미 400행대이므로 새 UI 는 `components/home/` 아래 별도 컴포넌트로 뽑아 홈 파일이 더 커지지 않게 한다.

**Tech Stack:** Next.js 16 App Router, 기존 `getSession()`·`getServiceSupabase()`·`page_views` 계측 재사용. 마이그레이션 0 · 새 env 0.

**스펙:** [2026-07-27-e1-ia-content-hierarchy-design.md](../specs/2026-07-27-e1-ia-content-hierarchy-design.md) §2 · §3 · §3-b · §5

**⚠️ 배포 시점: d28(2026-08-23) 이후.** 전 유저 노출 변경이라 수익성 판정 창 중간에 배포하면 인과 분리가 깨진다. 빌드는 8/17~8/22 에 마치고 **배포 대기** 상태로 둔다.

**이 플랜의 범위 밖:**
- **그 사람 탭 화면 작업**(파일 허브 · 리허설) → E6 스펙. 여기서는 **라벨 변경만**
- 콘텐츠 존 페이지 자체 → 플랜 A (`2026-07-27-e1a-content-zone.md`)
- E3 좋은날 알림 · E4 편지 도착 → 각 상품 스펙. 오늘 블록은 **지금 채울 수 있는 4종만** 구현한다

**검증 컨벤션:** `npx tsc --noEmit` · `node --import tsx --test <file>` · `npm run build` · 브라우저 실측(모바일 뷰포트 375·390)

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
| 캐릭터 일관성 | `nano_banana_pro` + `public/byeolkong-main.png` 를 캐릭터 레퍼런스 media 로 전달 | `specs/2026-07-05-byeolkong-pose-set-design.md` 검증된 파이프라인 |
| 스타일 | **플랫 파스텔 일러스트. 3D 인형 스타일 금지.** 크림+라일락+골드, 이마 별·후광·귀 장식·펜던트 유지 | 같은 스펙 |
| 배경 | 캐릭터 컷은 단색 생성 → `remove_background` → 투명. 배너 와이드 컷은 배경 포함 | |
| **파일 포맷** | **WebP, 장당 ≤150KB 목표.** 기존 `byeolkong-*.png` 는 ~1MB 지만 신규는 따라가지 않는다 | 홈 첫 화면이라 LCP 직결 |
| 선택 게이트 | 포즈당 **2안 생성 → 사용자 선택** | 포즈셋 스펙 |
| 해상도 | 1k(1024px) — `max-w-md`(448px) 2배로 충분 | |
| **크레딧 상한** | 단가 **2크레딧/장**(확인 2026-07-27, 잔액 112). **E2 웹툰 캐러셀용 40 은 건드리지 않는다.** 누적 **72** 도달 시 사용자 승인 | E2 는 패널 5~8×2안 = 20~32 + 재시도 |
| 안 만드는 것 | **18~24px 아이콘** — 그 크기에서 캐릭터가 안 보인다. 이모지/Tabler 유지 | |

**레퍼런스 `media_id`**: 플랜 A 에서 이미 `public/byeolkong-main.png` 를 업로드했다면 그 `media_id` 를 재사용한다. 없으면 첫 이미지 작업 전 1회 업로드하고 여기 기록한다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `components/layout/BottomTab.tsx` (수정) | 라벨 5개 변경. `matchPrefixes`·경로는 무변경 |
| `app/api/home/today/route.ts` (신규) | 오늘 블록 신호 4종 집계 (서버 권위) |
| `lib/home/today.ts` (신규) | 신호 우선순위·상한 규칙 (순수 — 테스트 가능) |
| `components/home/TodayBlock.tsx` (신규) | 오늘 블록 렌더 |
| `lib/home/banners.ts` (신규) | 배너 카드 정의 + 1번 카드 결정 규칙 (순수) |
| `components/home/HeroSlot.tsx` (신규) | 무이력=현행 hero / 재방문=캐러셀 분기 |
| `components/home/PromoCarousel.tsx` (신규) | 캐러셀 (최대 3장, 도트, reduced-motion) |
| `components/home/CrossLinkSlots.tsx` (신규) | 크로스링크 슬롯 2 (시뮬 미출시 시 ① 생략) |
| `lib/fortune/categories.ts` (신규) | 운세 탭 의도축 카테고리 배정 |
| `app/fortune/page.tsx` (수정) | 카테고리 섹션 렌더 |
| `app/page.tsx` (수정) | 슬롯 조립 + `handleSelect` → 공유 헬퍼 전환 |
| `components/layout/Footer.tsx` (수정) | 콘텐츠 링크 행 추가 |

---

### Task 1: 【게이트】 규칙 3건 확정 — 사용자 O/X

코드 없음. 아래 3개 표를 사용자에게 제시하고 승인받는다. **승인 전에 Task 5 이후로 진행하지 않는다**(Task 2~4 는 병행 가능 — 관측·목업이라 규칙과 독립).

- [ ] **Step 1: 오늘 블록 신호 우선순위 + 상한 제안**

**상한 3줄** (4종이 다 뜨면 화면을 먹는다). 순서:

| 순위 | 신호 | 근거 |
|---|---|---|
| 1 | **관계 스레드 이어가기** (패스 남은 일수) | 시한성 + 유일한 반복 매출 |
| 2 | **안 본 결과 카드 N장** | 미열람 8.0% 문제의 직접 통로 |
| 3 | **이어할 수 있는 타로 대화** | 기존 `hasResumable` 배너의 승계 |
| 4 | 오늘의 운세 미열람 | **무료라 매출 기여 최소 → 마지막.** ⚠️E3 에서 데일리로 재설계되면 1순위로 승격 |

- [ ] **Step 2: 운세 탭 카테고리 배정 제안**

`FORTUNE_LIST`(`lib/fortune/types.ts:177-184`)의 활성 6종을 3 카테고리로:

| 카테고리 | 상품 | 확장 시 들어올 것 |
|---|---|---|
| **연애·관계** | 연애 궁합 ⭐40 · 인간관계 궁합 ⭐35 | 관계 관련 신규 리포트 |
| **나** | 2026년 사주 분석 ⭐60 | 기질 리포트 시리즈 |
| **시기** | 이번달 ⭐20 · 좋은 날 ⭐35 · 오늘의 운세 무료 | 신년운세 등 시즌 |

`compat` 과 `compat_social` 을 한 묶음으로 둔 이유: 둘 다 **"두 사람"** 상품이라 유저 의도가 같다. 카테고리를 4개로 늘리면 1/1/1/3 으로 불균형해진다.

- [ ] **Step 3: 배너 우선순위 세부 조건 제안**

스펙 §3 의 4순위 중 **③ 미열람 결과를 배너에서 제외**할 것을 제안한다 — 오늘 블록 2순위와 중복 노출된다.

| 순위 | 카드 | 표시 조건 |
|---|---|---|
| 1 | 첫충전 +20% | 로그인 AND 해당 유저 `payments` row 0건 |
| 2 | 신상품 | `lib/home/banners.ts` 의 `PROMO_BANNERS` 에 활성 기간이 겹치는 항목 |
| 3 | 가이드 소개 | 항상 (플랜 A 의 `/guide` 로 유도) |
| — | ~~미열람 결과~~ | **제외** — 오늘 블록과 중복 |

무이력 유저는 캐러셀 대신 **현행 hero 그대로**(스펙 §3).

- [ ] **Step 4: 사용자 승인 기록**

승인된 내용을 이 플랜 파일에 `✅승인 2026-MM-DD` 로 표기하고 커밋한다. 수정 요청이 있으면 해당 표를 고쳐 반영한 뒤 커밋.

```bash
git add docs/superpowers/plans/2026-07-27-e1b-tab-ia-home.md
git commit -m "docs(plan): E1-B 규칙 3건 사용자 승인 반영"
```

---

### Task 2: 홈 세로 예산 브라우저 실측 (스펙 §8-1)

스펙의 "~600px" 는 CSS 계산치다. 배너·오늘 블록 높이 설계의 근거이므로 실측한다.

- [ ] **Step 1: dev 서버 기동 + 모바일 뷰포트**

`preview_start` 로 dev 서버를 띄우고 `resize_window` 로 375×667 → 390×844 두 번 측정한다.

- [ ] **Step 2: 첫 태그 카드까지의 오프셋 측정**

브라우저 콘솔에서:

```js
(() => {
  const tag = document.querySelector('#emotion-grid button');
  const r = tag.getBoundingClientRect();
  return {
    viewport: window.innerHeight,
    firstTagTop: Math.round(r.top + window.scrollY),
    firstTagVisible: r.top < window.innerHeight,
  };
})()
```

- [ ] **Step 3: 기록**

| 뷰포트 | `firstTagTop` 실측 | 첫 화면에 보이는 태그 카드 수 |
|---|---|---|
| 375×667 | | |
| 390×844 | | |

**실측이 계산치(~600px)와 ±80px 이상 다르면** 스펙 §3 의 "배너 ~120px / 오늘 블록 ~130px" 예산을 재계산하고 이 플랜의 Task 7·8 목표 높이를 고친다.

- [ ] **Step 4: 측정 결과를 플랜에 기록 + Commit**

```bash
git add docs/superpowers/plans/2026-07-27-e1b-tab-ia-home.md
git commit -m "docs(plan): 홈 세로 예산 브라우저 실측 결과 기록"
```

---

### Task 3: 궁합 크로스링크 클릭률 확인 (스펙 §8-2)

크로스링크 슬롯 ②(연애 궁합)를 유지할지 판단하는 근거. 현재 `app/page.tsx:327-362` 에 금테 카드로 이미 존재한다.

- [ ] **Step 1: prod 조회**

```bash
node scripts/run-prod-query.mjs "
SELECT
  COUNT(*) FILTER (WHERE path = '/') AS home_pv,
  COUNT(*) FILTER (WHERE path LIKE '/fortune/compat%') AS compat_pv,
  COUNT(DISTINCT user_id) FILTER (WHERE path LIKE '/fortune/compat%') AS compat_users
FROM page_views
WHERE created_at >= now() - interval '30 days'
  AND (user_id IS NULL OR user_id::text NOT IN (
    SELECT id::text FROM users WHERE LEFT(id::text,8) IN
    ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
  ));
"
```

> `page_views` 어드민 제외는 **반드시 `user_id IS NULL OR ...` 형태**로 감싼다 — `NOT IN` 만 쓰면 비로그인 PV 가 SQL 3값 논리로 전부 사라진다(AGENTS.md 운영 함정).
> `scripts/run-prod-query.mjs` 는 `read_only:true` 고정이므로 안전하다.

- [ ] **Step 2: 판정**

| 결과 | 조치 |
|---|---|
| `compat_pv / home_pv` ≥ 2% | 슬롯 ② **유지** |
| < 2% 또는 `compat_users` 0 | 슬롯 ② **비움** → 홈은 순수 고민톡. Task 9 에서 슬롯 ① 만 구현 |

> `page_views` 는 홈 PV 대비 비율만 본다. 궁합 카드 클릭 자체는 별도 이벤트가 없으므로 `/fortune/compat` 도달을 프록시로 쓴다 — 다른 진입 경로(운세 탭)가 섞이므로 **상한 추정**이다. 2% 미달이면 확실히 죽은 것이고, 넘으면 유지해도 손해가 없다.

- [ ] **Step 3: 결과 기록 + Commit**

---

### Task 4: 【게이트】 목업 승인 3건

코드 전에 시각 형태를 확정한다. 스펙이 **구조**(슬롯 순서·높이 예산·항목 종류)를 이미 고정했으므로 이 게이트는 **스타일·카피만** 결정한다 — 구조를 바꾸는 요청이 나오면 스펙으로 되돌아간다.

- [ ] **Step 1: 오늘 블록 목업 제시**

결정할 것:
- 한 카드 안에 divider 로 줄 나열 vs 항목별 개별 카드
- 항목별 아이콘·강조색
- 헤딩 카피 (`{닉네임}야, 오늘의 별콩이` 형태 vs 다른 안)
- 항목 0건일 때 완전 미렌더 확인

- [ ] **Step 2: hero 캐러셀 목업 제시**

결정할 것:
- 이미지 있는 카드 vs 텍스트 카드. `public/byeolkong-*.png` 포즈셋 재활용 여부(`byeolkong-cheer`·`byeolkong-joy`·`byeolkong-shop` 등 존재)
- 카드 높이(목표 ~120px) · 도트 위치 · 카드 1장일 때 도트 숨김

- [ ] **Step 3: 무이력 뷰 목업 제시**

결정할 것: **"이렇게 사용해요" 카드(~138px)를 남기나.** hero 는 유지 확정이므로, 이 카드를 빼면 무이력 유저도 첫 화면에 태그를 더 볼 수 있다. 단 첫 방문자 안내가 사라지는 트레이드오프.

⚠️ 무이력 뷰를 바꾸면 **신규 CVR·SEO 리스크 0** 이라는 스펙의 근거가 약해진다. 남기는 쪽이 기본값이다.

- [ ] **Step 4: 승인 내용을 플랜에 기록 + Commit**

---

### Task 5: 하단탭 라벨 변경

**Files:**
- Modify: `components/layout/BottomTab.tsx:24-79` (`TABS` 의 `label` 만)

경로·`matchPrefixes`·아이콘은 **전부 무변경**. `key` 도 유지한다(`history` 키가 `/relationship` 을 가리키는 기존 명명은 어색하지만, 바꾸면 `?from=history` 하이라이트 로직과 얽힌다 — 손대지 않는다).

- [ ] **Step 1: 라벨 5개 교체**

| `key` | 현재 `label` | 새 `label` |
|---|---|---|
| `consult` | `고민톡` | `홈` |
| `fortune` | `별콩 운세` | `운세` |
| `history` | `연애 상담` | `그 사람` |
| `shop` | `별콩 상점` | `상점` |
| `me` | `내 정보` | `마이` |

- [ ] **Step 2: 타입·빌드 확인**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공.

- [ ] **Step 3: 라벨 잔존 참조 확인**

```bash
grep -rn "내 고민톡\|별콩 운세\|연애 상담\|별콩 상점\|내 정보" --include=*.tsx --include=*.ts app/ components/ lib/ | grep -v BottomTab
```

`app/fortune/page.tsx:144` 의 "결과는 **내 고민톡**에서 다시 볼 수 있어" 는 **보관함**을 가리키는 문구다(스펙 §2). 탭 라벨이 "홈"으로 바뀌면 이 문구가 더 헷갈리므로 **"보관함에서 다시 볼 수 있어"** 로 고친다. 그 외 매칭은 사용자에게 목록으로 보고하고 판단받는다.

- [ ] **Step 4: 브라우저 확인 + Commit**

dev 서버에서 하단탭 5개 라벨이 새 값으로 렌더되고, 각 탭 이동·active 하이라이트가 정상인지 확인.

```bash
git add components/layout/BottomTab.tsx app/fortune/page.tsx
git commit -m "feat(ia): 하단탭 라벨 5개 재정의(경로·매칭 무변경) + '내 고민톡' 문구 정정"
```

---

### Task 6: 오늘 블록 집계 엔드포인트 + 우선순위 규칙

**Files:**
- Create: `lib/home/today.ts`
- Test: `lib/home/today.test.ts`
- Create: `app/api/home/today/route.ts`

신호 4종을 클라에서 API 4번 긁지 않고 **서버가 한 번에** 계산한다. 스펙 §3 대로 **지금 채울 수 있는 4종만** 구현한다(E3 좋은날 · E4 편지는 각 상품 스펙에서 항목을 추가).

- [ ] **Step 1: 우선순위 규칙 실패 테스트**

Create `lib/home/today.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTodayItems, TODAY_MAX_ITEMS, type TodaySignals } from "./today.ts";

const empty: TodaySignals = {
  relationship: null,
  unviewedResults: 0,
  resumableTarot: false,
  dailyFortuneUnused: false,
};

test("신호가 없으면 빈 배열 — 블록 자체를 렌더하지 않는다", () => {
  assert.deepEqual(pickTodayItems(empty), []);
});

test("우선순위 = 관계 > 미열람 > 이어가기 > 오늘의 운세", () => {
  const items = pickTodayItems({
    relationship: { name: "민준", daysLeft: 4, lastTalkedDaysAgo: 3 },
    unviewedResults: 2,
    resumableTarot: true,
    dailyFortuneUnused: true,
  });
  assert.deepEqual(
    items.map((i) => i.kind),
    ["relationship", "unviewed", "resumable"]
  );
});

test("상한 3개 — 4종이 다 있어도 3개만", () => {
  const items = pickTodayItems({
    relationship: { name: "민준", daysLeft: 4, lastTalkedDaysAgo: 3 },
    unviewedResults: 1,
    resumableTarot: true,
    dailyFortuneUnused: true,
  });
  assert.equal(items.length, TODAY_MAX_ITEMS);
});

test("상위 신호가 없으면 하위가 올라온다", () => {
  const items = pickTodayItems({ ...empty, dailyFortuneUnused: true });
  assert.deepEqual(items.map((i) => i.kind), ["daily"]);
});

test("미열람 0건이면 항목이 생기지 않는다", () => {
  const items = pickTodayItems({ ...empty, unviewedResults: 0, resumableTarot: true });
  assert.deepEqual(items.map((i) => i.kind), ["resumable"]);
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `node --import tsx --test lib/home/today.test.ts`
Expected: FAIL — `Cannot find module './today.ts'`

- [ ] **Step 3: 규칙 구현**

Create `lib/home/today.ts`:

```ts
// 홈 "오늘 블록" 신호 → 표시 항목. 순수 함수 (서버·클라 공용, 테스트 가능).
// 우선순위 근거는 스펙 §3 + 플랜 B Task 1 사용자 승인.
// ⚠️ E3 에서 오늘의 운세가 데일리로 재설계되면 'daily' 를 1순위로 승격한다.

export const TODAY_MAX_ITEMS = 3;

export type TodayKind = "relationship" | "unviewed" | "resumable" | "daily";

export interface RelationshipSignal {
  name: string;
  /** 활성 패스 남은 일수. 패스 없으면 0 */
  daysLeft: number;
  lastTalkedDaysAgo: number;
}

export interface TodaySignals {
  relationship: RelationshipSignal | null;
  unviewedResults: number;
  resumableTarot: boolean;
  dailyFortuneUnused: boolean;
}

export interface TodayItem {
  kind: TodayKind;
  title: string;
  sub?: string;
  href: string;
}

/** 우선순위 순으로 최대 TODAY_MAX_ITEMS 개. 신호 0이면 빈 배열. */
export function pickTodayItems(s: TodaySignals): TodayItem[] {
  const items: TodayItem[] = [];

  if (s.relationship) {
    const r = s.relationship;
    items.push({
      kind: "relationship",
      title: `${r.name}와 이어서 얘기하기`,
      sub:
        r.daysLeft > 0
          ? `${r.lastTalkedDaysAgo}일 전 · 패스 ${r.daysLeft}일 남음`
          : `${r.lastTalkedDaysAgo}일 전`,
      href: "/relationship",
    });
  }

  if (s.unviewedResults > 0) {
    items.push({
      kind: "unviewed",
      title: `안 본 결과 카드 ${s.unviewedResults}장`,
      href: "/readings?from=history",
    });
  }

  if (s.resumableTarot) {
    items.push({
      kind: "resumable",
      title: "이어서 나눌 수 있는 대화가 있어",
      href: "/readings?from=history",
    });
  }

  if (s.dailyFortuneUnused) {
    items.push({
      kind: "daily",
      title: "오늘의 운세 아직 안 봤어",
      sub: "무료",
      href: "/fortune/daily",
    });
  }

  return items.slice(0, TODAY_MAX_ITEMS);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --import tsx --test lib/home/today.test.ts`
Expected: `# pass 5` / `# fail 0`

- [ ] **Step 5: 집계 엔드포인트**

Create `app/api/home/today/route.ts`.

**스키마 근거 (확인된 실제 컬럼 — 추측 금지)**

| 쓰는 것 | 근거 |
|---|---|
| `readings.result_viewed_at` | `supabase/migrations/20260711000000_readings_result_viewed.sql:4` |
| `relationships.label` (호칭) | `20260718000000_relationship_core.sql:8` — **`display_name` 은 없다** |
| `relationships.thread_reading_id` | 같은 파일 `:12`. **`messages.relationship_id` 는 없다** — 스레드 메시지는 `messages.reading_id = thread_reading_id` 로 찾는다 |
| `relationship_passes.expires_at` | 같은 파일 `:32` |
| `messages.content` 의 `[END]` | `app/api/readings/route.ts:114` 와 동일 판정 |

유저당 관계는 1개다(`idx_relationships_user_one` UNIQUE).

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";
import { pickTodayItems, type TodaySignals } from "@/lib/home/today";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: number) =>
  Math.max(0, Math.floor((to - new Date(from).getTime()) / DAY_MS));

export async function GET() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ items: [] });

  const supa = getServiceSupabase();
  const now = Date.now();

  // ── 관계 스레드: 관계 파일(유저당 1개) + 스레드 마지막 발화 + 활성 패스
  const { data: rel } = await supa
    .from("relationships")
    .select("id, label, thread_reading_id")
    .eq("user_id", userId)
    .maybeSingle();

  let relationship: TodaySignals["relationship"] = null;
  if (rel?.thread_reading_id) {
    // 스레드 메시지는 reading_id 로 연결된다 (messages.relationship_id 는 존재하지 않음)
    const { data: lastMsg } = await supa
      .from("messages")
      .select("created_at")
      .eq("reading_id", rel.thread_reading_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: pass } = await supa
      .from("relationship_passes")
      .select("expires_at")
      .eq("relationship_id", rel.id)
      .gt("expires_at", new Date(now).toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // 발화가 한 번도 없으면 "이어서"가 아니라 콜드스타트 → 항목 생성 안 함
    // (등록 15건 중 14건 무발화 — 이 유저들에게 "이어서 얘기하기"는 거짓말이다)
    if (lastMsg) {
      relationship = {
        name: rel.label,
        daysLeft: pass
          ? Math.ceil((new Date(pass.expires_at).getTime() - now) / DAY_MS)
          : 0,
        lastTalkedDaysAgo: daysBetween(lastMsg.created_at, now),
      };
    }
  }

  // ── 상담 reading 들: 미열람 결과 수 + 이어가기 가능 여부
  const { data: readings } = await supa
    .from("readings")
    .select("id, emotion_tag, result_viewed_at")
    .eq("user_id", userId)
    .neq("consultation_type", "relationship")
    .order("created_at", { ascending: false })
    .limit(50);

  const consultIds = (readings ?? [])
    .filter((r) => !fortuneTypeFromTag(r.emotion_tag))
    .map((r) => r.id);

  const endedSet = new Set<string>();
  if (consultIds.length > 0) {
    const { data: msgs } = await supa
      .from("messages")
      .select("reading_id, content")
      .in("reading_id", consultIds)
      .eq("role", "assistant");
    for (const m of msgs ?? []) {
      if (m.content.includes("[END]")) endedSet.add(m.reading_id);
    }
  }

  const unviewedResults = (readings ?? []).filter(
    (r) => endedSet.has(r.id) && r.result_viewed_at === null
  ).length;
  const resumableTarot = consultIds.some((id) => !endedSet.has(id));

  // ── 오늘의 운세 무료분 잔여 (평생 5회 — FORTUNE_CONFIG.daily.freeLimit)
  const { count: dailyUsed } = await supa
    .from("readings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("emotion_tag", FORTUNE_CONFIG.daily.emotionTag);
  const dailyFortuneUnused =
    (dailyUsed ?? 0) < (FORTUNE_CONFIG.daily.freeLimit ?? 0);

  const items = pickTodayItems({
    relationship,
    unviewedResults,
    resumableTarot,
    dailyFortuneUnused,
  });

  return NextResponse.json({ items });
}
```

- [ ] **Step 6: 엔드포인트 스모크 (로컬)**

```bash
npm run dev &
sleep 4
curl -s localhost:3000/api/home/today
```
Expected: 비로그인이므로 `{"items":[]}`.

로컬 어드민 쿠키 주입으로 로그인 상태를 만들어 항목이 최대 3개까지만 나오는지 확인한다(`admin-local-verify-trick` 메모리 참조 — **검증 후 원복 필수**).

- [ ] **Step 7: 타입 확인 + Commit**

```bash
npx tsc --noEmit
git add lib/home/today.ts lib/home/today.test.ts app/api/home/today/route.ts
git commit -m "feat(home): 오늘 블록 집계 엔드포인트 + 우선순위 규칙(상한 3, 신호 0이면 미렌더)"
```

---

### Task 7: 오늘 블록 UI

**Files:**
- Create: `components/home/TodayBlock.tsx`
- Modify: `app/page.tsx` (`hasResumable` 배너를 오늘 블록으로 교체)

Task 4 목업 승인 결과가 스타일을 정한다. 아래는 **승인 전 기본안**이고, 구조(항목 순서·미렌더 조건·목적지)는 스펙 고정이라 바뀌지 않는다.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TodayItem } from "@/lib/home/today";

const ICON: Record<string, string> = {
  relationship: "💬",
  unviewed: "🃏",
  resumable: "💬",
  daily: "🌤️",
};

/** 홈 상단 "오늘 블록" — 항목 0건이면 아무것도 렌더하지 않는다(가변 높이). */
export default function TodayBlock({ nickname }: { nickname?: string | null }) {
  const [items, setItems] = useState<TodayItem[] | null>(null);

  useEffect(() => {
    const load = () =>
      void fetch("/api/home/today", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setItems((d?.items ?? []) as TodayItem[]))
        .catch(() => setItems([]));
    load();
    // AuthBootstrap 세션 sync 후 재계산 (홈의 기존 패턴과 동일)
    const onUserUpdated = () => load();
    window.addEventListener("byeolkong:user-updated", onUserUpdated);
    return () =>
      window.removeEventListener("byeolkong:user-updated", onUserUpdated);
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section className="mb-5 animate-fade-in" aria-label="오늘의 별콩이">
      <p className="text-[13px] font-bold text-eye-purple mb-2 px-1">
        {nickname ? `${nickname}야, ` : ""}오늘의 별콩이
      </p>
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-lilac overflow-hidden">
        {items.map((it, i) => (
          <Link
            key={it.kind}
            href={it.href}
            className={[
              "flex items-center gap-2.5 px-3.5 py-3 hover:bg-lilac-soft/30 transition",
              i > 0 ? "border-t border-lilac-soft/70" : "",
            ].join(" ")}
          >
            <span className="text-[18px] shrink-0" aria-hidden>
              {ICON[it.kind]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-eye-purple leading-tight truncate">
                {it.title}
              </p>
              {it.sub && (
                <p className="text-[11.5px] text-text-light mt-0.5 leading-tight truncate">
                  {it.sub}
                </p>
              )}
            </div>
            <span className="text-lilac-mid text-[15px] shrink-0">›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 홈에서 기존 `hasResumable` 배너 교체**

`app/page.tsx:252` 의 `{hasResumable && (<Link href="/readings" …>)}` 블록 전체를 `<TodayBlock nickname={nickname} />` 로 교체한다. `hasResumable` state 와 그것만 쓰던 계산 로직은 **오늘 블록이 서버에서 같은 판정을 하므로 제거**한다(내 변경이 만든 orphan — CLAUDE.md §3).

⚠️ `welcomeNudge` 는 **남긴다** — 오늘 블록과 대상이 다르다(리딩 0건 신규 유저). 오늘 블록은 신호가 없으면 미렌더이므로 충돌하지 않는다.

닉네임은 홈이 이미 읽는 `localStorage["byeolkong_user"]` 에서 꺼낸다. `app/page.tsx:46-53` 의 파싱 패턴을 재사용한다.

- [ ] **Step 3: 【이미지 제안】 오늘 블록 — 물어보되 비추천**

```
【이미지 제안】 오늘 블록 항목 아이콘 4종
· 어디에      : TodayBlock 각 줄 왼쪽 · 표시 18px
· 포즈·구도   : (제안 불가 — 아래 참조)
· 곁들일 문구 : —
· 산출물      : —
· 크레딧      : 2안×4종 = 16
→ 제 의견은 "만들지 않기" 입니다. 이유:
  18px 에서는 별콩이의 이마 별·후광·표정이 전부 소실돼 색 덩어리로 보입니다.
  같은 16 크레딧을 hero 캐러셀 카드 배경(112px, 전체폭)에 쓰는 게
  같은 돈으로 6배 큰 지면을 얻습니다.
  대안: 현행 이모지 유지, 또는 별·카드·편지 같은 **오브젝트만** 그린
  미니 아이콘(캐릭터 없이) — 이건 18px 에서도 읽힙니다.
→ 어떻게 할까요?  이모지 유지 / 오브젝트 미니 아이콘 / 그래도 별콩이로 만들기
```

- [ ] **Step 4: 검증**

```bash
npx tsc --noEmit && npm run build
```

브라우저(로컬, 로그인 상태)에서:
- 오늘 블록이 최대 3줄만 렌더
- 각 줄 클릭 → 목적지 정상 (`/relationship`, `/readings?from=history`, `/fortune/daily`)
- **신호 0인 유저(시크릿 창 비로그인)에서 블록이 아예 없음**
- `grep -n "hasResumable" app/page.tsx` → **0건**(orphan 제거 확인)

- [ ] **Step 5: Commit**

```bash
git add components/home/TodayBlock.tsx app/page.tsx
git commit -m "feat(home): 오늘 블록 — 개인화 진열(상한 3, 신호 0이면 미렌더). hasResumable 배너 승계"
```

---

### Task 8: hero 슬롯 + 홍보 캐러셀

**Files:**
- Create: `lib/home/banners.ts`
- Test: `lib/home/banners.test.ts`
- Create: `components/home/PromoCarousel.tsx`
- Modify: `app/page.tsx` (hero 섹션을 상태 분기)

**핵심 제약 (스펙 §3):** 무이력 뷰는 **현행 hero 그대로**. 그게 신규 CVR·SEO 리스크 0의 근거다. 크롤러는 항상 비로그인이므로 자동으로 무이력 뷰를 본다.

- [ ] **Step 1: 배너 규칙 실패 테스트**

Create `lib/home/banners.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBanners, BANNER_MAX } from "./banners.ts";

test("무이력(비로그인)이면 빈 배열 — 홈이 현행 hero 를 렌더한다", () => {
  assert.deepEqual(pickBanners({ isLoggedIn: false, hasPaid: false, promos: [] }), []);
});

test("1번 카드는 첫충전 — 결제 이력 없는 로그인 유저", () => {
  const b = pickBanners({ isLoggedIn: true, hasPaid: false, promos: [] });
  assert.equal(b[0].id, "first_charge");
});

test("결제 이력이 있으면 첫충전 카드가 빠진다", () => {
  const b = pickBanners({ isLoggedIn: true, hasPaid: true, promos: [] });
  assert.ok(!b.some((x) => x.id === "first_charge"));
});

test("신상품 프로모가 첫충전 다음", () => {
  const b = pickBanners({
    isLoggedIn: true,
    hasPaid: false,
    promos: [{ id: "sim_launch", title: "연애 시뮬레이션 출시", sub: "", href: "/relationship" }],
  });
  assert.deepEqual(b.slice(0, 2).map((x) => x.id), ["first_charge", "sim_launch"]);
});

test("상한 3장", () => {
  const b = pickBanners({
    isLoggedIn: true,
    hasPaid: false,
    promos: [
      { id: "p1", title: "a", sub: "", href: "/" },
      { id: "p2", title: "b", sub: "", href: "/" },
      { id: "p3", title: "c", sub: "", href: "/" },
    ],
  });
  assert.equal(b.length, BANNER_MAX);
});

test("가이드 카드는 항상 후보에 있어 로그인 유저는 최소 1장", () => {
  const b = pickBanners({ isLoggedIn: true, hasPaid: true, promos: [] });
  assert.ok(b.length >= 1);
  assert.equal(b[b.length - 1].id, "guide");
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `node --import tsx --test lib/home/banners.test.ts`
Expected: FAIL — `Cannot find module './banners.ts'`

- [ ] **Step 3: 규칙 구현**

Create `lib/home/banners.ts`:

```ts
// 홈 hero 슬롯 캐러셀. 최대 3장, 1번 카드는 우선순위가 결정한다.
// 근거: 스펙 §3 "배너 정책 — 캐러셀". 캐러셀 첫 카드 이후 ~70% 이탈이라
// 1번 선정이 가장 중요하고, 2·3번 클릭은 ?b= 계측으로 사후 판정한다.
// ⚠️ 미열람 결과는 의도적으로 제외 — 오늘 블록 2순위와 중복 노출된다.

export const BANNER_MAX = 3;

export interface Banner {
  id: string;
  title: string;
  sub: string;
  href: string;
}

export interface BannerInput {
  isLoggedIn: boolean;
  /** payments row 보유 여부 */
  hasPaid: boolean;
  /** 활성 기간이 겹치는 신상품 프로모 (기간 판정은 호출측) */
  promos: Banner[];
}

/** 클릭 계측 — 목적지에 ?b=<id> 를 붙여 기존 page_views 로 잡는다 */
export function bannerHref(b: Banner): string {
  return `${b.href}${b.href.includes("?") ? "&" : "?"}b=${b.id}`;
}

export function pickBanners(input: BannerInput): Banner[] {
  // 무이력(비로그인)은 캐러셀 없음 → 홈이 현행 hero 를 렌더
  if (!input.isLoggedIn) return [];

  const out: Banner[] = [];

  if (!input.hasPaid) {
    out.push({
      id: "first_charge",
      title: "첫 충전엔 별을 20% 더 줄게",
      sub: "지금 충전하면 보너스가 붙어",
      href: "/shop",
    });
  }

  out.push(...input.promos);

  out.push({
    id: "guide",
    title: "고민별 타로 가이드가 생겼어",
    sub: "재회·짝사랑·썸 — 어떻게 보는지 정리했어",
    href: "/guide",
  });

  return out.slice(0, BANNER_MAX);
}

/** 신상품 프로모 등록소. 기간이 지나면 배열에서 지운다(코드 상수 = 정본). */
export const PROMO_BANNERS: (Banner & { from: string; to: string })[] = [];
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --import tsx --test lib/home/banners.test.ts`
Expected: `# pass 6` / `# fail 0`

- [ ] **Step 5: 【이미지 제안】 캐러셀 카드 배경 3종 — 이 플랜에서 값이 가장 높은 슬롯**

홈 최상단 · 전체폭 × 112px · 로그인 유저 **전원이 매 방문마다** 본다. 기존 `byeolkong-*.png` 는 세로 투명 캐릭터 컷이라 와이드 배너에 그대로 못 쓴다.

```
【이미지 제안】 hero 캐러셀 카드 배경 3종
· 어디에      : 홈 최상단 PromoCarousel 각 카드 배경 · 전체폭(448px) × 112px
· 포즈·구도   : 가로 와이드. 별콩이는 오른쪽 1/3, 왼쪽 2/3 는 텍스트가 얹히므로
                비워 둔다(연한 그라데이션). 각 카드 —
                  ① 첫충전   별이 담긴 주머니를 들어 보이며 눈 반짝
                             (기존 byeolkong-shop 의 와이드 재해석)
                  ② 신상품   두 개의 별을 마주 놓고 사이를 들여다보는 옆모습
                             (시뮬 "그 사람" 은유 — 출시 배너에 쓸 것)
                  ③ 가이드   펼친 책 위에 카드 몇 장이 떠 있고 그 옆에서 안내
· 곁들일 문구 : ① "첫 충전엔 별을 20% 더 줄게"
                ② (신상품명에 맞춰 출시 시점에 결정)
                ③ "고민별 타로 가이드가 생겼어"
                ※ 문구는 이미지에 굽지 않고 HTML 텍스트로 얹는다 —
                  카피 수정 때 재생성이 필요 없고 접근성·번역에도 유리
· 산출물      : public/banner-{first-charge,promo-sim,guide}.webp
                · 16:9 생성 후 상하 크롭 · 배경 포함
· 크레딧      : 2안×3종 = 12 (누적 X/72)
→ 진행할까요?  예 / 다른 구도로 / 1~2종만 먼저 / 그라데이션만 쓰고 이미지 없이
```

**⚠️ 문구를 이미지에 넣지 않는 이유**를 제안에 함께 전달한다 — E2 웹툰 캐러셀의 제작 제약 ①("텍스트 많은 이미지는 Meta 배급엔진이 예상 CTR 을 낮게 잡아 CPM↑")과 같은 원리이고, 여기서는 그보다 **카피 A/B 가 재생성 없이 가능**하다는 게 더 크다.

②는 시뮬(E6) 출시 시점에 쓰는 것이라 **지금 만들면 재고**가 된다. 제안 시 "①③만 먼저"를 기본안으로 제시한다.

- [ ] **Step 6: 캐러셀 컴포넌트**

Create `components/home/PromoCarousel.tsx`. 스와이프는 CSS scroll-snap 으로 구현하고 JS 는 도트 동기화·자동 회전만 맡는다.

**Step 5 에서 이미지가 승인된 경우**: `Banner` 인터페이스에 `image?: string` 을 추가하고, 카드 div 를 `relative` 로 두고 `<Image src={b.image} fill className="object-cover -z-10" />` 를 깔고 텍스트를 그 위에 얹는다. 승인되지 않았으면 아래 코드의 그라데이션 배경을 그대로 쓴다.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { bannerHref, type Banner } from "@/lib/home/banners";

const ROTATE_MS = 5500;

/** 홈 hero 슬롯 홍보 캐러셀 — 최대 3장. 1장이면 도트를 숨긴다. */
export default function PromoCarousel({ banners }: { banners: Banner[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  // 자동 회전 — 접근성(움직임 최소화) 존중, 2장 이상일 때만
  useEffect(() => {
    if (banners.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      const el = trackRef.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % banners.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="w-full max-w-md mx-auto px-5 pt-4">
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIdx(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none rounded-2xl"
        style={{ scrollbarWidth: "none" }}
      >
        {banners.map((b) => (
          <Link
            key={b.id}
            href={bannerHref(b)}
            className="snap-center shrink-0 w-full"
          >
            <div className="h-[112px] flex flex-col justify-center px-4 bg-gradient-to-br from-lilac-soft via-lilac to-gold-soft/60 border border-lilac-mid/40 rounded-2xl">
              <p className="text-[15px] font-bold text-eye-purple leading-snug">
                {b.title}
              </p>
              <p className="text-[12px] text-eye-purple/75 mt-1 leading-snug">
                {b.sub}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2" aria-hidden>
          {banners.map((b, i) => (
            <span
              key={b.id}
              className={[
                "h-1.5 rounded-full transition-all",
                i === idx ? "w-4 bg-lilac-deep" : "w-1.5 bg-lilac-mid/50",
              ].join(" ")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: 홈에서 hero 슬롯 분기**

`app/page.tsx` 의 hero `<section>`(`:161-182` 영역 + 말풍선 `:185-201`)을 조건 분기한다.

**작업 방식: 기존 JSX 를 잘라내서 `else` 분기에 그대로 붙인다.** 새로 타이핑하거나 손보지 않는다 — 무이력 뷰가 현행과 **바이트 단위로 동일**해야 스펙 §3 의 "신규 CVR·SEO 리스크 0" 근거가 성립한다. 별 파티클·`animate-float`·`textShadow` 인라인 스타일까지 전부 유지.

```tsx
{banners.length > 0 ? (
  <PromoCarousel banners={banners} />
) : (
  <>
    {/* ↓ app/page.tsx 의 기존 hero section(별 파티클 포함) + 말풍선 블록을
        잘라내어 여기에 그대로 붙인다. 내용 수정 금지. */}
  </>
)}
```

붙인 뒤 `git diff` 로 확인한다 — hero 관련 라인이 **이동만** 되고 `-`/`+` 쌍의 내용이 동일해야 한다(들여쓰기 변화는 허용).

`banners` 는 `pickBanners({ isLoggedIn, hasPaid, promos: activePromos() })` 로 계산한다.
- `isLoggedIn` — 기존 `localStorage["byeolkong_user"]` 판정 재사용
- `hasPaid` — `/api/payments/list` 응답의 항목 수 > 0 (기존 엔드포인트 재사용, 새 API 만들지 않음)
- `activePromos()` — `PROMO_BANNERS` 를 `from`/`to` 로 필터. 현재 배열이 비어 있어 결과는 `[]`

- [ ] **Step 8: 검증**

```bash
npx tsc --noEmit && npm run build
```

브라우저:
- **시크릿 창(비로그인)** → 현행 hero + 말풍선 그대로. 캐러셀 없음 ← **스펙 §3 의 핵심 조건**
- 로그인 + 결제 이력 없음 → 카드 2장(첫충전 · 가이드), 도트 2개, 5.5초 후 자동 이동
- 카드 클릭 → URL 에 `?b=first_charge` 붙어 이동
- OS 설정에서 "동작 줄이기" ON → 자동 회전 멈춤

- [ ] **Step 9: Commit**

```bash
git add lib/home/banners.ts lib/home/banners.test.ts components/home/PromoCarousel.tsx app/page.tsx public/banner-*.webp
git commit -m "feat(home): hero 슬롯 상태 분기 + 홍보 캐러셀(최대3장·1번카드 규칙·?b= 계측)"
```

---

### Task 9: 크로스링크 슬롯 2

**Files:**
- Create: `components/home/CrossLinkSlots.tsx`
- Modify: `app/page.tsx:327-362` (기존 궁합 카드를 컴포넌트로 이전)

**슬롯 상태 (스펙 §3-b + Task 3 결과에 따름)**

| 슬롯 | 상품 | 이 플랜 시점 |
|---|---|---|
| ① | 연애 시뮬레이션 | **E6 미출시 → 비움.** 미완성 상품 자리를 미리 그리지 않는다(스펙 §7 순서 의존 1) |
| ② | 연애 궁합 ⭐40 | 기존 카드 이전. **Task 3 에서 2% 미달이면 이 슬롯도 비움** |

- [ ] **Step 1: 컴포넌트로 추출**

`app/page.tsx:327-362` 의 궁합 `<Link>` 블록을 `components/home/CrossLinkSlots.tsx` 로 그대로 옮기고, 슬롯을 배열로 다룬다. 슬롯이 0개면 앞의 디바이더(`:320-324`)까지 렌더하지 않는다.

```tsx
import Link from "next/link";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";

interface Slot {
  id: string;
  href: string;
  emoji: string;
  title: string;
  cost?: number;
  desc: string;
  hashtags: string[];
}

/**
 * 홈 크로스링크 슬롯 — 최대 2. 자격: ①연애 의도와 겹침 ②태그 상담으로 대체 안 되는
 * 다른 형식 ③슬롯 여유. 카탈로그 진열이 아니다(스펙 §3-b).
 * 슬롯 ①(연애 시뮬레이션)은 E6 출시 후 여기 추가한다.
 */
const SLOTS: Slot[] = [
  {
    id: "compat",
    href: "/fortune/compat",
    emoji: "💞",
    title: "우리 사주 연애 궁합은 어떨까?",
    cost: FORTUNE_CONFIG.compat.cost,
    desc: "두 사람 생년월일로 사주 궁합 보기",
    hashtags: ["궁합", "사주", "두사람"],
  },
];

export default function CrossLinkSlots() {
  if (SLOTS.length === 0) return null;
  return (
    <>
      <div className="flex items-center gap-3 mb-4" aria-hidden>
        <span className="flex-1 h-px bg-lilac-mid/40" />
        <span className="text-gold text-[11px]">✦</span>
        <span className="flex-1 h-px bg-lilac-mid/40" />
      </div>
      {SLOTS.map((s) => (
        <Link
          key={s.id}
          href={s.href}
          className="flex items-center gap-3.5 p-4 mb-3 bg-white/90 backdrop-blur-sm rounded-2xl border-2 border-gold/50 hover:border-gold transition-all text-left group"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: "linear-gradient(135deg, #FFF3D6 0%, #F2D78A 100%)" }}
          >
            <span className="text-[32px] group-hover:scale-110 transition-transform" aria-hidden>
              {s.emoji}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-eye-purple text-[16px] flex items-center gap-1.5">
              {s.title}
              {s.cost !== undefined && (
                <span className="text-[11px] font-bold text-text-light">⭐ {s.cost}별</span>
              )}
            </p>
            <p className="text-[12.5px] text-text-light mt-0.5 leading-relaxed">{s.desc}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {s.hashtags.map((h) => (
                <span
                  key={h}
                  className="text-[11px] font-bold text-eye-purple bg-gold-soft/40 px-2 py-0.5 rounded-full"
                >
                  #{h}
                </span>
              ))}
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
```

- [ ] **Step 2: 【이미지 제안】 크로스링크 카드 아이콘 — 기존 일관성 결함이 있다**

발견한 사실: **홈 태그 카드 10개는 전부 이미지 아이콘**을 쓴다(`EMOTION_OPTIONS[].icon` = `/class01.png` 등, 48px). 그런데 **바로 밑 궁합 카드만 이모지 `💞`**(32px)다. 컨테이너는 둘 다 64px 이라 같은 급의 지면인데 재질이 다르다.

```
【이미지 제안】 크로스링크 슬롯 아이콘 (최대 2종)
· 어디에      : 홈 크로스링크 카드 왼쪽 64px 컨테이너 안 · 표시 48px
                (위 태그 카드 10개와 동일 규격 — 나란히 놓이므로 재질이 같아야 함)
· 포즈·구도   : ① 궁합   두 개의 별이 실로 이어진 도상 + 별콩이가 그 사이를 가리킴
                ② 시뮬   (E6 출시 시) 별콩이와 흐릿한 그림자 인물이 마주 앉은 실루엣
· 곁들일 문구 : 카드 제목이 이미 담당 — 이미지에 텍스트 없음
· 산출물      : public/crosslink-{compat,sim}.webp · 1:1 · 투명 배경
· 크레딧      : 2안×1종(궁합만) = 4 · 시뮬은 E6 에서 별도 (누적 X/72)
→ 진행할까요?  예(궁합만) / 다른 도상으로 / 이모지 유지
```

**이 슬롯을 추천하는 이유**: 4 크레딧으로 **이미 존재하는 시각 불일치**를 고친다. 태그 카드 10개 바로 아래라 비교가 즉시 눈에 들어온다. 시뮬(②)은 E6 출시 전이라 **지금 만들면 재고**이므로 제안에서 분리한다.

- [ ] **Step 3: 홈에서 교체**

`app/page.tsx:320-362`(디바이더 + 궁합 카드)를 `<CrossLinkSlots />` 한 줄로 교체. `mb-6` 여백은 컴포넌트 마지막 카드의 `mb-3` + 다음 섹션 헤딩 마진으로 흡수되므로 렌더 결과를 눈으로 비교한다.

- [ ] **Step 4: 검증 — 시각 회귀**

브라우저에서 교체 전/후 스크린샷을 비교한다. **궁합 카드의 위치·크기·간격이 동일해야 한다** — 이 태스크는 리팩터링이고 시각 변경이 아니다.

Task 3 판정이 "2% 미달"이었으면 `SLOTS` 를 빈 배열로 두고, 컴포넌트가 `null` 을 반환해 디바이더까지 사라지는지 확인한다.

- [ ] **Step 5: Commit**

```bash
git add components/home/CrossLinkSlots.tsx app/page.tsx public/crosslink-*.webp
git commit -m "refactor(home): 궁합 크로스링크를 슬롯 컴포넌트로 추출(최대2, 시뮬은 E6에서 추가)"
```

---

### Task 10: 운세 탭 의도축 카테고리

**Files:**
- Create: `lib/fortune/categories.ts`
- Test: `lib/fortune/categories.test.ts`
- Modify: `app/fortune/page.tsx:74-139` (플랫 목록 → 카테고리 섹션)

Task 1 Step 2 승인안대로 3 카테고리. **`FORTUNE_LIST` 를 정본으로 두고 카테고리는 그 위의 그룹핑**이라, 신규 리포트가 추가돼도 카테고리 배정만 한 줄 넣으면 된다.

- [ ] **Step 1: 실패 테스트**

Create `lib/fortune/categories.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FORTUNE_CATEGORIES, groupFortunes } from "./categories.ts";
import { FORTUNE_LIST } from "./types.ts";

test("활성 진열 6종이 카테고리에 빠짐없이 배정된다", () => {
  const assigned = new Set(FORTUNE_CATEGORIES.flatMap((c) => c.types));
  for (const f of FORTUNE_LIST) {
    assert.ok(assigned.has(f.type), `미배정: ${f.type}`);
  }
});

test("한 상품이 두 카테고리에 중복되지 않는다", () => {
  const all = FORTUNE_CATEGORIES.flatMap((c) => c.types);
  assert.equal(new Set(all).size, all.length);
});

test("groupFortunes 는 빈 카테고리를 제외한다", () => {
  const groups = groupFortunes([]);
  assert.deepEqual(groups, []);
});

test("groupFortunes 가 카테고리 순서를 유지한다", () => {
  const groups = groupFortunes(FORTUNE_LIST);
  assert.deepEqual(
    groups.map((g) => g.key),
    FORTUNE_CATEGORIES.map((c) => c.key)
  );
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `node --import tsx --test lib/fortune/categories.test.ts`
Expected: FAIL — `Cannot find module './categories.ts'`

- [ ] **Step 3: 구현**

Create `lib/fortune/categories.ts`:

```ts
// 운세 탭 의도축 카테고리 — 리포트가 늘어나도 IA 가 안 깨지게 하는 그룹핑.
// FORTUNE_LIST(types.ts)가 정본이고 여기는 배정만 한다(스펙 §5 · 플랜 B Task 1 승인).
import type { FortuneConfig, FortuneType } from "./types";

export interface FortuneCategory {
  key: string;
  label: string;
  desc: string;
  types: FortuneType[];
}

export const FORTUNE_CATEGORIES: FortuneCategory[] = [
  {
    key: "relation",
    label: "연애·관계",
    desc: "두 사람을 같이 보는 리포트",
    types: ["compat", "compat_social"],
  },
  {
    key: "self",
    label: "나",
    desc: "타고난 기질과 한 해의 흐름",
    types: ["saju_full"],
  },
  {
    key: "timing",
    label: "시기",
    desc: "오늘·이번달·좋은 날",
    types: ["monthly", "good_days", "daily"],
  },
];

export interface FortuneGroup {
  key: string;
  label: string;
  desc: string;
  items: FortuneConfig[];
}

/** 주어진 진열 목록을 카테고리로 묶는다. 항목 0인 카테고리는 제외. */
export function groupFortunes(list: FortuneConfig[]): FortuneGroup[] {
  return FORTUNE_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    desc: c.desc,
    items: c.types
      .map((t) => list.find((f) => f.type === t))
      .filter((f): f is FortuneConfig => f !== undefined),
  })).filter((g) => g.items.length > 0);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --import tsx --test lib/fortune/categories.test.ts`
Expected: `# pass 4` / `# fail 0`

미배정 실패가 나면 **`FORTUNE_CATEGORIES` 에 그 타입을 추가**한다(테스트가 배정 누락을 잡는 게 이 테스트의 목적이다).

- [ ] **Step 5: 운세 탭 렌더 교체**

`app/fortune/page.tsx` 의 `items` 계산(`:21-25`, daily 를 맨 위로 올리는 `useMemo`)과 그것만 쓰던 import 를 제거하고 `groupFortunes(FORTUNE_LIST)` 로 바꾼다.

**작업 방식: `:75-138` 의 `items.map((f) => { … })` 콜백 본문(`inner` 변수 정의 + `return f.active ? <Link>…</Link> : <div>…</div>`)을 손대지 않고, 바깥에 그룹 루프만 한 겹 더 씌운다.** 카드 내부 JSX(그라데이션 아이콘·무료 배지·`freeStatus` 분기·해시태그·"준비 중")는 한 줄도 바꾸지 않는다.

```tsx
<div className="w-full max-w-md mx-auto px-5 flex flex-col gap-5">
  {groupFortunes(FORTUNE_LIST).map((g) => (
    <section key={g.key}>
      <p className="text-[14px] font-bold text-eye-purple mb-0.5 px-1">{g.label}</p>
      <p className="text-[11.5px] text-text-light mb-2.5 px-1">{g.desc}</p>
      <div className="flex flex-col gap-3">
        {g.items.map((f) => {
          // ↓ 기존 items.map 콜백 본문(app/fortune/page.tsx:76-137)을 그대로 이동.
          //   freeStatus·inner·return 분기 모두 무수정.
        })}
      </div>
    </section>
  ))}
</div>
```

`git diff` 로 카드 내부 라인이 **이동만** 됐는지 확인한다.

⚠️ 기존 `items` 가 daily 를 맨 위로 올렸는데, 카테고리 구조에서는 daily 가 "시기"의 마지막이다. **무료 상품이 아래로 내려가는 변경**이므로 Task 4 목업 게이트에서 함께 확인한다.

- [ ] **Step 6: 【이미지 제안】 운세 리포트 카드 아이콘 6종**

크로스링크 슬롯과 같은 상황이다 — 운세 카드 아이콘은 **48px 컨테이너 안 24px 이모지**(`app/fortune/page.tsx:86-91`)인데, `saju_full` 만 `RedHorseIcon` 컴포넌트를 쓴다. 즉 **이미 3가지 재질이 섞여 있다**(이모지 5종 · 커스텀 SVG 1종 · 홈 태그의 PNG).

```
【이미지 제안】 운세 리포트 카드 아이콘 6종
· 어디에      : 운세 탭 각 카드 왼쪽 48px 컨테이너 안 · 표시 ~30px
· 포즈·구도   : 캐릭터 반신은 30px 에서 안 보인다 → **오브젝트 도상**으로:
                  연애 궁합    실로 이어진 두 별
                  관계 궁합    세 개의 별이 삼각으로 놓인 형태
                  2026 사주    현행 RedHorseIcon 유지(붉은 말 = 2026 상징)
                  이번달       달 표면에 별이 흐르는 도상
                  좋은 날      달력 격자 위 별 하나
                  오늘의 운세  해와 구름 사이 별
                기존 FORTUNE_GRADIENTS 배경과 겹치므로 **선/면이 단순한 도상**
· 곁들일 문구 : 없음 — 카드 제목·태그라인이 담당
· 산출물      : public/fortune-icon-<type>.webp · 1:1 · 투명 배경
· 크레딧      : 2안×5종(saju_full 제외) = 20 (누적 X/72)
→ 진행할까요?  예(5종) / 일부만 / 이모지 유지
```

**⚠️ 20 크레딧은 이 플랜에서 두 번째로 큰 지출**이다(캐러셀 12 다음). 제안 시 함께 전달할 판단 재료: 운세 탭은 **재방문 빈도가 낮은 카탈로그 지면**(스펙 §5 — 리포트는 단발 구매)이라, 같은 20 크레딧을 홈 첫 화면에 쓰는 것보다 노출 대비 효율이 낮다. **"나중에"도 합리적인 선택지**임을 명시한다.

- [ ] **Step 7: 검증 + Commit**

```bash
npx tsc --noEmit && npm run build
```
브라우저: 운세 탭에 3섹션 · 6카드가 모두 보이고 각 카드 링크·무료 배지·별 비용이 정상.

```bash
git add lib/fortune/categories.ts lib/fortune/categories.test.ts app/fortune/page.tsx
git commit -m "feat(fortune): 운세 탭 의도축 카테고리(연애·관계/나/시기) — 리포트 확장 수용"
```

---

### Task 11: 홈·푸터 콘텐츠 링크 (플랜 A 에서 이관)

**Files:**
- Modify: `app/page.tsx` ("다른 고민" 그리드 아래)
- Modify: `components/layout/Footer.tsx:37` (기존 약관 링크 행 위)

플랜 A 가 만든 `/guide`·`/free/daily-card` 로의 크롤 경로 + 부수 발견 경로다. **플랜 A 배포 후에 이 태스크를 실행**해야 링크가 200을 받는다.

- [ ] **Step 1: 홈 하단 콘텐츠 카드 2개**

`app/page.tsx` 의 "다른 고민" 그리드 닫힘 뒤 · `</section>` 앞에 삽입. 퍼널 위쪽을 건드리지 않는 최하단 배치:

```tsx
{/* 콘텐츠 존 진입 — 읽을거리·무료 도구 (크롤 경로 겸용) */}
<div className="flex items-center gap-3 mb-4 mt-6" aria-hidden>
  <span className="flex-1 h-px bg-lilac-mid/40" />
  <span className="text-gold text-[11px]">✦</span>
  <span className="flex-1 h-px bg-lilac-mid/40" />
</div>
<div className="grid grid-cols-2 gap-2.5 mb-3">
  <Link
    href="/guide"
    className="bg-white/80 backdrop-blur-sm rounded-2xl p-3.5 border border-lilac-soft hover:border-lilac-deep/40 transition text-left"
  >
    <div className="text-[22px] mb-1.5" aria-hidden>📖</div>
    <p className="text-[13px] font-bold text-eye-purple leading-snug">타로 가이드</p>
    <p className="text-[11px] text-text-light mt-1 leading-snug">고민별로 어떻게 보는지</p>
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

> 카드 1 의 목적지가 `/guide`(허브)이지 `/guide/tarot-cards`(도감)가 **아닌** 이유: 플랜 A 시점에 카드 본문이 0장이라 도감은 빈 페이지다. 허브는 발행분만 노출하므로 항상 내용이 있다(플랜 A Task 7).

- [ ] **Step 2: 푸터 링크 행**

`components/layout/Footer.tsx` 의 약관 링크 행(`:37`) **위**에 동일 스타일로 추가:

```tsx
{/* 콘텐츠 허브 — 크롤 경로 */}
<div className="flex items-center gap-4 mt-5 pt-4 border-t border-lilac-soft/30">
  <Link href="/guide" className="text-[11px] text-text-light/90 hover:text-eye-purple transition-colors">
    타로 가이드
  </Link>
  <Link href="/guide/spreads" className="text-[11px] text-text-light/90 hover:text-eye-purple transition-colors">
    스프레드 가이드
  </Link>
  <Link href="/free/daily-card" className="text-[11px] text-text-light/90 hover:text-eye-purple transition-colors">
    오늘의 카드
  </Link>
</div>
```

- [ ] **Step 3: 【이미지 제안】 홈 콘텐츠 카드 아이콘 2종 — 만들지 않기를 권함**

```
【이미지 제안】 홈 하단 콘텐츠 카드 아이콘 (📖 🌙)
· 어디에      : 홈 최하단 2열 카드 · 표시 22px
· 크레딧      : 2안×2종 = 8
→ 제 의견은 "이모지 유지" 입니다. 22px 이고, 홈 최하단이라 노출이 가장 낮은
  지면이며, 옆의 크로스링크(48px)·태그(48px)와 위계상 작은 게 의도된 자리입니다.
  8 크레딧을 여기 쓰면 캐러셀 재시도 여력이 줄어듭니다.
→ 어떻게 할까요?  이모지 유지 / 그래도 만들기
```

- [ ] **Step 4: 검증 + Commit**

로컬에서 홈 최하단 카드 2개 + 푸터 링크 3개가 렌더되고 전부 200 으로 이동하는지 확인(플랜 A 가 먼저 머지돼 있어야 한다).

```bash
git add app/page.tsx components/layout/Footer.tsx
git commit -m "feat(seo): 홈 하단·푸터 콘텐츠 진입 링크 — 고아 페이지 방지"
```

---

### Task 12: `handleSelect` 를 공유 헬퍼로 전환

**Files:**
- Modify: `app/page.tsx:65-86`

플랜 A Task 2 가 만든 `lib/consultation-entry.ts` 를 홈도 쓰게 해서 **로그인 가드 로직의 중복을 없앤다.** 콘텐츠 존 CTA 와 홈이 갈라지면 한쪽만 고쳐지는 사고가 난다.

- [ ] **Step 1: 교체**

```tsx
import { beginConsultation } from "@/lib/consultation-entry";

// …

const handleSelect = (tag: EmotionTag) => {
  router.push(beginConsultation(tag));
};
```

`beginConsultation` 이 세션 키 저장 + `byeolkong_user` 로그인 판정 + 경로 결정을 모두 수행하므로, 기존 `:66-85` 의 sessionStorage/localStorage 파싱 블록은 전부 삭제한다.

- [ ] **Step 2: 동작 동일성 검증**

| 상태 | 기대 동작 (변경 전과 동일해야 함) |
|---|---|
| 로그인 | 태그 클릭 → `/concern` 진입, 태그 프리셋 반영 |
| 비로그인 | `/login?next=%2Fconcern` 로 이동, 로그인 후 `/concern` 착지 |
| `byeolkong_user` 가 깨진 JSON | 비로그인으로 취급(에러 없이) |

세 케이스를 브라우저에서 확인한다. 특히 **비로그인 케이스는 이 플랜의 유일한 퍼널 진입 경로 변경**이므로 반드시 실물 확인한다.

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit && npm run build
git add app/page.tsx
git commit -m "refactor(home): handleSelect → 공유 진입 헬퍼(로그인 가드 중복 제거)"
```

---

### Task 13: 크롤러 뷰 검증 + 배포

- [ ] **Step 1: 크롤러 = 무이력 뷰 확인 (스펙 §8-5)**

로컬에서 쿠키·로컬스토리지 없이 홈 HTML 을 받아 확인한다:

```bash
npm run build && npm run start &
sleep 3
curl -s localhost:3000/ | grep -c "안녕! 나는 별콩이야"
curl -s localhost:3000/ | grep -c "오늘의 별콩이"
curl -s localhost:3000/ | grep -c "첫 충전엔 별을"
```

Expected: hero 카피 **1** / 오늘 블록 **0** / 캐러셀 **0**.

> 홈은 클라이언트 컴포넌트라 초기 HTML 에는 무이력 뷰만 담긴다. 이게 **홈 색인 내용이 안 바뀌는 근거**다(스펙 §3).

- [ ] **Step 2: 회귀 체크리스트**

| | 확인 |
|---|---|
| 하단탭 | 5개 라벨 새 값 · 각 탭 이동 · active 하이라이트 · `?from=history` 시 "마이" 하이라이트 |
| 홈 | 태그 10개 카드 **크기·순서 현행 유지** · 궁합 카드 위치 동일 · 콘텐츠 카드 2개 |
| 오늘 블록 | 신호 0이면 미렌더 · 최대 3줄 · 목적지 정상 |
| 캐러셀 | 비로그인 미노출 · `?b=` 부착 · reduced-motion 존중 |
| 운세 탭 | 3섹션 6카드 · 무료 배지 · 별 비용 |
| 진입 | 로그인/비로그인 태그 클릭 3케이스 |

- [ ] **Step 3: dev push → 확인**

```bash
git push origin dev
```
Vercel Preview 빌드 성공 + `dev.byeolkongtalk.com` 에서 Step 2 체크리스트 재확인. **마이그레이션 0 · 새 env 0** 이므로 Supabase Workflow 확인은 불필요.

- [ ] **Step 4: 배포 대기 (⚠️ d28 게이트)**

**main 머지는 2026-08-23(d28) 판정 이후에 한다.** 그 전에는 dev 에만 올려두고 대기한다. 스펙 §7 — 전 유저 노출 변경은 측정 창 중간에 배포하지 않는다.

- [ ] **Step 5: prod 배포 (d28 이후)**

```bash
git checkout main && git merge --ff-only dev && git push origin main && git checkout dev
```

prod 스모크: 홈 무이력 뷰 · 로그인 뷰 · 하단탭 · 운세 탭 · `/api/home/today` 200.

- [ ] **Step 6: 배포 직후 관측**

- `/admin/errors` 에서 `/api/home/today` 관련 error 0건 확인
- `/admin/traffic` 에서 `?b=` 파라미터가 붙은 PV 가 잡히는지 확인 (배너 계측 작동)
- **2~3일 후**: 배너 카드별 클릭 분포를 보고 **2·3번 카드 클릭이 0에 가까우면 단일 슬롯으로 되돌린다**(스펙 §3 캐러셀 가드레일)

---

## 완료 조건 (스펙 매핑)

- [ ] 하단탭 5칸 라벨 재정의, URL·matchPrefixes 무변경 — Task 5
- [ ] hero 슬롯 상태 분기: 무이력 = 현행 hero 완전 동일 — Task 8, 13
- [ ] 캐러셀 최대 3장 + 1번 카드 우선순위 + 도트 + `?b=` 계측 — Task 8
- [ ] 오늘 블록: 상한 3 · 신호 0이면 미렌더 · 전 항목이 상품 링크 — Task 6, 7
- [ ] 크로스링크 슬롯 최대 2, 시뮬 미출시 시 ① 비움 — Task 9
- [ ] 운세 탭 의도축 카테고리 — Task 10
- [ ] 홈·푸터 콘텐츠 링크 — Task 11
- [ ] 로그인 가드 중복 제거 — Task 12
- [ ] 검증 5건: 세로 예산(T2) · 궁합 클릭률(T3) · robots(플랜 A T8) · sitemap 혼입(플랜 A T8) · 크롤러 뷰(T13)
- [ ] **d28 이후 배포** — Task 13 Step 4

## 범위 밖 (다른 스펙으로)

| | 어디로 |
|---|---|
| 그 사람 파일 허브 · 리허설 화면 · 3화자 | **E6 스펙** — 허브는 시뮬과 함께 배포(스펙 §7 순서 의존 2) |
| 오늘 블록 "모레 좋은 날" 항목 | **E3 스펙** — `lib/home/today.ts` 에 kind 추가 |
| 오늘 블록 "편지 도착" 항목 | **E4 스펙** — 정본 지면 결정 후 |
| 홈 크로스링크 슬롯 ① | **E6 스펙** — `CrossLinkSlots.tsx` 의 `SLOTS` 에 추가 |
| 타로 78장 본문 | 플랜 A Task 6 라우트에 `card-content.json` 채우면 자동 발행 |
