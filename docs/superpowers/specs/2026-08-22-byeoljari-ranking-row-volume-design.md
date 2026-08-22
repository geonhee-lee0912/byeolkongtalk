# 별자리 순위 행 볼륨업 (일간유형·관계역할·메타포·멤버 삭제) — 설계

**작성일:** 2026-08-22
**대상:** `/fortune/byeoljari/[shareId]` 인연 점수 순위 목록
**목표:** 순위 목록의 각 행을 첨부 이미지 수준의 "풀카드"로 볼륨업 — 오행 배지 + 일간 유형 + 관계 역할 + 오행쌍 + 메타포 줄글을 전 행에 표시. 펼치면 방향 카피·잘맞는점/조심 + 멤버 삭제.

## 확정된 결정 (브레인스토밍 2026-08-22)

1. **볼륨**: 전 행 풀카드(모든 행에 줄글까지). 1위는 다크 히어로 유지.
2. **일간 유형 추가**: "여름 큰산형" 식. DB 변경 없음 — `[shareId]/route.ts`가 이미 각 멤버에 `calcSaju`를 돌고 있어 `dayStem`·월지를 재사용.
3. **관계 역할 라벨 톤 = C(절충)**: 역할감 살리되 '귀인'식 단정 완화.
4. **줄글 = A(오행쌍 메타포 템플릿)**: 오행 이미지×관계 템플릿 자동 생성.
5. **아코디언 유지**: 줄글은 행에, 펼치면 방향 카피 + 잘맞는점/조심 + **지우기**.
6. **점수 이름 = "인연 점수" 유지**(케미 아님).
7. **지우기 = 신규 DELETE**: 주인만, 호스트(나) 삭제 불가, 확인 후.

## 콘텐츠 정본 (표)

### 일간 유형 (dayStem → 유형명, 10종)
`calcSaju().dayStem`(한글 천간)을 키로.
> 🔴 **구현 주의**: `dayStem`·`pillars.month.branch`의 실제 문자 포맷(한글 "갑"/"인" vs 한자 "甲"/"寅")을 구현 첫 스텝에서 실측 확인할 것 — 키가 어긋나면 조용히 폴백("별 유형")으로 전 행이 깨진다. 아래 표는 한글 가정이며, 실제가 한자면 매핑 키를 한자로. `day-type.test.ts`가 실제 `calcSaju` 출력으로 이를 검증한다([[recurring-crash-class-config-by-dynamic-key]] 동적 키 미검증 클래스).

| dayStem | 한자 | 유형명 |
|---|---|---|
| 갑 | 甲 | 큰나무형 |
| 을 | 乙 | 화초형 |
| 병 | 丙 | 태양형 |
| 정 | 丁 | 등불형 |
| 무 | 戊 | 큰산형 |
| 기 | 己 | 텃밭형 |
| 경 | 庚 | 무쇠형 |
| 신 | 辛 | 보석형 |
| 임 | 壬 | 큰바다형 |
| 계 | 癸 | 이슬형 |

폴백(키 미스): `"별 유형"` (크래시 금지, 방어적 접근자).

### 계절 (월지 branch → 계절, 4종)
`calcSaju().pillars.month.branch`(한글 지지)를 키로.

| 지지 | 계절 |
|---|---|
| 인·묘·진 | 봄 |
| 사·오·미 | 여름 |
| 신·유·술 | 가을 |
| 해·자·축 | 겨울 |

폴백: 계절 없이 유형명만. **표시 = `{계절} {유형명}`** → "여름 큰산형". 계절 폴백 시 "큰산형"만.

### 관계 역할 라벨 (톤 C, 나 기준 5종)
`oriented.element`(나 기준 오행관계)를 키로.

| element | 역할 라벨 |
|---|---|
| 생아 | 곁에서 힘이 되는 인연 |
| 아생 | 내가 마음 쓰게 되는 인연 |
| 극아 | 서로 긴장을 주고받는 인연 |
| 아극 | 내가 이끌어 가는 인연 |
| 비화 | 결이 닮은 인연 |

폴백: `"이어져 있는 인연"`.

### 오행쌍 표기 (한글+한자)
오행→한자: 목=木·화=火·토=土·금=金·수=水. `myElement`=나(호스트/pivot) 오행, `otherElement`=상대 오행.

| relation | 표기 규칙 | 예 |
|---|---|---|
| 생아(상대→나) | `{상대}생{나}({相hanja}生{我hanja})` | 토생금(土生金) |
| 아생(나→상대) | `{나}생{상대}(…)` | 금생수(金生水) |
| 극아(상대→나) | `{상대}극{나}({相}剋{我})` | 화극금(火剋金) |
| 아극(나→상대) | `{나}극{상대}(…)` | 금극목(金剋木) |
| 비화(동일) | `같은 {오행}({hanja})` | 같은 금(金) |

### 메타포 줄글 (템플릿 A)
오행 이미지 + 조사: 목=나무(가/를)·화=불(이/을)·토=흙(이/을)·금=쇠(가/를)·수=물(이/을).
`A`=작용 오행 이미지, `B`=받는 오행 이미지. 생/극 방향은 위 표와 동일(생아·극아는 상대가 A, 아생·아극은 나가 A).

| relation | 템플릿 | 예(토생금) |
|---|---|---|
| 생아 | `{A}{이/가} {B}{을/를} 살리듯, 곁에 있으면 기운이 차오르는 사이야` | 흙이 쇠를 살리듯, 곁에 있으면 기운이 차오르는 사이야 |
| 아생 | `{A}{이/가} {B}{을/를} 키우듯, 내가 마음을 쓰게 되는 사이야` | — |
| 극아 | `{A}{이/가} {B}{을/를} 다잡듯, 팽팽하게 마주 서는 사이야` | — |
| 아극 | `{A}{이/가} {B}{을/를} 다루듯, 내가 이끌어 가는 흐름이야` | — |
| 비화 | `같은 {img}처럼 닮아, 말 안 해도 통하는 사이야` | 같은 쇠처럼 닮아, 말 안 해도 통하는 사이야 |

조사는 이미지 5개가 고정이라 각 이미지에 (주격, 목적격)을 상수로 둔다(정규식 josa 불필요).

## 렌더 구조

### 순위 행(전 행 풀카드)
- 1행: `[순위배지] [오행배지] 이름 · {계절}{유형명}` … 우측 `인연 점수(숫자, 큰 글씨)`
- 구분선
- 2행: `[등급칩(색상)] {관계역할} · {오행쌍}`
- 3행: `{메타포 줄글}`
- 1위 = `bg-night text-cream-warm`(히어로), 2위~ = `bg-cream-warm`.
- 오행배지 = `STAR_ELEMENT_COLORS[element]` 원 + 오행 글자(진한 톤). 순위배지 = 1위 골드/그 외 lilac-soft 원+숫자.
- 등급칩 색 = 기존 `gradeChipClass`(골드/라일락/세이지/웜그레이) 재사용.

### 펼침(아코디언) — 행과 중복 제거
`InyeonDetail`에서 **줄글(prose) 제거**(행에 있음). 펼침 = 인연점수 근거(reasons) + `내가 보는 X` / `X가 보는 나`(방향 카피) + 잘 맞는 점/살짝 조심 + 키워드칩(유지). 하단에 **지우기** 영역(순위 아코디언에서만, 아래 조건).

### 지우기 UI
- 노출 조건: **뷰어가 주인**(`meId === host.id`) **AND 대상이 호스트 아님**. 포커스 카드 이웃 목록엔 미노출(순위 아코디언 전용).
- 인라인 확인: `지우기` 탭 → `정말 지울까? [취소] [삭제]` 인라인 노출(별도 포털 모달 없음).
- `삭제` → DELETE 호출 → 성공 시 그래프 재조회(부모가 `router.refresh()` 또는 재fetch) → 리렌더.

## 백엔드 — 멤버 삭제

**신규** `DELETE /api/fortune/byeoljari/[shareId]/members/[memberId]/route.ts`
- `getSession()` → `{ userId, anonymousId }`. 세션 없으면 401.
- shareId로 map 조회. **주인 검증**: `owner_user_id === userId`(로그인) **또는** (`owner_user_id IS NULL` AND `creator_anon_id === anonymousId`)(비로그인). 불일치 403.
- memberId 조회 → `member.map_id === map.id` 확인(불일치 404), `is_host === true`면 409(호스트 삭제 금지).
- `star_map_members` 행 삭제. (엣지·삼합은 조회 시 계산이라 별도 정리 불필요.)
- 응답 `{ ok: true }`. 실패 시 `logError` + 500.
- `runtime="nodejs"`, `dynamic="force-dynamic"`.

## 파일

**신규 (순수 + 테스트, TDD):**
- `lib/byeoljari/day-type.ts` — `dayType(dayStem, monthBranch): string`("여름 큰산형"). `day-type.test.ts`.
- `lib/byeoljari/relation-role.ts` — `relationRole(element): string` / `elementPair(relation, myEl, otherEl): string`(토생금) / `metaphorProse(relation, myEl, otherEl): string`. `relation-role.test.ts`.

**수정:**
- `lib/byeoljari/types.ts` — `GraphNode` += `dayType: string`.
- `app/api/fortune/byeoljari/[shareId]/route.ts` — 노드 payload에 `dayType: dayType(saju[i].dayStem, saju[i].pillars.month.branch)` 주입.
- `components/byeoljari/ConstellationView.tsx` — 순위 행을 풀카드로 재구성(전 행) + 지우기(인라인 확인 + DELETE + 재조회) 배선. `myElement` = host 노드 element.
- `components/byeoljari/InyeonDetail.tsx` — prose 제거(행으로 이동). 나머지 유지.
- `app/api/fortune/byeoljari/[shareId]/members/[memberId]/route.ts` — 신규 DELETE.

**영향 없음(재확인):** 재화/결제/민감·페르소나·다른 종목. byeoljari는 dev 잔류(main 미머지)라 이번 변경도 dev 한정.

## 비목표(YAGNI)
- 케미 리네이밍(인연 점수 유지). 사람별 이모지. 순위 행 드래그 정렬. 멤버 수정(생일 변경). 삭제 취소(undo).

## 테스트
- `day-type`: 10 일간×대표 계절, 폴백(미지 stem/branch).
- `relation-role`: 5 관계 역할/오행쌍/메타포, 조사(받침 유무), 비화 특례, 폴백.
- DELETE: 주인/비주인/호스트/타 맵 멤버 4케이스(브라우저 또는 프로브).
- 렌더: 전 행 풀카드, 1위 히어로, 지우기 노출 조건(주인·비호스트), 인라인 확인→삭제→리렌더.
