# 프리미엄 첫 풀이 분량 확대 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고민톡 타로 3장 이상 스프레드의 첫 자동 풀이를 볼륨 디스카운트 사다리(별당 글자 60→65)에 맞춰 약 2배로 두껍게 한다.

**Architecture:** 레버는 페르소나(`data/persona/byeolkong_tarot.md`) 단일 파일 + `PROMPT_VERSION` 슬러그 1개. 코드/임계치/UI 변경 없음. 병목은 페르소나의 "첫 풀이 400~900자" 캡과 "카드당 2~4문장" 지시라, 이 둘을 티어 분리로 재정의한다.

**Tech Stack:** Markdown 페르소나 프롬프트(Claude Sonnet 5 system message), TypeScript 상수. 검증은 QA 하네스(`npm run qa`, dev 서버 + dev Supabase) + dev DB 길이 쿼리 + 브라우저.

**검증 방식 주의:** 이 레포는 프로즈(페르소나) 동작에 대한 단위 테스트 러너가 없다. 각 태스크 검증 = `npx tsc --noEmit`(상수 편집분) + QA 하네스 실측(첫 풀이 길이 목표 범위) + dev 브라우저 스팟체크. ⚠️ **페르소나 수정 후 dev 서버 재시작 필수**(Next 모듈 캐시 — 안 하면 옛 페르소나로 QA 돎).

**스펙:** `docs/superpowers/specs/2026-07-22-premium-reading-depth-design.md`

---

## File Structure

- Modify: `data/persona/byeolkong_tarot.md` — 첫 풀이 길이 캡(라인 68 부근), 각 카드 해석 문장수·3요소(라인 62~66), 안티패턴 가드(신규). 이 파일이 별콩이 타로 system message 정본.
- Modify: `lib/prompt-version.ts` — `PROMPT_VERSION`을 새 dated 슬러그로. 전후 코호트를 결정적으로 가르는 스탬프(readings.prompt_version에 박힘).
- (검증 임시) `scripts/tmp-depth-check.mjs` — dev DB에서 스프레드별 첫 풀이 실측 길이 조회. 검증 후 삭제.

---

## Task 1: PROMPT_VERSION 슬러그 갱신

**Files:**
- Modify: `lib/prompt-version.ts`

- [ ] **Step 1: 버전 히스토리 주석 + 상수 갱신**

`lib/prompt-version.ts`에서 아래 블록을 찾는다:

```typescript
//   2026-07-22-card-noname    — 원카드 [CARD:1] 마커 필수 + 유저 이름 호출 제거(항상 "너", [호칭:] 주입 삭제)
export const PROMPT_VERSION = "2026-07-22-card-noname";
```

다음으로 교체:

```typescript
//   2026-07-22-card-noname    — 원카드 [CARD:1] 마커 필수 + 유저 이름 호출 제거(항상 "너", [호칭:] 주입 삭제)
//   2026-07-22-premium-depth  — 타로 3장+ 첫 풀이 확대(볼륨 디스카운트 사다리, 카드당 4~6문장·별당 60→65) (spec: 2026-07-22-premium-reading-depth-design)
export const PROMPT_VERSION = "2026-07-22-premium-depth";
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 0 (untracked `scripts/verify-offer.ts`의 기존 에러는 무시 — 이 파일과 무관).

- [ ] **Step 3: 커밋**

```bash
git add lib/prompt-version.ts
git commit -m "chore(persona): PROMPT_VERSION → 2026-07-22-premium-depth (코호트 경계)"
```

---

## Task 2: 첫 풀이 길이 캡을 티어 테이블로 (라인 68)

**Files:**
- Modify: `data/persona/byeolkong_tarot.md`

- [ ] **Step 1: 길이 캡 한 줄을 티어 테이블로 교체**

`data/persona/byeolkong_tarot.md`에서 아래 한 줄(라인 68 부근, "### 각 카드 해석" 블록 끝)을 찾는다:

```
첫 풀이는 스프레드 크기에 따라 400~900자.
```

다음으로 교체:

```
첫 풀이 목표 분량 (스프레드 크기별 — 유료 스프레드일수록 카드 수에 비례해 두껍게):

- **원카드·투카드 (맛보기)**: 400~900자
- **쓰리카드 (3장)**: 1,300~1,700자
- **관계·속마음·재회·새 인연 (5장)**: 2,300~2,750자
- **관계 체크인·계속그만·새 사랑 준비도·마음 치유 (6장)**: 2,700~3,200자
- **재회 심층·가능성·마음 차크라 (7장)**: 3,300~3,800자

카드 수가 많을수록 총 분량은 길어지지만, 카드당 분량(4~6문장)은 일정하게 유지해 — 총량은 카드 수로 늘리는 거야. 인터리브(카드마다 이미지+버블로 끊어 보여주기) 덕에 총량이 길어도 벽처럼 느껴지지 않아.
```

- [ ] **Step 2: 편집 반영 확인 (grep)**

Run: `grep -n "3,300~3,800\|카드당 분량(4~6문장)" data/persona/byeolkong_tarot.md`
Expected: 두 패턴 모두 1건씩 매치.

---

## Task 3: 각 카드 해석 — 문장수 티어 분리 + 프리미엄 3요소 (라인 62~66)

**Files:**
- Modify: `data/persona/byeolkong_tarot.md`

- [ ] **Step 1: 섹션 헤더 교체 (라인 62)**

아래를 찾는다:

```
### 각 카드 해석 (2~4문장, 3단)
```

다음으로 교체:

```
### 각 카드 해석 (문장 수는 티어별 — 맛보기 2~4문장 / 프리미엄 4~6문장)

원·투카드(맛보기)는 카드당 2~4문장. **3장 이상(프리미엄)은 카드당 4~6문장으로 아래 3요소를 모두 채워** — 낸 별에 맞는 밀도를 카드마다 보장해.
```

- [ ] **Step 2: 3요소 본문 교체 (라인 64~66)**

아래 세 줄을 찾는다:

```
1. **카드가 말하는 것** — 카드 이름을 먼저 언급하고, **카드 그림(도상)의 시각적 요소를 최소 1개 묘사**해 (예: "바보 카드는 절벽 끝에서 하늘을 올려다보는 사람이야"). RWS 덱 기준, 카드 이름은 한국어로. 정/역방향 핵심 메시지까지.
2. **너의 상황에서는** — 포지션 라벨의 의미와 카드 메시지를 유저의 구체적 고민에 연결. 이 파트가 핵심.
3. 카드들이 단절돼 보이지 않게 종합 파트에서 흐름을 하나로 엮어.
```

다음으로 교체:

```
1. **카드가 말하는 것** — 카드 이름을 먼저 언급하고, **카드 그림(도상)의 시각적 요소를 최소 1개 묘사**해 (예: "바보 카드는 절벽 끝에서 하늘을 올려다보는 사람이야"). RWS 덱 기준, 카드 이름은 한국어로. 정/역방향 핵심 메시지까지.
2. **너의 상황에서는** — 포지션 라벨의 의미와 카드 메시지를 유저의 구체적 고민에 연결. 이 파트가 핵심이야. **프리미엄(3장+)에서는 이 파트를 2~3문장으로 충분히** — 유저가 준 디테일과 카드를 구체적으로 엮어.
3. **(프리미엄) 앞 카드와의 연결 한 조각** — 이 카드가 앞서 본 카드와 어떻게 이어지는지 한 문장으로 짚어. 흐름을 종합 파트로 다 미루지 말고 카드마다 조금씩 쌓아가.
4. 마지막에 **종합 파트**(별도 단락)에서 카드들을 하나의 흐름으로 엮고 고민에 소신 있는 답을 줘. 프리미엄은 이 종합을 3~4문장으로.
```

- [ ] **Step 3: 편집 반영 확인 (grep)**

Run: `grep -n "프리미엄 4~6문장\|앞 카드와의 연결 한 조각" data/persona/byeolkong_tarot.md`
Expected: 두 패턴 모두 매치.

---

## Task 4: 안티패턴 가드 추가

**Files:**
- Modify: `data/persona/byeolkong_tarot.md`

- [ ] **Step 1: Task 2에서 만든 길이 테이블 마지막 문단 바로 뒤에 가드 한 줄 추가**

Task 2에서 넣은 아래 문단을 찾는다:

```
카드 수가 많을수록 총 분량은 길어지지만, 카드당 분량(4~6문장)은 일정하게 유지해 — 총량은 카드 수로 늘리는 거야. 인터리브(카드마다 이미지+버블로 끊어 보여주기) 덕에 총량이 길어도 벽처럼 느껴지지 않아.
```

이 문단 바로 아래에 다음 줄을 추가한다 (문단 사이 빈 줄 유지):

```
⚠️ 분량은 **카드별 구체적 해석과 유저 고민 연결의 밀도**로 채워 — 같은 말을 늘려 쓰거나(반복) 공허한 미사여구로 부풀리지 마. 한 카드 버블이 6문장을 넘어 벽처럼 길어지는 것도 금지. 밀도로 길게, 물타기로 길게는 금지.
```

- [ ] **Step 2: 편집 반영 확인**

Run: `grep -n "물타기로 길게는 금지" data/persona/byeolkong_tarot.md`
Expected: 1건 매치.

- [ ] **Step 3: 페르소나 편집 커밋**

```bash
git add data/persona/byeolkong_tarot.md
git commit -m "feat(persona): 타로 프리미엄(3장+) 첫 풀이 분량 확대 — 티어 길이 캡 + 카드당 4~6문장 + 종합 강화"
```

---

## Task 5: QA 하네스 실측 검증 (3장·5장)

**Files:**
- Create (임시): `scripts/tmp-depth-check.mjs`

- [ ] **Step 1: dev 서버 재시작 (모듈 캐시 무효화)**

이미 떠 있는 dev 서버가 있으면 종료 후 재기동한다 (페르소나는 서버 시작 시 로드되므로 재시작 없이는 옛 프롬프트가 쓰임). 브라우저 프리뷰 도구를 쓰는 경우 `preview_stop` 후 `preview_start`(name: byeolkong-dev). CLI면 dev 프로세스를 kill 후 `npm run dev` 재기동.

- [ ] **Step 2: QA 하네스로 3장·5장 첫 풀이 생성**

Run: `node --import tsx --env-file=.env.local qa/run.ts --case=tarot.three_card --max-cases=1`
그다음: `node --import tsx --env-file=.env.local qa/run.ts --case=tarot.relationship_5 --max-cases=1`

Expected: 각 케이스가 `[qa] ▶ tarot.three_card.happy_path ...` 형태로 실행되고 완료(단언 일부 실패는 무방 — 여기선 첫 풀이 길이만 본다). 실제 Claude 호출이 일어나므로 케이스당 소액 비용 발생.

주의: 기본 QA 케이스에 6·7장은 없다 — 6·7장은 Task 6 브라우저에서 확인한다.

- [ ] **Step 3: 실측 길이 조회 스크립트 작성**

Create `scripts/tmp-depth-check.mjs`:

```javascript
// 임시: dev DB에서 최근 타로 첫 풀이의 스프레드별 길이 확인. 검증 후 삭제.
import { getServiceSupabase } from "../lib/supabase.ts";
const db = getServiceSupabase();
const { data } = await db
  .from("readings")
  .select("id, spread_type, created_at, messages(role, content, created_at)")
  .eq("consultation_type", "tarot")
  .in("spread_type", ["three_card", "relationship_5"])
  .order("created_at", { ascending: false })
  .limit(6);
for (const r of data ?? []) {
  const first = (r.messages ?? [])
    .filter((m) => m.role === "assistant")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  const len = first ? first.content.replace(/\[CARD:\d+\]|\[END\]|\[RECO:[^\]]*\]/g, "").length : 0;
  console.log(`${r.spread_type}\t${len}자\t${r.id}`);
}
```

- [ ] **Step 4: 실측 실행**

Run: `node --import tsx --env-file=.env.local scripts/tmp-depth-check.mjs`
Expected: 방금 생성한 three_card 행이 **1,300~1,700자** 부근, relationship_5 행이 **2,300~2,750자** 부근. 범위를 크게 벗어나면(예: 여전히 1,000자대) → dev 서버 재시작이 안 됐거나(Step 1) 페르소나 편집이 반영 안 된 것 → 재확인 후 Step 2부터 재실행.

- [ ] **Step 5: 임시 스크립트 삭제**

Run: `rm scripts/tmp-depth-check.mjs`

---

## Task 6: 브라우저 스팟체크 + dev 배포

**Files:** 없음 (검증 + 배포만)

- [ ] **Step 1: dev 브라우저에서 실제 쓰리카드 1건 확인**

dev 프리뷰에서 고민톡 → 태그 → 고민 입력 → 쓰리카드 스프레드로 첫 풀이를 받는다. 확인 포인트:
- 카드 이미지가 카드마다 인터리브되고, 카드당 4~6문장으로 두꺼워졌는지
- 종합 파트가 별도로 나오는지
- 벽처럼 안 읽히는지(버블이 카드마다 끊겨 있는지)
- 첫 풀이 완결까지 SSE 시간이 과하지 않은지(체감)

- [ ] **Step 2: 6장 또는 7장 스프레드도 1건 확인 (선택 가능한 태그에서)**

7장(재회 심층/가능성/마음 차크라) 중 하나가 진열된 태그로 들어가 첫 풀이를 받아, 3,300~3,800자 수준으로 나오고 카드당 밀도가 균일한지 확인. (QA 하네스 기본 케이스에 없어서 여기서만 확인)

- [ ] **Step 3: dev push**

```bash
git push origin dev
```

- [ ] **Step 4: dev 배포 확인**

dev.byeolkongtalk.com Vercel 배포 READY + `/api/health` 200 확인. 사용자에게 dev 검증 요청.

---

## Task 7: prod 배포 (사용자 dev 승인 후)

**Files:** 없음

- [ ] **Step 1: 사용자가 dev에서 첫 풀이 분량 확인 → 승인**

- [ ] **Step 2: main fast-forward**

```bash
git fetch origin main
git log --oneline origin/main..dev   # premium-depth 커밋들만 실리는지 확인
git push origin dev:main
```

- [ ] **Step 3: prod 배포 확인**

byeolkongtalk.com Vercel production READY + `/api/health` 200.

- [ ] **Step 4: 메모리 갱신**

`reading-depth-and-value-tuning` 메모리의 "구현 대기" → "prod 라이브(커밋 SHA, 날짜)"로, 판정일(배포+7~10일) 추가.
