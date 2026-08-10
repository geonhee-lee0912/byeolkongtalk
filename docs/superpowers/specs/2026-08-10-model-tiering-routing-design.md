# 모델 티어링 라우팅 설계 (task 종류별 모델 배치)

**Goal:** 지면(surface)·task 종류별로 서로 다른 모델을 배치해, 품질을 지켜야 할 곳은 유지하고 비용이 새는 곳은 저가 모델로 내려 API 원가를 줄인다.

**배경 (2026-08-10 캘리브레이션 결론):**
- 별콩이 chat 후보 비교(고민톡 6케이스) 결과 **gpt-5.6-luna 가 sonnet 급 품질**(객관 단언 5/6 clean·연속질문 0/6, 직접 판독=조건부범위 시점답·따뜻·그레이스풀 [END])인데 **~13x 저렴**. gpt-5-mini 는 멀티턴 화법 열세(연속질문 5/6)로 탈락. gemini-3.6-flash 는 품질은 좋으나 실단가 $1.50/$7.50 라 sonnet 대비 ~2x뿐(+sonnet 캐시 90.5% 감안 시 이점 소멸 가능) → 비용 후보로 탈락.
- 단가($/1M 입력·출력): Sonnet 5 `$3/$15` · luna `$0.20/$1.20` · gpt-5-mini `$0.125/$1` · gpt-5-nano `$0.05/$0.40`.
- pairwise 수치는 신뢰 안 함(방법론 한계). 신뢰 신호는 **객관 단언 + 직접 판독**. 정본 캘리브레이션 기록: 메모리 `model-router-qa-progress`.

**정본 인프라:** 라우터/어댑터는 이미 구현·dev 배포됨(spec `2026-08-10-model-router-qa-design.md`, plan `2026-08-10-model-router-adapters.md`). `streamChat`/`generateOnce` 가 5번째 인자 `model?` 을 받아 registry 로 dispatch. 지금은 어느 호출부도 model 을 안 넘겨 전부 sonnet(기본). **이 스펙은 "각 호출부가 어떤 모델을 넘기는가(정책)"만 정한다 — 인프라 추가 없음.**

---

## 1. 라우팅 맵 (지면·task → 모델)

| # | 지면 / task | 호출 | 모델 | 근거 |
|---|---|---|---|---|
| 1 | 고민톡 (tarot chat) | streamChat | **luna** | 멀티턴 chat, luna=sonnet급 검증(고민톡) |
| 2 | 연애 상담 (relationship chat) | streamChat | **luna** | 멀티턴 chat (⚠️QA 필요) |
| 3 | 연애 시뮬 (sim chat) | streamChat | **luna** | 멀티턴 chat (⚠️QA 필요) |
| 4 | 사주 chat (consultation resume) | streamChat | **luna** | 멀티턴 chat (⚠️QA 필요) |
| 5 | fortune 무료 데일리 (`daily`, `tarot_daily`) | generateOnce | **nano**(우선) → 안되면 mini | 단발 무료·미결제자 소모·최저가 지향 |
| 6 | fortune 유료 리포트 (`monthly`·`saju_full`·`compat`·`compat_social`·`good_days`, 및 tarot 유료) | generateOnce | **sonnet 유지** | 엄격 JSON·유료 단발·파싱실패 이력, 원가 극저라 절감 유인 없음 |
| — | haiku 유틸 (rolling 요약·민감 2차 판정·QA judge) | 직접 | **불변(haiku)** | 안전 크리티컬 등 — 손대지 않음 |
| — | sonnet | — | 유료 리포트(#6) + **미래 프리미엄 업셀** 예약 | 기존 chat 지면엔 미사용 |

**티어링 원리 — task 종류로 나눈다:** 멀티턴 chat = luna(품질/원가 균형) · 엄격-형식 유료 단발 = sonnet(신뢰성) · 무료 단발 = 최저가.

**주의 — 두 개의 "사주":** `사주 chat`(#4, `/api/consultations/saju/chat`, 상담 resume)은 **luna**. `saju_full`(#6, fortune one-shot 리포트, "2026년 사주 분석")은 **sonnet**. 이름만 겹칠 뿐 다른 지면.

---

## 2. 정책 위치 (어디서 모델을 고르나)

라우팅 정책을 상수/헬퍼로 중앙화한다(감사·미래 프리미엄 배선 용이). **레이어링:** 순수 chat 모델 상수는 `model-registry`(저수준)에, fortune 타입별 정책은 `lib/fortune`(도메인)에 둔다 — `model-registry` 가 fortune 타입에 의존하지 않게.

```ts
// lib/claude/model-registry.ts — chat 지면 표준 모델 (4개 chat 라우트 공유).
export const CHAT_MODEL = "gpt-5.6-luna"; // 미래 프리미엄 티어는 여기서 분기

// lib/fortune/model.ts (신규) — fortune one-shot 모델 정책.
//   무료 데일리는 최저가, 유료 리포트는 sonnet(형식 신뢰성).
export const FORTUNE_CHEAP_MODEL = "gpt-5-nano"; // QA 후 mini 로 폴백 가능
export function fortuneModel(type: FortuneType): string {
  return type === "daily" || type === "tarot_daily" ? FORTUNE_CHEAP_MODEL : "claude-sonnet-5";
}
```

- 4개 chat 라우트: `streamChat(..., CHAT_MODEL)` 로 명시적으로 넘긴다.
- fortune 라우트: `generateOnce(..., fortuneModel(cfg.type))`.
- **`DEFAULT_CHAT_MODEL` 은 sonnet 유지** — model 을 안 넘긴 호출부는 알려진-양품 sonnet 으로 안전 폴백(luna 로 조용히 떨어지지 않게).
- **QA 오버라이드 불변:** `resolveChatModel` 의 `QA_CHAT_MODEL` env 는 여전히 최우선 — QA 는 라우트가 뭘 넘기든 임의 모델로 강제 가능.
- `fortuneModel` 에 새 모델명(nano/luna)이 들어가므로 `model-registry` MODEL_PROVIDER 에 `gpt-5-nano`(이미 등록됨) 확인.

---

## 3. luna 타로 프롬프트 튜닝 (고민톡 #1)

캘리브레이션 실측: luna 첫 풀이는 품질·소울 sonnet급이나 **카드 내부 🃏💫🔗 3라벨 스켈레톤을 생략하고 산문**으로 쓰며 `**볼드**` 마크다운을 쓴다. 형식만 조정한다:
- 타로 페르소나/프롬프트에 카드당 🃏(카드 의미)·💫(내 상황)·🔗(흐름 연결) 서브라벨 구조를 명시(luna 는 `[CARD:n]` 마커는 이미 지키므로 유도 가능성 높음).
- 마크다운 `**` 억제(또는 결과 렌더러의 마크다운 지원 여부 확인 — 미지원 시 `**` 가 그대로 노출).
- ⚠️ **코어 편집 아님** — 타로 도메인 프롬프트만. 코어 편집은 전 종목 회귀 유발(AGENTS.md).

---

## 4. 지면별 QA 게이트 (핵심 리스크 관리)

⚠️ **luna 는 고민톡(타로)에서만 검증됐다.** 연애 상담(기억·스킬·R1~R4)·시뮬(롤플레이·doll_partner 격리)·사주 chat(만세력 해석)은 각각 다른 페르소나·형식이라 luna 거동 미검증. **블라인드 일괄 전환 금지.**

각 지면을 luna 로 전환하기 전 그 지면 QA 를 돌려 통과해야 flip:
- **고민톡:** 프롬프트 튜닝(§3) 후 재QA — 🃏💫🔗 형식 복원 + 페르소나 유지 확인.
- **연애 상담:** QA 하네스 relationship 케이스로 luna 검증(R1~R4 규칙·[SKILL] 마커·스레드 무종결).
- **시뮬:** sim 케이스로 luna 검증(몰입·doll_partner 코어 미계승·소프트수렴 제거 반영).
- **사주 chat:** saju 케이스로 luna 검증([CARD] 0개·사주 데이터 충실).
- **fortune 무료 데일리:** `daily` 프롬프트로 **nano + mini one-shot QA 대조** → 리텐션 되는 최저가 채택(nano 우선). 단발이라 멀티턴 화법 문제 무관.
- **fortune 유료 리포트:** 모델 불변(sonnet)이라 회귀 확인만(파싱 성공률).

판정 신뢰 신호: **객관 단언(특히 형식·[END]·[CARD]) + 직접 판독**. pairwise 수치 맹신 금지.

QA 실행 gotcha(메모리 `model-router-qa-progress`): `QA_CHAT_MODEL` 은 **dev 서버 env**(하네스 아님)에 걸고 서버 재기동. 6케이스 런 1회 >10분.

---

## 5. 롤아웃

- 전 변경 dev 누적 → 지면별 QA 통과 → **prod 는 로드맵 ④(dev 누적분 한 판) 시 배치.** 이 스펙 단독 prod 배포 아님.
- 배포 후 `/admin/errors` + 원가 대시보드로 파싱실패·원가 변화 관측(fortune 리포트 파싱실패율, chat 원가 절감).
- 선행 미push: 어댑터 `reasoning_effort:low`(`727b09e`)·compare 전체대화(`bdf1232`) — 이 흐름에 함께 push.

---

## 6. 비스코프 (의도적 제외)

- haiku 유틸(요약·민감 2차·judge): 불변. 특히 **민감 2차 판정(`lib/sensitive.ts`)은 안전 크리티컬 — 손대지 않는다**(model-router 스펙과 동일).
- 미래 프리미엄 업셀 티어(sonnet chat): 별도 설계.
- 가격 정합성·무료 상품 재설계: 별도 백로그.
- 모델별 세부 프롬프트 최적화(형식 외): §3 최소 튜닝만, 그 이상은 후속.

---

## 7. 성공 기준

1. 각 chat 지면이 배정 모델(luna)로 **그 지면 QA 통과**(객관 단언·형식·페르소나) 후에만 flip.
2. 고민톡 luna 첫 풀이가 🃏💫🔗 형식 복원 + 마크다운 정상.
3. fortune 무료 데일리가 nano(또는 mini)로 정상 리포트 생성(파싱·품질 확인).
4. fortune 유료 리포트(sonnet) 파싱 성공률 회귀 0.
5. tsc·유닛 회귀 0. QA 오버라이드(`QA_CHAT_MODEL`) 계속 동작.

## 8. 오픈 아이템 / 리스크

- **무료 데일리 nano vs mini:** QA 로 결정(품질 유지 시 nano). nano 품질 불충분하면 mini.
- **연애/시뮬/사주 chat luna 미검증:** QA 에서 예상외 열세면 그 지면만 sonnet 유지 또는 프롬프트 보강(§4 게이트가 잡음).
- **fortune 리포트 저가화 여지:** 지금은 sonnet 유지. 후속으로 luna 를 리포트 형식으로 검증해 안정적이면 내릴 수 있음(원가 극저라 우선순위 낮음).
- **마크다운 렌더:** 결과 화면이 `**` 를 렌더하는지 확인(luna/nano 산출물 영향).
