# 정성 이탈조사 설문 — 설계 (2026-08-09)

## 배경·목적

T3(데이터 분석 → 모델·페르소나 재설계 + 무료상품 재설계)의 **정성 입력값**을 모으는 설문. 정량 지표(어드민·손익)로는 안 보이는 "유저의 실제 목소리"를 수집한다.

원래 프레이밍은 "떠난 유저의 침묵을 메운다"였으나 — 캐러셀·팝업은 **지금 앱에 들어와 있는 유저에게만** 닿는다(완전 이탈자는 앱 밖 채널이 있어야 잡히고, 카카오 채널 CRM은 발송비 부담으로 이미 '패스' 결정). 따라서 실제 대상은 **앱 내 잔존·재방문·리딩 경험자**로 좁힌다. 아웃바운드(알림톡·이메일)는 스코프 밖.

## 확정 결정 요약

| 축 | 결정 |
|---|---|
| **대상** | 앱 내 리딩 경험자(결과화면 카드는 리딩 완료가 곧 자격) + 캐러셀 자발 참여. "신규 첫방문 제외"는 결과화면 카드가 정의상 충족(리딩을 해야 결과화면에 도달) |
| **초점** | 5축 — ①상담 품질·페르소나 ②재방문 동기·니즈 ③결제 장벽 ④콘텐츠 니즈(타로·사주) ⑤분량(상담·리포트) |
| **보상** | **10별** (`SURVEY_REWARD_STARS`), 1인 1회 |
| **형태** | 자유서술 인터뷰형 6문항, **전부 필수 · 각 최소 50자** |
| **진입** | 캐러셀(상시) + 결과화면 하단 카드(미참여 시). 자동 모달 ❌ |
| **어드민** | `/admin/survey` — 응답 원문 최신순 읽기(정량 대시보드 아님) |

## 문항 (6개, 전부 필수·자유서술·각 최소 50자)

문항은 코드 상수(`lib/survey/questions.ts`). 어드민 문항 편집 기능은 만들지 않는다(YAGNI — 문항이 바뀌면 배포). 별콩이 톤(반말·따뜻함·단정 안 함), 호칭은 `users.nickname`.

> **인트로**: "{닉네임}아, 별콩이는 너 같은 친구들 이야기를 들으면서 자라. 한두 문장이면 충분하니까 편하게 적어줘. 다 적으면 별콩별 10개 🌟"

| # | 문항 | 커버 축 |
|---|---|---|
| Q1 | "요즘 어떤 마음으로 별콩이를 찾아왔어? 무슨 이야기가 제일 궁금했어?" | 방문동기 + 콘텐츠 니즈 |
| Q2 | "별콩이랑 얘기해보니 어땠어? 좋았던 것도, 아쉬웠던 것도 솔직하게." | 상담 품질·페르소나 |
| Q3 | "별콩이 상담이랑 사주·타로 리포트, 분량은 어땠어? 너무 짧거나 길진 않았어?" | 분량 |
| Q4 | "별콩톡에 뭐가 더 있으면 자주 놀러 올 것 같아?" | 재방문 니즈 |
| Q5 | "별(유료 재화) 충전은 어땠어? 안 했다면 뭐가 망설여졌는지 편하게." | 결제 장벽 |
| Q6 | "마지막으로 별콩이한테 하고 싶은 말, 뭐든 적어줘." | 자유 정성 |

**성의 게이트**: 6문항 모두 각 최소 50자여야 "보상받기" 활성화. **프론트 검증 + 서버 재검증**(보상 지급 전 서버가 다시 글자수 확인 — 클라 우회 방지).

## 데이터 흐름

```
[홈 캐러셀 "참여하기"] ─┐
                        ├─→ /survey (6문항 자유서술)
[결과화면 하단 카드] ───┘         │
   (미참여 시에만 노출)           │ 제출
                                  ▼
                          POST /api/survey
                            ├ getSession()으로 userId 확보(클라값 불신)
                            ├ 서버 재검증: 6답변 각 ≥50자
                            ├ survey_responses INSERT (partial UNIQUE user_id = 1인1회)
                            └ 성공 시 chargeStars(userId, SURVEY_REWARD_STARS, `survey:${userId}`, "survey_reward")

[/admin/survey] ←── survey_responses 최신순 원문 리스트 + 닉네임 매핑
```

## 신설 vs 재사용

### 신설 (5개 파일 + 상수)
1. `supabase/migrations/20260809000000_survey_responses.sql` — 테이블 + 권한 4줄(`ui_events` 패턴)
2. `app/api/survey/route.ts` — `GET`(참여여부) + `POST`(제출·검증·저장·보상). `/api/event` 패턴 복제
3. `app/survey/page.tsx` (+ `layout.tsx` noindex) — 클라 로그인 가드(`/login?next=/survey`)
4. `app/admin/survey/page.tsx` — `inquiries` 화면 복제, `LoadFailed` 방어
5. `components/survey/SurveyResultCard.tsx` — 결과화면 하단 카드
- `lib/survey/questions.ts` — 문항 배열 + `SURVEY_MIN_CHARS=50`
- `lib/constants.ts` — `SURVEY_REWARD_STARS=10` 추가

### 재사용 (그대로)
- **별 지급**: `chargeStars()` (`lib/stars.ts`) + `charge_stars` RPC. 멱등키 = 3번째 인자(`survey:${userId}`), 사유는 `source="survey_reward"`(자유문자열, CHECK/마이그레이션 변경 불필요). ⚠️ `star_transactions`에 `reason` 컬럼 없음 — `source`가 그 역할, `type`은 항상 `'charge'`.
- **세션**: `getSession()` (`lib/session.ts`, `await` 필수) — userId/anonId는 서버에서만 파생.
- **어드민 가드**: `proxy.ts` + `app/admin/layout.tsx` + `requireAdmin()`(`lib/admin-actions.ts`). `LoadFailed`(`components/admin/LoadFailed.tsx`).
- **캐러셀 계측**: `HeroCarousel.tsx`가 카드 클릭 시 `ui_events`에 `banner_clicked{slot:"survey"}`를 기록 → 클릭 잡힘. ⚠️ (2026-08-14 정정) 과거 서술의 `?b=survey`(page_views)는 **DB에 도달하지 못했다** — `page_views`는 쿼리스트링을 저장하지 않아 `?b=`가 URL에만 존재했다. `ui_events` 방식으로 교체됨.

## 저장 스키마

```sql
create table survey_responses (
  id          bigserial primary key,
  user_id     uuid references users(id) on delete set null,   -- 탈퇴 시 응답은 익명 보존
  anon_id     text,
  answers     jsonb not null,     -- [{ "q": "질문 텍스트 스냅샷", "a": "답변" }, ...]
  created_at  timestamptz not null default now()
);

-- 1인 1회 (user_id NULL = 탈퇴자 익명행은 중복 허용 → partial)
create unique index survey_responses_user_id_key
  on survey_responses(user_id) where user_id is not null;

-- 권한 (ui_events 패턴, 2026-07-29 이후 규율)
alter table survey_responses enable row level security;
revoke all on table survey_responses from public, anon, authenticated;
grant all on table survey_responses to service_role;
grant usage, select on sequence survey_responses_id_seq to service_role;
```

- `answers`는 `[{q, a}]` **배열로 질문 텍스트를 스냅샷 저장** → 나중에 문항을 고쳐도 과거 응답 해석이 안 깨진다.
- `user_id` FK는 `ON DELETE SET NULL`(AGENTS.md 규칙: `users(id)` 참조 FK는 CASCADE/SET NULL 명시 필수). 탈퇴해도 정성 응답은 익명으로 남긴다.
- **새 SECURITY DEFINER RPC 없음** — plain INSERT + 기존 `charge_stars` 재사용이므로 함수 REVOKE 3종 규칙은 해당 없음. 테이블 권한 4줄만 적용.

## 진입 상세

- **캐러셀**: `HeroCarousel.tsx`의 `survey` 카드 `href:"#"` → `href:"/survey"` 로 수정(1줄). 상시 노출, 게이트 없음(자발적).
- **결과화면 하단 카드**: `tarot/result`·`saju/result`·`fortune/result` 세 페이지의 기존 카드 스택에 `SurveyResultCard` 삽입. 노출 조건 = **미참여자만**(진입 시 `GET /api/survey`로 `participated` 확인해 참여자면 숨김). 리딩 완료가 전제라 별도 신규 게이트 불필요.
  - 카드 문구: **"별콩이가 너한테 궁금한 게 있어 🌟 / 이야기 들려주면 별 10개를 줄게"** → `/survey`
  - AGENTS.md의 "자동 이동은 유저 통제를 뺏는다" 기각 원칙과 일관 — 자동 모달이 아니라 결과를 다 본 유저가 스크롤하면 만나는 카드.
- **설문 페이지 `/survey`**: `app/` 최상위(그룹 없음, `/relationship`·`/shop` 관례). 클라 로그인 가드(`localStorage "byeolkong_user"` 없으면 `/login?next=/survey`). `AppShell`이 Header/BottomTab 자동 부착. `layout.tsx`는 `noindexMetadata`만.

## 어드민 화면 (`/admin/survey`)

- `inquiries` 페이지 복제: `dynamic="force-dynamic"` 서버 컴포넌트 → `getServiceSupabase()`로 `survey_responses` 최신순 조회(`const { data, error }` 에러 필수 수신) → 실패 시 `<LoadFailed>`.
- 각 응답: 닉네임(`users(id,nickname)` `.in()` 매핑) + 제출시각 + 6문항 Q/A 원문.
- 표시용 목록이므로 `.limit(50)` 등 명시 + 절단 경고 or 페이지네이션(AGENTS.md: `.limit(100000)` 금지).
- nav 2줄: `AdminNav.tsx` `GROUPS` + `AdminMobileNav.tsx`에 `{ href:"/admin/survey", label:"이탈 설문", emoji:"📝" }`.

## 어뷰징 방어 + 한계

- **1인 1회**: `survey_responses(user_id)` partial UNIQUE + `chargeStars` 멱등키(`survey:${userId}`) 이중.
- **성의**: 서버 재검증(6답변 각 ≥50자). 클라 우회 불가.
- **한계(명시)**: 탈퇴→재가입은 user_id가 바뀌어 완전 방어 안 됨(웰컴 보너스도 동일 한계). 잔존자 대상 + 얇은 표본이라 실질 위험 낮음.

## 관찰 포인트

- **10별 + 6문항 전부 필수(각 50자)는 응답률을 낮출 수 있다**(노동 대비 보상). 얇아도 질 높은 표본이 정성조사엔 유리하다는 판단이나, 실제 참여율을 보고 **보상↑ 또는 필수 완화**로 조정 가능하게 상수(`SURVEY_REWARD_STARS`·`SURVEY_MIN_CHARS`)로 뺀다.
- 응답 수/시각은 `created_at`으로 자연 관측. 캐러셀 클릭은 `ui_events`의 `banner_clicked{slot:"survey"}`로 잡히므로 별도 계측 이벤트는 추가 안 함. (2026-08-14 정정: 과거 `?b=survey`(page_views) 서술은 미도달이었다 — 위 캐러셀 계측 항목 참조.)

## 비채택 (기각 근거)

- **자동 모달 팝업** — 결과 보려는 유저를 가로막음. 유저 통제 원칙 위배. → 하단 카드로.
- **어드민 문항 편집 UI** — 문항이 자주 안 바뀜. YAGNI. → 코드 상수.
- **새 SECURITY DEFINER RPC** — plain INSERT + 기존 `charge_stars`로 충분.
- **정량 집계 대시보드** — 자유서술이라 자동 집계 불가·무의미. → 원문 읽기.
- **아웃바운드(알림톡·이메일)로 완전 이탈자 도달** — 동의·발송비·인프라. 스코프 밖(후속 별도 과제).
- **`type='bonus'` 트랜잭션** — 정의만 있고 지급 경로에서 안 씀. 기존 관례대로 `type='charge'` + `source`.
