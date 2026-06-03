# 가격 리밸런싱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 충전 패키지·제품 가격을 체감 가치 기준으로 재조정하고, 사주분석 리포트를 초프리미엄 분량으로 강화한다.

**Architecture:** 대부분 상수 변경(패키지/제품 가격). 분량 강화는 (1) `streamChat`/`generateOnce`에 `maxTokens` 파라미터를 추가해 one-shot 리포트별 출력 상한을 차등하고, (2) 사주분석 섹션 가이드를 확장하는 두 조각. 대화형 채팅(streamChat 기본 호출)은 기본값 2048로 그대로 유지.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Anthropic SDK (`claude-sonnet-4-20250514`).

**스펙:** `docs/superpowers/specs/2026-06-03-pricing-rebalance-design.md`

**검증 방식 (이 레포에 테스트 러너 없음 — `package.json` scripts: dev/build/start):** 각 태스크는 `npx tsc --noEmit` (EXIT 0) + 변경값 육안 확인으로 검증한다. 상수 변경에 테스트 프레임워크를 새로 들이는 건 YAGNI이므로 하지 않는다. 행동 변화(리포트 분량)는 마지막에 dev 빌드 + dev 환경 스모크로 확인한다.

**커밋 규칙:** 사용자가 명시적으로 푸시를 요청하기 전엔 원격에 push 하지 않는다. 로컬 커밋은 태스크 단위로. 스테이징은 파일명을 개별 지정 (`.serena/`, `.vercel`, `.gitignore`, 시크릿 제외).

---

### Task 1: 충전 패키지 재설계 (STAR_PACKAGES)

패키지 `id`는 load-bearing이다 — `app/api/payments/list/route.ts`의 `labelFromPackageType`가 `/^star_(\d+)$/` 정규식으로 id에서 "70별 패키지" 라벨을 만든다. 따라서 별 개수가 바뀌면 **id도 함께 rename** 해야 라벨이 맞는다 (`star_35`→`star_30`, `star_80`→`star_70`, `star_230`→`star_300`). 기존 DB 결제 레코드에 저장된 옛 id(`star_35` 등)는 그 레코드 고유의 라벨로 계속 정확히 표시되므로 마이그레이션 불필요.

**Files:**
- Modify: `lib/constants.ts:11-15`

- [ ] **Step 1: STAR_PACKAGES 값 교체**

`lib/constants.ts`의 배열(11~15행)을 아래로 교체:

```typescript
export const STAR_PACKAGES: StarPackage[] = [
  { id: "star_10", stars: 10, price: 1000, label: "10별" },
  { id: "star_30", stars: 30, price: 2800, label: "30별" },
  { id: "star_70", stars: 70, price: 5900, label: "70별" },
  { id: "star_150", stars: 150, price: 11000, label: "150별" },
  { id: "star_300", stars: 300, price: 19900, label: "300별" },
];
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: EXIT 0. (이 시점엔 shop/page.tsx의 PKG_META가 옛 키를 참조해도 PKG_META는 `Record<string, ...>`라 타입 에러는 안 나지만, 런타임 배지가 사라짐 — Task 2에서 수정.)

- [ ] **Step 3: 커밋**

```bash
git add lib/constants.ts
git commit -m "충전 패키지 재설계 — 30/70/150/300별 + 가격 조정"
```

---

### Task 2: 충전소 UI 메타 동기화 (PKG_META + 기본 선택)

Task 1에서 id를 바꿨으므로 `app/shop/page.tsx`의 id 문자열 참조를 맞춘다. `PKG_META`는 id로 키잉되고(36~40행), 기본 선택 상태가 `"star_80"`(57행)이며 히어로 카드(`highlight: true`)도 여기 달려 있다.

**Files:**
- Modify: `app/shop/page.tsx:36-40` (PKG_META)
- Modify: `app/shop/page.tsx:57` (기본 selectedId)

- [ ] **Step 1: PKG_META 키 교체**

36~40행을 아래로 교체 (히어로/추천은 70별로 이동):

```typescript
  star_10: {},
  star_30: { badge: { label: "기본", tone: "gold" } },
  star_70: { badge: { label: "추천", tone: "primary" }, highlight: true },
  star_150: { badge: { label: "깊게", tone: "primary" } },
  star_300: { badge: { label: "가장 알뜰", tone: "rose" } },
```

- [ ] **Step 2: 기본 선택 id 교체**

57행:

```typescript
  const [selectedId, setSelectedId] = useState<string>("star_70");
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 4: 커밋**

```bash
git add app/shop/page.tsx
git commit -m "충전소 — 패키지 id rename 반영 (히어로 70별)"
```

---

### Task 3: 운세 제품 가격 + 리포트 출력 상한 맵 (fortune types)

오늘의 운세 소진 후 비용 7→5, 2026 사주분석 30→50. 그리고 one-shot 리포트별 `max_tokens`를 담을 `MAX_TOKENS_BY_FORTUNE` 맵을 신설 (Task 6에서 사용).

**Files:**
- Modify: `lib/fortune/types.ts:43` (daily paidCost)
- Modify: `lib/fortune/types.ts:65` (saju_full cost)
- Modify: `lib/fortune/types.ts` (FORTUNE_LIST 아래, 107행 부근에 맵 추가)

- [ ] **Step 1: daily paidCost 7 → 5**

43행:

```typescript
    paidCost: 5,
```

- [ ] **Step 2: saju_full cost 30 → 50**

65행:

```typescript
    cost: 50,
```

- [ ] **Step 3: MAX_TOKENS_BY_FORTUNE 맵 추가**

`FORTUNE_LIST` 정의(94~100행) 바로 아래에 추가:

```typescript
/** one-shot 리포트별 출력 상한. 제품 가치/분량에 맞춰 차등 (lib/claude.ts generateOnce 에 전달). */
export const MAX_TOKENS_BY_FORTUNE: Record<FortuneType, number> = {
  daily: 1536,
  monthly: 2560,
  saju_full: 8192,
  tarot_oneshot: 2048,
  compat: 2048,
};
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 5: 커밋**

```bash
git add lib/fortune/types.ts
git commit -m "운세 가격 조정 (오늘 7→5, 사주분석 30→50) + 리포트 출력 상한 맵"
```

---

### Task 4: 타로 스프레드 가격 (three_card, relationship_5)

쓰리카드 22→25, 관계 5장 35→40. `SPREAD_INFO[type].starCost`가 비용의 정본이며 `app/api/consultations/tarot/route.ts:114`가 이 값을 그대로 차감에 쓴다 (별도 cap 없음, `AMOUNT_HARDCAP=100`).

**Files:**
- Modify: `lib/tarot/spreads.ts:52` (three_card starCost)
- Modify: `lib/tarot/spreads.ts:61` (relationship_5 starCost)

- [ ] **Step 1: three_card starCost 22 → 25**

52행:

```typescript
    starCost: 25,
```

- [ ] **Step 2: relationship_5 starCost 35 → 40**

61행:

```typescript
    starCost: 40,
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 4: 커밋**

```bash
git add lib/tarot/spreads.ts
git commit -m "타로 스프레드 가격 조정 (쓰리카드 22→25, 관계 35→40)"
```

---

### Task 5: maxTokens 파라미터 스레딩 (claude.ts)

`streamChat`이 `max_tokens: 2048`을 하드코딩(204행)하고 `generateOnce`가 이를 호출한다. 두 함수에 선택적 `maxTokens` 파라미터를 추가하되 **기본값 2048** — 대화형 채팅(`streamChat` 직접 호출자: 사주/타로 reading)은 인자 없이 호출하므로 동작 불변. one-shot 리포트만 Task 6에서 제품별 값을 넘긴다.

**Files:**
- Modify: `lib/claude.ts:185-207` (streamChat 시그니처 + max_tokens)
- Modify: `lib/claude.ts:220-229` (generateOnce 시그니처 + 전달)

- [ ] **Step 1: streamChat 시그니처에 maxTokens 추가**

185~188행의 시그니처를 교체:

```typescript
export async function* streamChat(
  systemMessage: { staticPart: string; dynamicPart: string } | string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number = 2048
) {
```

- [ ] **Step 2: 하드코딩된 max_tokens 를 파라미터로 교체**

204행:

```typescript
    max_tokens: maxTokens,
```

- [ ] **Step 3: generateOnce 시그니처 + 전달 교체**

220~229행의 함수 전체를 교체:

```typescript
export async function generateOnce(
  systemMessage: { staticPart: string; dynamicPart: string } | string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number = 2048
): Promise<string> {
  let out = "";
  for await (const chunk of streamChat(systemMessage, messages, maxTokens)) {
    out += chunk;
  }
  return out.trim();
}
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: EXIT 0. (기존 `streamChat`/`generateOnce` 호출부는 인자 2개 그대로 — 기본값이 채워지므로 에러 없음.)

- [ ] **Step 5: 커밋**

```bash
git add lib/claude.ts
git commit -m "claude — streamChat/generateOnce 에 maxTokens 파라미터 (기본 2048)"
```

---

### Task 6: 리포트 생성 시 제품별 출력 상한 적용 (fortune create route)

`generateOnce` 호출(133행)에 `MAX_TOKENS_BY_FORTUNE[cfg.type]`를 넘긴다.

**Files:**
- Modify: `app/api/fortune/create/route.ts:10` (import)
- Modify: `app/api/fortune/create/route.ts:133` (generateOnce 호출)

- [ ] **Step 1: import 에 MAX_TOKENS_BY_FORTUNE 추가**

10행을 교체:

```typescript
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { MAX_TOKENS_BY_FORTUNE } from "@/lib/fortune/types";
```

(주의: 이 파일이 이미 `@/lib/fortune/types`에서 다른 심볼을 import 중이면 별도 줄 대신 기존 import에 합칠 것. 현재는 위 형태로 신규 줄 추가.)

- [ ] **Step 2: generateOnce 호출에 maxTokens 전달**

133행:

```typescript
    report = await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[cfg.type]);
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 4: 커밋**

```bash
git add app/api/fortune/create/route.ts
git commit -m "운세 리포트 — 제품별 max_tokens 적용 (사주분석 8192)"
```

---

### Task 7: 사주분석 섹션 가이드 확장 (6~8섹션 + 분량 지시)

`max_tokens`만 올리면 모델이 짧게 끝낼 수 있으므로, `SECTION_GUIDE.saju_full`에 섹션을 7개로 늘리고(건강 추가, 분기 → 월별 흐름 강화) 도입부에 "한 해 한 번 받는 깊이 리포트 — 각 섹션 최소 분량" 지시를 박는다.

**Files:**
- Modify: `lib/fortune/prompt.ts:75-85` (SECTION_GUIDE.saju_full)

- [ ] **Step 1: saju_full 가이드 교체**

75~85행의 `saju_full: [ ... ].join("\n"),` 블록을 아래로 교체:

```typescript
  saju_full: [
    `기준 연도: 2026년 (병오년)`,
    ``,
    `위 사주판을 가진 사람의 **2026년 사주 분석** 리포트를 써줘. 이건 한 해에 한 번 받는 깊이 있는 프리미엄 리포트야 — 각 섹션을 충분히 깊고 구체적으로 풀어줘. 각 섹션 최소 3~4문장 이상, 월별 흐름 섹션은 가장 길고 구체적으로. 짧게 끊지 말 것. 타고난 사주를 바탕으로 2026년 한 해 흐름에 초점을 맞춰. 아래 섹션을 정확히 이 순서·제목으로:`,
    `## 타고난 기질  (일간·오행 기반 성격·강점·약점 — 2026년을 어떻게 살아갈 사람인지로 연결)`,
    `## 2026년 큰 흐름  (병오년 기운이 이 사주에 주는 한 해 전반 테마)`,
    `## 마음 · 관계  (2026년 연애·인연·가족·사람 관계 흐름)`,
    `## 일 · 재물  (2026년 적성·일·커리어·금전 흐름)`,
    `## 건강 · 컨디션  (2026년 몸·마음 건강에서 챙길 부분)`,
    `## 2026년 월별 흐름  (상반기/하반기를 분기 또는 월 단위로 짚는 시기별 조언 — 좋은 시기·조심할 시기 포함, 가장 길고 구체적으로)`,
    `## 별콩이의 한마디  (2026년 한 해 챙기면 좋을 따뜻한 조언)`,
  ].join("\n"),
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: 커밋**

```bash
git add lib/fortune/prompt.ts
git commit -m "사주분석 리포트 — 7섹션 확장 + 분량 지시 (건강·월별 흐름 추가)"
```

---

### Task 8: 통합 검증 (빌드 + dev 스모크)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 타입 체크**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: 빌드 성공 (import/타입 에러 0).

- [ ] **Step 3: 충전소 UI 스모크 (dev)**

`npm run dev` → 브라우저에서 `/shop` 열기 (로그인 필요 시 로그인 후).
확인:
- 5개 패키지가 **1,000 / 2,800 / 5,900 / 11,000 / 19,900원**, 별 **10 / 30 / 70 / 150 / 300**
- "추천" 배지 + 하이라이트가 **70별** 카드에 표시
- 기본 선택이 70별

- [ ] **Step 4: 사주분석 리포트 분량 스모크 (dev, 계정+별 필요)**

dev 환경(dev.byeolkongtalk.com 또는 로컬)에서 별 50개 이상 보유 계정으로 `/fortune/saju_full` 입력 → 생성.
확인:
- 리포트에 **7개 섹션 제목**(타고난 기질 / 2026년 큰 흐름 / 마음·관계 / 일·재물 / 건강·컨디션 / 2026년 월별 흐름 / 별콩이의 한마디)이 모두 나옴
- 기존 대비 눈에 띄게 길어짐 (특히 월별 흐름 섹션)
- `readings.stars_spent = 50` 으로 저장됨

> 로컬에서 별/사주 입력 세팅이 번거로우면 이 스텝은 dev 배포 후 실계정으로 확인해도 됨. 단 배포 전 Step 1~3은 반드시 통과.

- [ ] **Step 5: 최종 상태 확인**

Run: `git status` / `git log --oneline -8`
Expected: Task 1~7 커밋 7개, 워킹트리 클린 (계획 문서 제외).

---

## Self-Review

- **스펙 커버리지:** Section 1(패키지)→Task 1·2. Section 2(제품가격: 오늘 5/사주분석 50→T3, 쓰리카드 25/관계 40→T4)→Task 3·4. Section 3(max_tokens 차등→T5·6, 사주분석 섹션 확장→T7, 마진은 코드 변경 아님)→Task 5·6·7. 비범위(사주 상담 차등/네이밍)는 의도적으로 태스크 없음. ✅ 갭 없음.
- **플레이스홀더:** 모든 코드 스텝에 실제 코드 블록 포함. "적절히 처리" 류 없음. ✅
- **타입 정합성:** `MAX_TOKENS_BY_FORTUNE: Record<FortuneType, number>` (T3 정의) → T6에서 `MAX_TOKENS_BY_FORTUNE[cfg.type]`로 사용 (cfg.type 은 FortuneType). `maxTokens` 파라미터명 T5(streamChat/generateOnce 정의) ↔ T6(호출) 일치. 패키지 id `star_30/70/300` T1 정의 ↔ T2 PKG_META 키 일치. ✅
