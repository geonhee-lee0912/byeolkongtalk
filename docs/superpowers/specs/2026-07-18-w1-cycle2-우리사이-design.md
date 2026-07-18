# W1 사이클 2 — "우리 사이" v1 기술 설계

**작성일**: 2026-07-18
**상태**: 브레인스토밍 완료, 사용자 검토 대기 → writing-plans
**상위 스펙**: [2026-07-17 W1 재편 설계](2026-07-17-w1-love-restructure-w6-ads-design.md) §6 (제품 설계 확정본) — 본 문서는 §6·§12가 구현 시점으로 미룬 **기술 아키텍처**를 확정한다.
**배포 정책**: ⚠️ 모든 커밋 dev 전용. prod(main) 머지는 사이클 1~3 전체 QA 후 1회 일괄 (사이클 3 범위).

---

## 0. 확정된 아키텍처 결정 (브레인스토밍 2026-07-18)

| # | 갈림길 | 결정 |
|---|---|---|
| 1 | 영원한 스레드 DB 모델 | **하이브리드** — 신규 `relationships` 테이블(관계 파일) + 스레드 본체는 `readings` 재사용(`consultation_type='relationship'`) + `messages` 재사용 |
| 2 | 장기 기억(롤링 요약) | **파일 + 임계치 요약** — 최근 N턴 원문 + 임계 초과분 haiku 요약(`rolling_summary`) + 구조화 파일(`memo`). 완전 롤링은 v1 과설계(원가·오차·캐싱 불리)로 기각, 데이터 확인 후 승격 가능 |
| 3 | 사이클 2 범위 | **풀 §6 v1**, dev에서 2a→2d 단계 빌드 |
| 4 | 5별 연장 (턴수·횟수) | **5별당 +5턴, 횟수 제한 없이 무제한 반복** (과금 분산·마찰 유지) |
| 5 | 패스 중첩 | **기존 만료에 이어붙임** (활성 중 구매 시 시간 손실 없음) |
| 6 | 스킬 실행 UX | **둘 다** — 별콩이 마커 칩(맥락 제안, 탈출구 문구 없음) + 접힌 상시 스킬 메뉴 |
| 7 | 소프트캡 vs 스킬 | **자유대화 턴만 제한** — 캡 도달해도 스킬(별도 결제)은 실행 가능 |
| 8 | 프로필 삭제 대처 | **허용 + 우아한 강등** — SET NULL, 스레드 유지, 궁합만 잠금 + 재등록. 스킬은 **확장 가능 레지스트리**로 열어둠 |

---

## 1. 데이터 모델

### 1.1 신규 `relationships` (관계 파일 — v1 유저당 1개)

```sql
CREATE TABLE relationships (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label              VARCHAR(50) NOT NULL,                    -- 호칭
  status             VARCHAR(20) NOT NULL
                       CHECK (status IN ('crush','dating','breakup','onesided')), -- 썸/연애중/이별/짝사랑
  self_profile_id    UUID REFERENCES user_profiles(id) ON DELETE SET NULL,   -- 내 사주 (궁합 조건)
  partner_profile_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,   -- 상대 사주
  thread_reading_id  UUID REFERENCES readings(id) ON DELETE SET NULL,        -- 영원한 스레드 본체
  rolling_summary    TEXT,                                    -- 임계 초과분 요약
  summary_upto       TIMESTAMPTZ,                             -- 요약이 커버한 마지막 메시지 시점
  memo               JSONB NOT NULL DEFAULT '{}'::jsonb,      -- 구조화 파일 (§5.3)
  last_visited_at    TIMESTAMPTZ,                             -- 인앱 체크인 트리거
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_relationships_user_one ON relationships(user_id); -- v1 단일. 복수 관계는 백로그 → unique drop
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;                       -- service_role 만 RW
```

- 상태값 매핑: `crush`=썸, `dating`=연애중, `breakup`=이별, `onesided`=짝사랑.
- `status`는 관계 흐름에 따라 변경 가능(예: 썸→연애중). 업데이트 API 제공.

### 1.2 신규 `relationship_passes`

```sql
CREATE TABLE relationship_passes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  kind            VARCHAR(10) NOT NULL CHECK (kind IN ('day1','day3','day7')),
  stars_spent     INT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_passes_active ON relationship_passes(relationship_id, expires_at DESC);
ALTER TABLE relationship_passes ENABLE ROW LEVEL SECURITY;
```

- **활성 패스** = 해당 relationship에 `expires_at > now()` 행 존재.
- **중첩(결정 5)**: 구매 시 활성 패스 있으면 `expires_at = max(활성 expires_at, now()) + 기간`, 없으면 `now() + 기간`.

### 1.3 `readings` 확장 (하이브리드 핵심)

```sql
-- consultation_type CHECK 에 'relationship' 추가
ALTER TABLE readings DROP CONSTRAINT readings_consultation_type_check;  -- 실제 제약명 확인 후
ALTER TABLE readings ADD CONSTRAINT readings_consultation_type_check
  CHECK (consultation_type IN ('saju','tarot','relationship'));

-- 스레드 본체 + 스킬 자식 reading 모두 관계에 귀속
ALTER TABLE readings
  ADD COLUMN relationship_id UUID REFERENCES relationships(id) ON DELETE CASCADE;
CREATE INDEX idx_readings_relationship
  ON readings(relationship_id, created_at) WHERE relationship_id IS NOT NULL;
```

- **스레드 본체** reading: `{consultation_type:'relationship', relationship_id, profile_id/saju_data/spread_* 전부 NULL}` (tarot 마이그레이션이 이미 nullable 화). `messages`가 대화 내용.
- **스킬 자식** reading: 기존 타입 그대로 + `relationship_id` 부착 (§4).
- CASCADE 체인: `users→relationships→readings(관계)→messages` 자동 정리. 탈퇴 라우트 추가 코드 불필요.

### 1.4 상대 등록 = `user_profiles` 재사용

- 내 프로필: 기존 primary 프로필 재사용(없으면 등록 유도).
- 상대 프로필: `relation_type='partner'`로 신규 `user_profiles` 행 (호칭=display_name, 생년월일시).
- `relationships.self_profile_id`/`partner_profile_id`가 둘을 링크 → 궁합 스킬 조건(양쪽 생일) 자동 충족.

---

## 2. `/relationship` 탭 — 화면 상태 매트릭스

로그인·등록·패스 상태에 따라 6개 상태. "구매 안함"=S2, "연장 안함"=S4, "구매함"=S3.

| 상태 | 조건 | 화면 구성 |
|---|---|---|
| **S0** 미로그인 | — | `/login?next=/relationship` 가드 |
| **S1** 로그인·미등록 | 관계 없음 | **콜드스타트**(마케팅 지면, 스펙 §5): 종목 소개 + 스킬 미리보기 + 패스 가격 안내 + "상대 등록하고 시작" CTA |
| **S2a** 등록·패스없음·신규 | 스레드 빔 | 관계 헤더(호칭·상태) + "별콩이랑 우리 얘기 시작하기" 소개 + **패스 구매 패널**(1일20/3일40/7일60·한도 명시·7일 추천) = 주 CTA. **입력창 잠금**. (1일권 = 웰컴 30별 트라이얼 지점) |
| **S2b** 등록·패스만료·재방문 | 히스토리 있음 | 스레드 히스토리 **읽기 전용** + "패스가 만료됐어, 다시 이어가자" + 구매 패널 |
| **S3** 등록·패스활성·캡 이내 | **구매했을 때** | 정상 스레드. 상단 패스 잔여(D-day) + 오늘 남은 턴(20−사용). 입력 활성. 스킬(마커 칩 + 접힌 메뉴) |
| **S4** 등록·패스활성·오늘 캡 도달·연장X | **연장 안했을 때** | 스레드 끝에 별콩이 하루 마무리. 입력창 자리 → **"오늘 여기까지 · 5별로 +5턴 이어가기" 칩** + "내일 이어서 얘기해줄게". 패스 유효 → 구매 아님(연장만). **스킬은 실행 가능**(자유대화만 캡, §3.1) |

- **partner 생일 누락 배너**(어느 등록 상태든 `partner_profile_id IS NULL`): 비침습 인라인 "상대 생년월일이 없어 — 궁합 보려면 다시 등록" (스레드 대화는 정상). §4.3.

### 2.1 등록 온보딩

- 호칭 → 관계 상태(4택) → 양쪽 생년월일시(내 것 = primary 프로필 재사용/신규, 상대 = partner 프로필). 생일은 "궁합 스킬에 필요, 나중에 추가 가능"으로 선택적 진행 허용(궁합 스킬만 미등록 시 잠금).
- 완료 → `relationships` INSERT + 스레드 본체 reading INSERT(`thread_reading_id` 설정) → 스레드 진입.

---

## 3. 지속 스레드 채팅 (`POST /api/consultations/relationship/chat`)

기존 타로 chat 라우트를 뼈대로 하되 **수렴/[END] 제거**. SSE 스트림·messages INSERT·민감 감지·rate limit·nickname은 그대로 재사용.

### 3.1 게이트 & 한도

1. **패스 게이트**: 활성 패스 없으면 `402 {error:"pass_required"}` → 클라 패스 구매 유도.
2. **일일 소프트캡**: "오늘"=KST 캘린더일. 오늘 스레드 user 턴 수 계산(messages.created_at, KST). 허용량 = `20 + 5 × (오늘 연장 횟수)`.
   - 허용량 도달 턴: 별콩이가 **부드럽게 하루 마무리**("오늘은 여기까지 하자, 내일 또 얘기해 줘" — `[END]` 아님, 스레드 유지) + 응답 헤더 `X-Daily-Cap: reached` → 클라가 "5별로 오늘 더 이어가기" 칩 노출.
   - **연장(결정 4)**: 5별 → `spend_stars(source='rel_extend')` → 그 즉시 오늘 허용량 +5. 오늘 연장 횟수 = 오늘(KST) `star_transactions where source='rel_extend'` count (별도 카운터 테이블 불필요). **연장 횟수 상한 없음(무제한) — `dailyTurnAllowance`에 cap 두지 말 것.**
   - **소프트캡은 자유대화 턴에만 적용**(결정): 캡 도달해도 스킬(별도 결제 상품)은 실행 가능. 스킬 결과 후속 자유대화는 다시 턴 소모 → 자연 연장 유도.
3. 절대 상한 없음(패스 기간 내 무한 재방문). 소프트캡만이 일일 브레이크.

### 3.2 기억 주입 (결정 2: 파일 + 임계치 요약)

시스템 메시지 = `[페르소나(캐시)] + [관계 파일] + [rolling_summary] + [최근 N턴 원문]`

- **최근 N턴**: 최근 messages 원문 그대로 (N≈12턴/6000자 예산 — 플랜에서 실측 튜닝).
- **rolling_summary**: `summary_upto` 이전(=최근 창 밖) 대화의 요약. 매 턴 정적 → 캐싱 유리.
- **임계치 요약 트리거**(백그라운드, fire-and-forget): 창 밖 원문이 임계(예: 16턴/6000자) 초과 시, 초과분을 haiku로 요약해 `rolling_summary` 갱신 + `summary_upto` 전진. 답변 스트림과 분리 → 응답 지연 없음.
- **관계 파일**(`memo` + relationships 컬럼): 호칭·관계상태·양쪽 생일 요약·처방 로그·스킬 로그. 결정적 주입(요약 드리프트로 안 잃음).
- **원가 안전성**: 창+요약으로 컨텍스트가 항상 bounded → 스레드가 깊어져도 턴당 ~₩25 유지(스펙 §6 원가모델 성립).

### 3.3 페르소나 (관계 에이전트 톤)

- 별도 대형 페르소나 파일 없이 `data/persona/byeolkong.md` 베이스 + **관계 에이전트 동적 블록**(saju/tarot 도메인 블록과 동일 패턴):
  - 첫 진입/복귀 안부, 기억 참조("저번에 ~"), 처방→체크인, 스킬 제안(마커, **탈출구 문구 금지** — C3 교훈).
  - 단정 예언 금지·흐름/가능성/선택 3키워드 등 기존 화법 원칙 유지.

---

## 4. 스킬 (결정 6: 마커 칩 + 접힌 상시 메뉴, 확장 가능 레지스트리)

인스레드 상품. **활성 패스 필요**(스펙 §6 "패스 선구매 후의 인챗 상품"). 스킬 = `relationship_id` 부착된 자식 reading. 완료 시 결과 요약을 스레드 노트 + `memo.skill_log`에 반영 → 별콩이 이후 기억.

### 4.1 확장 가능 레지스트리 (단일 진실 원천)

`SPREAD_INFO`/`FORTUNE_CONFIG`와 동일 패턴 — 서버검증·가격·UI가 한 config를 자동 추종. **스킬은 늘어날 수 있으므로** 라우트·UI에 하드코딩하지 않는다.

```ts
// lib/relationship/skills.ts
export type SkillKind = "tarot_draw" | "compat" | "dialogue";
export interface RelationshipSkill {
  key: string;                    // "checkin" | "deep_feelings" | "compat" | "verdict" | …미래
  label: string; tagline: string;
  starCost: number;
  kind: SkillKind;
  spread?: SpreadType;            // kind="tarot_draw" 일 때
  requiresPartnerBirth?: boolean; // compat=true (partner_profile_id 없으면 잠금)
  active: boolean; order: number; // 진열 토글(과거 실행 config 보존)
}
export const RELATIONSHIP_SKILLS: RelationshipSkill[] = [ …v1 4종 ];
```

- 마커 `[SKILL:<key>]` → 레지스트리 키로 검증. 접힌 메뉴는 `filter(active).sort(order)` 순회. 디스패치는 `kind` switch.
- **스킬 추가 = 레지스트리 항목 + 프롬프트만.** 새 `kind`가 필요할 때만 핸들러 추가. 라우트·UI·가격은 무수정.
- 서버 별 차감은 `RELATIONSHIP_SKILLS[key].starCost`가 정본(위조 차단, 기존 스프레드 검증과 동일).

### 4.2 v1 진열 4종

| key | 스킬 | 가격 | kind = 재사용 |
|---|---|---|---|
| `checkin` | 관계 체크인 | 45 | `tarot_draw` (`checkin_6`) → 타로 reading |
| `deep_feelings` | 걔 속마음 | 40 | `tarot_draw` (`deep_feelings_5`) → 타로 reading |
| `compat` | 우리 궁합 | 40 | `compat` (등록 두 프로필 → compat 리포트) |
| `verdict` | 싸움 잘잘못 판정 | 30 | `dialogue` (신규, 드로우 없음): 양쪽 입장 청취 → 비율 판정 → 화해 처방 |

- **실행 UX**: (a) 별콩이가 맥락상 적절할 때 마커(예: `[SKILL:checkin]`) → 칩 노출(탈출구 문구 금지, C3 교훈), (b) 스레드 접힌 상시 스킬 메뉴(active 스킬 + 가격) 상시 접근.
- 판정 30별은 §7 가격원칙의 **의도적 예외**(패스 선구매 후 상품이라 웰컴함정 성립 안 함 — 스펙 명시).
- 스킬 결과 reading은 보관함(/readings)에 정상 노출(결과지 있음). 스레드 본체 reading만 보관함 제외.

### 4.3 프로필(파트너/self) 삭제 대처 (결정: 허용 + 우아한 강등)

마이페이지 프로필 관리에서 `relationships`가 참조하는 프로필 삭제 시:
- FK는 **SET NULL** → `partner_profile_id`/`self_profile_id`만 NULL. **스레드·기억(memo/요약)·과거 스킬 결과는 전부 보존**(호칭·상태는 relationships에, 과거 reading은 자체 데이터).
- 영향은 **미래 `requiresPartnerBirth` 스킬(궁합)뿐** → 재계산에 생일 필요 → 해당 스킬 잠금 + "생일 다시 등록" 경로.
- **마이페이지 삭제 화면**: 관계에서 사용 중인 프로필이면 "우리 사이에서 사용 중 — 삭제하면 궁합을 다시 보려면 생일을 다시 등록해야 해요" 경고 후 허용.
- **우리 사이 탭**: `partner_profile_id IS NULL`이면 §2 비침습 배너 + 재등록(새 partner 프로필 생성 → relink). self 누락도 동일.
- (백로그: 생일 스냅샷을 relationships에 비정규화하면 삭제에도 사주 기억까지 보존 — v1 미채택.)

---

## 5. 인앱 체크인 (처방 → 복귀 루프)

- **처방 적립**: 별콩이가 실행 가능한 처방을 줄 때 `[CHECKIN:내용]` 마커 → 서버가 `memo.pending_checkin = {text, created_at}` 세팅.
- **복귀 안부**: 스레드 진입 시 `pending_checkin` 존재 && (`now - last_visited_at` > 갭, 예 6h)이면 첫 턴 시스템 프롬프트가 "먼저 안부: {내용}" 지시 → 별콩이가 "저번에 ~ 해보기로 했잖아, 어떻게 됐어?"로 연다 → 응답 후 `pending_checkin` 소진(→ `memo.prescriptions` resolved 이동).
- `last_visited_at`은 스레드 진입 시 갱신.
- 카카오 푸시 체크인은 W5 백로그(인앱만 v1).

### 5.3 `memo` JSONB 구조

```json
{
  "prescriptions": [{ "text": "...", "created_at": "...", "resolved_at": "..." }],
  "pending_checkin": { "text": "...", "created_at": "..." },
  "skill_log": [{ "skill": "checkin", "reading_id": "...", "summary": "...", "created_at": "..." }]
}
```

---

## 6. 내비게이션

- BottomTab 3번째 `내 고민톡(/readings)` → **`우리 사이(/relationship)`** 교체 (라벨 "우리 사이", active=lilac-deep).
- 보관함(`/readings`)은 **내 정보(/mypage)** 진입점으로 이동(스펙 §5). mypage에 "내 고민톡 보관함" 링크 추가.
- 스레드 본체 reading은 보관함 목록 API에서 제외(`consultation_type != 'relationship'` 필터). 스킬 자식 reading은 정상 노출.

---

## 7. 단계 빌드 (전부 dev)

- **2a 기반**: 마이그레이션(relationships + passes + readings ALTER) · 상대 등록 온보딩(S1 콜드스타트 + 온보딩) · 우리 사이 탭 · 보관함→내정보 이동 · 마이페이지 프로필 삭제 경고·강등(§4.3).
- **2b 스레드 + 패스**: 관계 채팅 라우트(무수렴·패스 게이트·소프트캡·5별 연장) · 패스 구매 RPC/UI(한도 명시) · 기억(파일+최근N+임계요약) · 관계 에이전트 페르소나 블록 · **화면 상태 S2/S3/S4**.
- **2c 스킬**: 레지스트리 `lib/relationship/skills.ts` · 마커+칩 + 접힌 메뉴 · v1 4스킬(체크인·속마음·궁합·판정) · 결과 스레드/`memo` 반영 · 궁합 partner 생일 잠금.
- **2d 인앱 체크인**: 처방→체크인 루프 · 마무리/복귀 화법.
- QA(하네스 + 브라우저 E2E)와 prod 일괄 배포는 **사이클 3**.

---

## 8. 엣지 / 플랜에서 확정할 항목

- `readings_consultation_type_check` 실제 제약명 확인 후 ALTER (없으면 tarot 마이그레이션 방식대로).
- 패스 구매·연장의 이중탭 방지: 클라 버튼 가드 + 원자 RPC. (결제 아님·별 차감이라 payment_id식 멱등 불가 → 필요 시 nonce 추가는 백로그.)
- 소프트캡 "오늘"의 KST 경계 계산 위치(서버 tz 무관하게 KST 고정).
- 스킬 게이트: 활성 패스 필요(스탠드얼론 궁합은 이미 `/fortune/compat` 40별로 존재 → 중복 아님).
- 스레드 첫 진입(등록 직후) 첫 턴: 자동 풀이 없음 — 별콩이가 관계 파일 기반으로 대화 시작 유도.
- 미완료/resume 개념: 스레드는 항상 "진행 중" → 기존 readings resume/continue 로직과 분리(스레드는 그 대상 아님).
- QA 하네스에 관계 스레드 시나리오(소프트캡 마무리 톤·복귀 체크인·스킬 마커) 추가는 사이클 3.
- AGENTS.md 갱신(탭·상품·우리 사이 구조)은 2d 말미 또는 사이클 3.

---

## 9. 성공 기준 (dev 검증 — 사이클 3 QA에서 최종)

1. 미등록 `/relationship` = 콜드스타트(S1), 등록 온보딩(호칭·상태·양쪽 생일) → relationships + 스레드 생성.
2. 화면 상태: S2a(신규·입력잠금·구매패널) / S2b(만료·읽기전용+구매) / S3(활성·정상) / S4(캡·연장칩) 각각 정확히 렌더.
3. 패스 없이 전송 → 402 → 패스 구매(1일20/3일40/7일60, 한도 명시) → 스레드 대화 가능.
4. 패스 활성 중 재구매 → 만료가 이어붙음.
5. 하루 20턴 도달(S4) → 부드러운 마무리(스레드 유지) + 5별 연장 → +5턴 재개. 캡 도달해도 스킬은 실행 가능.
6. 스레드 깊어져도 기억 유지(최근 원문 + 요약 + 파일), 응답 지연 없음(요약 백그라운드).
7. 스킬: 마커 칩 + 접힌 메뉴 양쪽에서 실행, 별 차감(레지스트리 정본), 결과가 스레드에 기억됨. 레지스트리에 항목 추가만으로 신규 스킬 진열(확장성 스모크).
8. 파트너 프로필 삭제 → 스레드·기억 유지, 궁합 스킬만 잠금 + 재등록 경로, 삭제 화면 경고 노출.
9. 처방 후 재방문 시 별콩이가 먼저 안부(체크인) → 소진.
10. 탭 "우리 사이" 노출, 보관함은 내 정보에서 접근, 스레드 본체는 보관함 미노출.
11. 회원 탈퇴 시 relationships/passes/스레드/스킬 reading CASCADE 정리.
