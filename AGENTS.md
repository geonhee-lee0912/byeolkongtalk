# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# 별콩톡 (byeolkongtalk)

사주·타로·연애를 아우르는 멀티모달 운세 상담 서비스. 캐릭터 **별콩이** — 별의 수호자, 작은 신령/요정. 흐름과 가능성, 선택의 방향을 안내한다.

> ⚠️ **이 문서는 "지금 코드를 만질 때 필요한 것"만 담는다.** Phase 0~5 진행 로그·세션별 완료 기록·역사적 트러블슈팅은 `docs/AGENTS-archive-2026-07-27.md` 로 이관했다(2026-07-27 압축, 30,628자 → 이 파일. 모든 세션에 자동 로드돼 ~26k 토큰을 먹던 문제).
> **아카이브가 필요하면 Grep 으로 섹션만 — 전문 Read 금지.**
> 진행 중 작업·판정 스케줄은 이 문서가 아니라 메모리 `w1-w7-work-queue` 가 관리한다. **이 문서에 진행 로그를 append 하지 말 것** — 그게 30k 로 불어난 원인이다.

## 기술 스택

- Framework: **Next.js 16** (App Router, React 19, TypeScript strict)
- Styling: **Tailwind CSS v4** (`@theme` 토큰, CSS-only — `tailwind.config.ts` 없음)
- Fonts: Noto Sans KR(본문) + Cafe24Ssurround(`--font-display`, 타이틀)
- DB: Supabase (PostgreSQL) — Branching with Git sync
- Auth: 카카오 OAuth + 익명 식별자 + httpOnly 쿠키 세션
- Payment: 토스페이먼츠 (결제창 / API 개별 연동)
- AI: Claude API (`claude-sonnet-5`, SSE 스트리밍) + haiku(요약·민감 2차 판정)
- 사주 계산: `manseryeok`(결정적 계산) + Claude(해석만)
- Deploy: Vercel 단일 프로젝트 — Production=`main` / Preview=`dev`
- Domain: byeolkongtalk.com (prod, **non-www 정식**) / dev.byeolkongtalk.com

## 디렉토리 구조

```
app/
  (main)/ · (consultations)/{saju,tarot}/ · relationship/ · fortune/ · shop/ · mypage/ · readings/ · admin/
  api/
    consultations/{saju,tarot}/   # calc · chat(SSE)
    relationship/                 # route(관계 CRUD) · chat · pass · extend
    readings/ · fortune/ · payment{,s}/ · stars/ · auth/ · admin/ · og/ · pv/ · log/ · health/
lib/
  saju/ · tarot/ · relationship/ · claude/ · stars/ · auth*/ · payment/ · sensitive/ · logger/ · analytics/
  constants.ts · prompt-version.ts · admin-time.ts · emotions.ts · continuation.ts
components/
  consultations/ · relationship/ · admin/ · layout/ · safety/ · reco/ · common/
data/persona/          # 코어 + 도메인별 system prompt
supabase/migrations/   # <timestamp>_<name>.sql — GitHub 연동으로 자동 적용
docs/superpowers/{specs,plans}/
```

## 디자인 시스템

`app/globals.css` `@theme` 블록이 정본.

| 키 | HEX | 용도 |
|---|---|---|
| `cream` / `cream-warm` | `#FAF6F0` / `#FFF8F0` | 메인 배경 / 카드·패널 |
| `lilac-soft` / `lilac` / `lilac-mid` / `lilac-deep` | `#E8DEF5` / `#D4C7EE` / `#B8A8D8` / `#9F8AD0` | 보조배경·hover / 강조 / 보더 / 액티브 |
| `gold` / `gold-soft` | `#E8C26A` / `#F2D78A` | 포인트(별·CTA) / 글로우 |
| `eye-purple` / `text-light` | `#5A3E8C` / `#7A6BA0` | 본문 / 보조 텍스트 |
| `night` / `night-deep` | `#1F1735` / `#2A1F4D` | 다크 영역(사주판) |

- 그라데이션: 메인 배경 `cream`→`lilac-soft`(html) / 다크 영역 `night`→`night-deep` + 금색 별 파티클
- 애니메이션: `animate-float`(3s) · `animate-star-twinkle`(2.5s) · `animate-fade-in`(0.5s)
- 모티프: 4·8꼭지 별(액센트·로딩·구분선) · 구름/물결(섹션 배경) · 금테+태슬(유료 카드) · `rounded-2xl` 이상 기본
- 오행 색상은 별콩이 톤(전통 채도와 다름) — `components/saju/SajuBoard` 의 `ELEMENT_COLORS`. 일관 유지

## 별콩이 페르소나

**구조**: `data/persona/byeolkong_core.md` 가 화법·위기 안전망·금지표현의 **단일 원천**이고, `byeolkong_{saju,tarot,fortune,relationship,relationship_draw,verdict_inthread}.md` 가 도메인별로 얹힌다.
⚠️ **코어 편집 = 전 종목 전역 변경** → 광범위 회귀 QA 필수. 위기 안전망·금지표현을 도메인 파일로 복사하지 말 것(드리프트 사고 방지).

- 정체성: 따뜻함 + 차분함 + 신비로움 + 약간의 장난기. 판단하지 않고 단정 짓지 않는다
- 화법: ①**단정적 예언 금지**("~할 가능성이 있어", "이런 흐름이 보여") ②흐름·가능성·선택 3키워드 ③불안 자극·운명론적 협박 금지 ④장난기는 한 턴에 한 번 ⑤따뜻한 마무리 ⑥위기 시 페르소나 내려놓고 hotline 우선
- 1인칭 `별콩이는`/`나는`, 2인칭 `너`(반말). 호칭은 `users.nickname`
- 화법 v3 = 답 먼저 · 소신형("내가 보기엔") · 부정은 완곡+출구 · 관찰형 훅 · **매턴 질문 금지**(2연속 질문 마무리 금지). `computeTurnSignals` 가 직전 턴 신호로 동적 경고 주입
- 프롬프트는 정적 블록을 `cache_control: ephemeral` + `ttl:"1h"` 로 마킹(입력비 ~35%↓). turn-specific 데이터는 user 메시지에 동적 주입
- ⚠️ **심문 피로 판정은 LLM judge 를 믿지 말 것** — Sonnet judge 가 "질문=심문" 프라이어로 과대평가한다. 신뢰할 신호는 객관 단언 `no_consecutive_question_close`
- ⚠️ **페르소나 규칙을 조이면 반대편 과잉으로 튄다**(회피구↔확언). 케이스당 n=1 이라 조정은 1회로 끊고 실데이터로 판단

## 현재 사용자 흐름

- `/` 홈 → 연애 존 6태그(`LOVE_TAGS`) + 궁합 크로스링크 + 비연애 4태그(`OTHER_TAGS`)
- 태그 → 로그인 가드 → `/concern`(감정 칩 + 고민 10~200자) → **타로 직행**(사주/타로 picker 없음)
- `/tarot`(태그별 큐레이션 5, `TAG_SPREADS`) → `/tarot/draw` → `/tarot/reading`(SSE → `[END]` → 결과/공유)
- **사주는 상담 진입 폐쇄** — `/select` 는 `/concern` 리다이렉트 스텁(구 링크 하위호환). `/saju*` 는 기존 reading 열람·resume 전용. 새 사주 수요는 `/fortune` **one-shot 리포트**가 받는다
- `/relationship` "연애 상담" — 지속 대화형 스레드(종결 없음). 미등록=콜드스타트+상대등록 / 등록=스레드
- 이어가기: 완료 reading 참조 새 reading(`/api/readings/continue`, `previous_reading_id`+`continuation_mode`). deep = 정가×0.6. UI 는 `ContinuationModal`(타로만 fresh 버튼 있음, 사주는 deep 단일)
- 레이아웃 (`components/layout/`): `AppShell` 이 pathname 기반(`/login` 제외) `Header`+`BottomTab` 자동 부착(`pb-20`). **BottomTab 5탭** = 고민톡`/` · 별콩 운세`/fortune` · 연애 상담`/relationship` · 별콩 상점`/shop` · 내 정보`/mypage`. 보관함`/readings` 는 내 정보에서 진입(`?from=history` 시 내 정보 탭 하이라이트). `Footer` 는 홈에서만

## 현행 prod 상태 (기준 2026-07-27)

- **재화 정본 — 가격은 코드 상수가 정본이다. 문서 숫자와 어긋나면 코드를 믿을 것.**
  웰컴 20별(`WELCOME_BONUS_STARS`) · 첫충전 +20%(`FIRST_CHARGE_BONUS_RATE`) · 연애 패스 30/60/100(`PASS_PLANS`) + 무료 인트로 3턴(`FREE_INTRO_TURNS`) · 소프트캡 20턴/일 + 5별=+5턴(무제한) · 사주 20(`SAJU_READING_COST`)
- **우리 사이 스킬 4종 = 스레드 내부 실행** (`lib/relationship/skills.ts` `RELATIONSHIP_SKILLS`) — 관계체크인 45 / 걔속마음 40 / 우리궁합 40 / 싸움판정 30. 별도 라우트·화면 없음(`lib/relationship/{draw,compat}-thread.ts` + `ThreadDrawModal`/`ThreadCompatCard`/`ThreadCardStrip`). 칩 UI 는 입력창 ⚡ `SkillSheet`. 스킬은 활성 패스 필요
- **관계 기억** = 최근 24메시지 원문 + 초과분 haiku 델타 요약(`rolling_summary`/`summarized_msg_count` 커서, `lib/relationship/memory.ts`). 최근창은 항상 user 발화로 시작(Anthropic 규칙)
- **민감 감지**: 회색지대는 **스트림 시작 전 haiku 2차 판정을 await**(~1초, 3초 타임아웃 시 regex 폴백). regex high 는 즉시 확정. 패턴은 `lib/sensitive.ts` PATTERNS, hotline 은 `components/safety/SafetyBanner.tsx` `HOTLINES`. `has_sensitive=true` 면 공유 차단 + OG 라우트 403
- **위기 대화는 서버측 강제 종료 없음** — `has_sensitive` 면 abs-cap `[END]` 억제(안전 > 비용). rate-limit 20/분은 유지
- **타로 프리미엄(5장+)**: 첫 풀이 3라벨 골격(🃏💫🔗) + 카드당 6~7문장 + `[CARD:n]` 마커 선행 강제. 수렴 임계치는 카드 수 기준(`WRAP_THRESHOLDS`)
- **next_reco 중단** — haiku 태깅 off + 결과 화면 추천 카드 제거. **인챗 칩(clarifier·extend·이어가기)과 `components/reco/RecoInlineCard` 는 생존**
- **계측**: `page_views` + `/api/pv` + `/admin/traffic` · 탈퇴 시 utm 스냅샷 보존 · `PROMPT_VERSION`(`lib/prompt-version.ts`) 코호트
- ⚠️ **`[END]` → 결과는 자동 이동이 아니라 수동 [결과 보기 →] 버튼**(`tarot/reading:1019`·`saju/reading:641`). 이 한 탭이 "종료했으나 미열람"의 원인이고 `result_viewed_at` 은 **"버튼을 눌렀나"**를 잰다. 픽스 예정 — `specs/2026-07-26-unviewed-results-findings.md`
- ⚠️ **측정 창 규율** — 수익성 판정 사이클 진행 중(day 0 = 2026-07-26). **퍼널에 닿는 변경은 지정된 배포 슬롯에서만.** 상세는 메모리 `w1-w7-work-queue`

## 코딩 규칙

- Server Components 기본, Client Components 는 인터랙션 필요 시만. 함수형 + hooks
- Tailwind v4 기본(`@theme` 토큰 확장). 복잡 애니메이션만 `globals.css`
- Next 16 의 `cookies()` 는 async → **`await getSession()` 필수**
- **별 잔액은 트랜잭션 필수** — 항상 `lib/stars` 래퍼 경유. `spend_stars`/`charge_stars` RPC 직접 호출 금지(service_role 만 EXECUTE). `charge_stars` 는 같은 `payment_id` 재호출 시 멱등, `spend_stars` 는 `SELECT FOR UPDATE` 로 동시 차감 직렬화
- 🔴 **새 `SECURITY DEFINER` RPC 는 `REVOKE … FROM PUBLIC, anon, authenticated` 를 반드시 셋 다 쓴다.** 2026-07-29 부터 **기본 권한이 닫혀 있어**(아래) 새 함수·테이블은 닫힌 채 태어나지만, 명시 REVOKE 는 그대로 유지한다 — 기본값은 언제든 플랫폼 쪽에서 되돌아갈 수 있고 이중 방어가 싸다
  - **검증은 함수별 정확한 인자로** — PostgREST 는 인자 모양이 안 맞아도 404 를 주므로 "404 니까 막혔다"가 오판이 된다. 회수가 먹었으면 **401**. 한 줄 감사(둘 다 0행이어야 함):
    `select proname, proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proacl is null or p.proacl::text ~ '(^\{|,)=X/' or p.proacl::text like '%anon=X%')`
- 🔴 **DB 권한 기본값 (2026-07-29 정리) — 바꿀 일이 생기면 이 함정 2개를 먼저 읽을 것**
  - **직접 grant vs PUBLIC 은 별개다.** Supabase 의 `ALTER DEFAULT PRIVILEGES` 가 신규 객체에 `anon`·`authenticated` **직접 grant** 를 붙인다. `REVOKE … FROM PUBLIC` 만으로는 그게 안 지워진다. (이게 별·결제 RPC 3개가 열려 있던 원인 — `20260729010000`)
  - **per-schema 기본권한은 전역 설정에 *추가*만 가능하고 제거는 못 한다.** `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` 은 **Postgres 문서가 직접 "no effect" 예시로 드는 명령**이다. 함수의 PUBLIC EXECUTE 는 전역 기본값이라 `IN SCHEMA` 를 빼야 빠진다(`20260729040000`). 테이블은 내장 PUBLIC 기본값이 없어 per-schema 회수로 충분하다
  - 현재 상태: 전역 `f {postgres, service_role}` · public `TBL/FN {postgres, service_role}`. 즉 **새 테이블은 `ENABLE RLS` 를 깜빡해도 anon 이 못 만진다**
  - ⚠️ **카탈로그만 보고 판정하지 말 것.** 두 번 다 설정은 바뀐 것처럼 보였고 실제로는 안 먹었다. **카나리아**(RLS 안 켠 임시 테이블 + 임시 함수)를 만들어 **anon 키로 실제 HTTP 호출**해 401 을 확인하고 지울 것 — `20260729020000`~`050000` 이 그 절차다
- 사주 계산은 `lib/saju/calc.ts` 의 `calcSaju(input)` 만. manseryeok 직접 호출 금지(wrapper 가 정규화+JSONB 직렬화 책임). 시간 모름 = `hour: null` → 자정 계산 + `hourKnown:false` 마킹
- chat 라우트는 **서버가 권위** — 소유권 검증 + `messages` 테이블에서 누적 turn/chars 직접 계산. 클라가 보낸 history 는 Claude 입력용으로만
- 단정적 예언 톤 금지(페르소나 화법 원칙)
- **`users(id)` 참조 FK 는 반드시 `ON DELETE CASCADE` 또는 `SET NULL` 명시** — 없으면(NO ACTION) 회원 탈퇴 users DELETE 가 23503 으로 차단됨 (2026-07-17 `ad_spend.created_by` 사례: unlink 만 성공한 반쪽 탈퇴 → 재시도마다 -101 info 루프)
- **페이지 metadata 의 `openGraph`/`twitter` 는 필드별 병합이 아니라 객체 통째 교체** — 페이지에서 `openGraph:{title}` 만 주면 루트 `app/layout.tsx` 의 `siteName`·`locale`·`type` 과 `app/opengraph-image.tsx` 가 붙이던 `og:image` 4종이 **조용히 사라진다**(`twitter:image` 까지). 콘텐츠 존은 `lib/seo/metadata.ts` 의 `contentMetadata()` 경유 — 공용 필드 재선언은 의도된 것이니 "중복"으로 지우지 말 것(계약 테스트가 막는다)
- **신규 `consultation_type` 값 추가 시 컬럼 폭 확인** — `'relationship'`(12자)이 `VARCHAR(10)` 을 넘어 등록이 22001 로 죽은 사례. CHECK 에 값만 넣고 폭을 안 늘리면 조용히 실패한다
- **어드민 집계는 원본 행을 앱으로 끌어오지 않는다** — `.limit(100000)` 은 아무것도 보장하지 않는다(Supabase `Max rows` 가 서버측 강제 상한). 새 어드민 화면·집계는 SQL 집계 RPC 또는 `count: "exact"` 로. 기존 38곳 전환 스펙 = `docs/superpowers/specs/2026-07-28-admin-aggregation-rpc-migration.md`

## dev/prod 분리

- `main`→Production→byeolkongtalk.com / `dev`→Preview→dev.byeolkongtalk.com (단일 Vercel 프로젝트, 환경 스코프 분리)
- Supabase(Branching+Git sync) · 카카오 OAuth 앱 · 토스 키 · `AUTH_TOKEN_SECRET` 전부 dev/prod 분리
- **로컬 `.env.local` 은 dev 리소스를 가리킨다** — prod 리소스로 로컬 돌리기 금지
- 마이그레이션: `supabase/migrations/<timestamp>_<name>.sql`. `dev` push → Supabase dev 자동 적용 / `main` 머지 → Supabase main 자동 적용. **수동 양쪽 적용 불필요.** push 후 main Workflow logs SUCCESS 확인 습관
- 필수 env: `CLAUDE_API_KEY` · 카카오 5종 · 토스 2종 · Supabase 3종 · `NEXT_PUBLIC_BASE_URL` · `AUTH_TOKEN_SECRET`. 선택: `NEXT_PUBLIC_GA_ID`·`ADMIN_USER_IDS`. **Vercel env 등록 직후 `/api/health` 로 검증**(저장만으로 반영 안 됨 — redeploy 필요)

## 운영 함정 (실사고 기록)

- **어드민 가드**: 페이지 자체 가드는 `relationship-readings` 하나뿐 — **나머지 14화면은 `middleware.ts` 가 유일한 문**(데이터는 `/api/admin/*` 개별 `requireAdmin` 으로 이중 보호). middleware 를 건드릴 때 이 사실을 기억할 것
- **날짜 기준 = 전부 KST 자정** (2026-07-31 통일, `20260731000000`). 이전엔 `/admin`·`/admin/traffic` 만 오전 10시 롤오버라 같은 "오늘"이 화면마다 다른 날을 뜻했다 — 실측 왜곡이 컸다(07-25 UV 10시 63 vs 자정 27 = 2.3배). 버킷의 단일 원천은 `lib/admin-time.ts` 의 `kstDate`(3함수만 존재, 계약은 `lib/admin-time.test.ts` 가 지킴) / SQL 은 `(created_at at time zone 'UTC' + interval '9 hours')::date` — **`at time zone 'UTC'` 를 빼면 캐스트가 세션 TimeZone 에 좌우된다**
  - ⚠️ **한 화면에 UV 정의가 2개다**(의도된 것): `/admin/traffic` 의 일별 추세 UV = **페이지뷰 귀속**(PV 와 짝) / 방문자 구성 UV = **세션 시작 귀속**(30분 갭, `SESSION_GAP`). 실측 차이 하루 최대 1명. 같은 값으로 기대하지 말 것
  - ⚠️ 과거 판독 문서(`specs/2026-07-29-admin-expected-values.md`·`specs/2026-07-30-d4-snapshot-findings.md`)의 **일별 표는 10시 기준**이라 재실행하면 다른 숫자가 나온다. 🔴 재방문율은 퍼센트가 아니라 **실인원**으로 읽을 것(분자가 1~3명)
- **`page_views` 어드민 제외 필터**: 비로그인 행은 `user_id` 가 NULL 이라 `.not("user_id","in",…)` 만 쓰면 **비로그인 PV 가 전부 사라진다**(SQL 3값 논리). `.or("user_id.is.null,user_id.not.in.…")` 로 감쌀 것
- **Supabase `Max rows` 가 `.limit()` 을 덮어쓴다**(기본 1000): PostgREST 는 200 + `Content-Range: 0-999/*` 로 응답하고 supabase-js 는 이를 `error` 로 승격하지 않아 **조용히 잘린다**(`ORDER BY` 도 없으면 어느 1000행인지 미정의). 2026-07-28 사례 — `/admin/traffic` UV 53% 유실 · `/admin/paywall` 상담 완료율을 21% 로 표시(실제 63.7%). **cap 은 PostgREST 레이어만** 걸리므로 SQL Editor·`scripts/run-prod-query.mjs` 는 무관 = 판정 문서는 무사했다. 어드민 숫자가 의심되면 raw SQL 로 대조할 것
- **카카오 공유**: prod 는 정상(Web 도메인 등록됨). **dev 에서만 미리보기가 빈다** — Vercel Deployment Protection(SSO) 탓에 외부 스크래퍼가 OG 이미지를 못 받는 것이지 코드 결함 아님. 진단 주의 2가지: ①로그인은 `lib/kakao.ts` 가 서버 리다이렉트라 JS SDK 무관 = **로그인 정상 ≠ 공유 정상** ②`lib/kakao-share.ts` 는 실패 시 `console.warn` + 텍스트 폴백이라 **`error_logs` 에 안 남는다**
- **토스 결제 에러 3분류**: 고객 거절(warn) / 상점 차단(503+error) / race(멱등 성공). 새 코드 추가 시 이 분류를 따를 것. `payments` 는 승인 성공만 INSERT 라 **결제 마찰은 `error_logs` 로만 보인다**
- **OAuth**: state 32hex nonce 를 `byeolkong_oauth_state` 쿠키에 5분 TTL → 콜백에서 일치 검증 + 1회용 삭제 + open redirect 방지. 쿠키/storage prefix 는 전부 `byeolkong_`. ADMIN_USER_IDS 매칭 시 `byeolkong_admin_token`(HMAC) 동시 발급
- **회원 탈퇴**: 카카오 unlink 실패 시 503 + DB 삭제 중단(좀비 OAuth 방지). `users` CASCADE 체인이 profiles→readings→messages / relationships / passes 를 자동 정리. `star_transactions.reading_id` 만 SET NULL(audit 유지)
- **KOE006/KOE101 트라이아지**: 카카오 콘솔에서 ①Redirect URI 등록 ②Web 도메인 등록(**①과 별개 화면**) ③Client Secret 활성화 ④Vercel env 추가 후 **redeploy**
- **`/admin/errors` 의 "설계된 정상 신호"** 가 있다 — 중복차단 warn·카카오 -101 info 등. 전부 버그로 보지 말 것
- **prod 쓰기 작업은 항상 사용자 손** — `scripts/run-prod-query.mjs` 는 `read_only:true` 고정
- **QA**: 별콩이 검증은 QA 하네스로 자체 수행(`.env.local` 로 충분). ⚠️**페르소나 수정 후 dev 서버 재시작 필수**(모듈 캐시)

## 보류된 부채

- **`middleware.ts` → `proxy.ts` rename** (Next 16 deprecation). 코드모드 `npx @next/codemod@canary middleware-to-proxy .` = 파일명+함수명만. ⚠️ **실패가 조용하다** — 인식 안 되면 크래시 없이 anon 쿠키 미발급(계측 오염) + `/admin` 페이지 가드 소실. deprecated 지 제거 아니라 마감 없음. 검증 3종: 새 시크릿 창 anon 쿠키 발급 / 토큰 없이 `/admin` → 리다이렉트 / 두 파일 공존 없음

## 관련

- 아카이브: `docs/AGENTS-archive-2026-07-27.md`(Phase 로그·세션 기록·역사적 트러블슈팅) · `docs/superpowers/2026-07-27-work-queue-archive.md`(W1~W7 실행 로그)
- 설계·플랜 원장: `docs/superpowers/{specs,plans}/`
- v1 (sunset 예정, 인프라 패턴 참고용): https://github.com/geonhee-lee0912/tarot-friend
