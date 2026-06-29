# 고민 이어가기 (Reading Continuation) — 설계

작성일: 2026-06-29
범위: 사주 + 타로 (동시)

## 1. 배경 / 문제

별콩이의 마무리 화법은 "다음에 또 보자"고 약속하지만, 현재 그 약속을 받쳐줄 실기능이 없다.
완료된(`ended`) reading 뒤 사용자가 **같은 고민을 이어서** 풀고 싶을 때 진입점이 없고,
페르소나는 "지금은 같은 대화를 재개하는 기능이 없으니 '새로 펼쳐서'로 표현"하는 빈 약속 상태다.

이 기능은 **완료된 과거 reading을 참조하는 새 reading**을 만들어, 별콩이가
"지난번에 ~ 얘기 나눴었지"로 이어 열게 한다.

> 구분: 방금 추가한 **resume**(미완료 reading 잇기)와 다르다. 이어가기는 *완료된* reading에서 *새* reading을 시작한다.

## 2. 핵심 모델

- 이어가기 = **새 `readings` row** + 부모(과거) reading 참조(`previous_reading_id`) + 과거 요약을 system prompt에 주입.
- 과거 요약 소스: **지난 고민(`question`) + 마지막 한마디(`extractClosingLine`)** — 추가 LLM 호출 없음, 결정적.
- 전체 대화 히스토리는 주입하지 않는다 (요약만).

### 두 경로 (유저가 CTA에서 선택)

| 경로 | key | 사주 | 타로 | 가격 |
|---|---|---|---|---|
| 새로 펼쳐 이어보기 | `fresh` | 같은 사주판 재풀이 + 기억 | **새 카드 draw** + 기억 | 정가 (parent와 동일) |
| 같은 결로 더 깊이 | `deep` | 같은 판, 지난 대화 더 파기 | **같은 카드 복사** + 더 깊이 | `round(parent * 0.6)`, 표기 "40% 할인" |

가격은 하드코딩하지 않고 **상품 정가**(사주 `SAJU_READING_COST`, 타로 `SPREAD_INFO[spread].starCost`) 기준 `Math.round(fullCost * 0.6)`로 계산. 부모의 `stars_spent`가 아니라 정가 기준 — 체인(이어가기를 또 이어가기) 시 매번 할인이 누적돼 0으로 수렴하는 것 방지.

현재 정가 기준 deep 가격:

| 상품 | 정가 | deep(60%) |
|---|---|---|
| 사주 | 20 | 12 |
| 타로 one_card | 10 | 6 |
| 타로 two_card | 15 | 9 |
| 타로 three_card | 25 | 15 |
| 타로 relationship_5 | 40 | 24 |

> 사주 뉘앙스: 사주는 어느 경로든 사주판이 동일하다. 두 경로의 실제 차이는 (프롬프트 프레이밍 + 가격)뿐. `fresh` = "새 사주 상담(같은 생일) + 지난 기억", `deep` = "지난 대화 themes 이어서 파기". 두 경로 모두 유지하기로 결정.

## 3. 진입 & 경로 선택 UX

### 진입점 (완료된 `ended` reading만, `has_sensitive=false`만)

- 사주/타로 **result 페이지**: 기존 "새 사주/새 카드 보러가기" CTA 옆/위에 **"이 고민 이어가기"** 추가.
- **/readings 히스토리 카드**: ended consult 카드에 "이어가기" 액션. resume 배지(미완료 잇기)와 시각적으로 구분.

### 선택 화면 — `/continue/[readingId]` (신규 페이지)

- 상단 연속성 앵커: "지난번 고민" 카드(부모 `question`) + "별콩이 마지막 한마디"(closing line).
- 고민 textarea: **부모 고민 프리필, 편집 가능** (그대로 두거나 다듬기). 길이 제한 기존과 동일(10~200자).
- 감정: 부모 `emotion_tag` 승계(고정, 재선택 없음).
- 두 경로 버튼: "✨ 새로 펼쳐 이어보기 (정가 N별)" / "🔍 같은 결로 더 깊이 (40% 할인, M별)" — 각 가격·잔액 표기.
- 페이지는 부모 reading 소유권 검증(미인증 → `/login?next=/continue/[id]`).

### 경로별 흐름

- **타로-fresh**: `/tarot`(draw 흐름)로 이동, `sessionStorage`에 `{ previousReadingId, mode:'fresh', concern, emotion }` 적재 → draw 완료 후 타로 reading 생성 라우트가 이 필드를 포함해 생성(정가).
- **타로-deep / 사주-fresh / 사주-deep**: draw·생일입력 불필요. 서버가 부모에서 `saju_data` / `drawn_cards` / `spread_*` / `profile_id` / `emotion_tag` 복사해 바로 reading 생성 → reading 페이지 직행.

## 4. 데이터 모델

`supabase/migrations/<timestamp>_reading_continuation.sql`:

```sql
ALTER TABLE readings
  ADD COLUMN previous_reading_id uuid REFERENCES readings(id) ON DELETE SET NULL,
  ADD COLUMN continuation_mode text CHECK (continuation_mode IN ('fresh','deep'));

CREATE INDEX idx_readings_previous
  ON readings(previous_reading_id)
  WHERE previous_reading_id IS NOT NULL;
```

- 부모 삭제 시 `SET NULL`: 이어가기 reading 자체는 보존, 요약 주입만 사라짐(chat 라우트가 null 가드).
- 체인: 이어가기 reading을 또 이어가기 가능. 항상 *직전* 부모만 참조 → 요약 1단계만 주입.

## 5. 컨텍스트 주입 (프롬프트)

### 생성 라우트 (`/api/readings` POST + 타로 생성 라우트)

- body에 `previousReadingId?`, `continuationMode?` 수용.
- `previousReadingId` 있으면: 부모 reading 소유권 + `ended` 검증, `continuation_mode` 저장.
- deep 모드: 부모의 `saju_data` / `drawn_cards` / `spread_type` / `spread_category` / `profile_id` / `emotion_tag` 복사. 가격 = `round(상품 정가 * 0.6)` (부모 stars_spent 아님).
- fresh 모드: 정가. (타로는 클라가 새로 draw한 `drawnCards`를 보냄.)

### chat 라우트 (`saju/chat` + `tarot/chat`)

- reading 조회 시 `previous_reading_id` 포함.
- 있으면 부모의 `question` + 부모 messages의 closing line(`extractClosingLine`)을 조회.
- `buildSystemMessage` / `buildTarotSystemMessage`에 `continuation?: { prevQuestion, prevClosing, mode }` 전달.

### `lib/claude.ts` 주입 블록 (양 도메인 공통 패턴)

`dynamicPart`에 추가:

```
## 이어가기 세션 (지난 고민 연속)
[지난 고민: {prevQuestion}]
[지난번 별콩이 마지막 한마디: {prevClosing}]
- 첫 응답을 "지난번에 ~ 얘기 나눴었지" 식으로 자연스럽게 이어서 열 것.
- mode=deep: 같은 {카드/사주판}을 더 깊이 파는 톤.
- mode=fresh: 새로 펼친 결을 지난 맥락과 연결.
```

- **첫 턴 가이드 교체**: `continuation`이면 기존 product/tarot first-turn 가이드 대신 *연속성 첫 턴 가이드*를 사용(안 그러면 "오늘 너에게 들어온 글자는…" 식으로 처음 만난 듯 열림). 단, 첫 응답이 여전히 사주/카드 풀이의 실질 내용을 담도록 가이드.

## 6. 페르소나 마무리 화법 정정

`data/persona/byeolkong.md` + `lib/claude.ts`의 `gracefulClosingBlock`(사주·타로 양쪽):

- 현재: "이건 다음에 **새로** 사주를/카드를 펼쳐서 같이 더 봐도 좋아 … (지금은 [END] 뒤 같은 대화를 재개하는 기능이 없으니 '새로 펼쳐서'로 표현)".
- 변경: "이 고민, 다음에 **'이어가기'로 다시 만나자**" — 실기능으로 약속을 받침. 빈 약속 회피 주석 제거.

## 7. 스코프 / 엣지

- `has_sensitive=true` 부모는 **이어가기 CTA 숨김** (공유 차단과 동일 정책).
- 미완료(`ended=false`) reading은 이어가기 아님 → resume 대상(이미 구현됨).
- 별 부족 시 기존 `/shop` 분기 재사용.
- 부모-자식은 별도 reading → result/history에 각각 남고, 체인이 히스토리에 누적.
- `previous_reading_id`가 가리키는 부모가 삭제됐으면(SET NULL) chat 라우트는 요약 주입 없이 일반 reading처럼 동작.

## 8. 성공 기준 (검증)

1. 사주/타로 result + /readings(ended)에 "이 고민 이어가기" 노출, `has_sensitive`·미완료엔 미노출.
2. `/continue/[id]`에서 지난 고민·한마디 표시 + 고민 프리필/편집 + 두 경로 가격 정확.
3. 타로-fresh → 새 draw → 새 카드로 reading, `previous_reading_id`/`mode=fresh` 저장, 정가 차감.
4. 타로-deep / 사주 양 경로 → 부모 필드 복사, deep는 `round(parent*0.6)` 차감.
5. 첫 응답이 "지난번에 ~" 식으로 열리고 실질 풀이 포함.
6. 페르소나 마무리가 "이어가기로 다시 만나자"로 약속.
7. 부모 삭제 후 자식 chat이 에러 없이 동작(요약 생략).
