<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 별콩톡 (byeolkongtalk)

사주를 시작으로 다양한 운세 상담을 제공하는 멀티모달 상담 서비스.
캐릭터 **별콩이** — 별의 수호자, 작은 신령/요정. 사용자의 고민을 듣고 흐름과 가능성, 선택의 방향을 안내.

> v1 `tarot-friend` (oneulcard.com)에서 컨셉·캐릭터·도메인 전면 교체된 v2.

## 기술 스택

- Framework: **Next.js 16** (App Router, React 19, TypeScript)
- Styling: **Tailwind CSS v4** (`@theme` 토큰, CSS-only 설정 — `tailwind.config.ts` 없음)
- Fonts: Noto Sans KR (본문) + 온글잎 비비체 (디스플레이, `public/fonts/Bibi.ttf` 추가 시 활성)
- DB: Supabase (PostgreSQL) — dev/prod 별도 프로젝트
- Auth: 카카오 로그인 (OAuth) + 익명 → 카카오 마이그레이션 + httpOnly 쿠키 세션
- Payment: 토스페이먼츠 결제위젯 v2
- AI: Claude API (`claude-sonnet-5`, SSE 스트리밍)
- 사주 계산: `manseryeok` (라이브러리, 결정적 계산) + Claude (해석만)
- Deploy: Vercel (단일 프로젝트, Production=main / Preview=dev 환경 분리)
- Domain: byeolkongtalk.com (prod) / dev.byeolkongtalk.com (dev)

## 디렉토리 구조 (Phase 진행에 따라 채워짐)

```
app/
  (main)/                       # 랜딩, 공통 페이지
  (consultations)/
    saju/                       # 사주 상담 (Phase 5)
    # 추후: tarot/, mbti/, ...
  admin/                        # 어드민 콘솔 (Phase 4)
  api/
    consultations/saju/         # 사주 API
    auth/, payment/, payments/, stars/, admin/, log/, health/   # 공통 인프라
    #   payment/ready · payment/confirm — 토스페이먼츠 결제 준비/승인
    #   payments/list — 결제 내역
  shop/                         # 별 충전소 (토스 결제위젯)
lib/
  consultations/saju/           # manseryeok wrapper, 페르소나
  toss.ts                       # 토스페이먼츠 서버 유틸 (confirm/cancel/getPayment)
  constants.ts                  # STAR_PACKAGES 등 공용 상수
  auth/, payment/, stars/, sensitive/, logger/      # 공통
components/
  consultations/saju/
  common/
data/
  persona/                      # 별콩이 system prompt
supabase/
  migrations/                   # SQL 마이그레이션 — Supabase GitHub 연동으로 양쪽 브랜치에 자동 적용
public/
  byeolkong-main.png            # 캐릭터 메인 이미지 (확보 완료)
  fonts/                        # Bibi.ttf 등 (추후)
```

## 디자인 시스템

### 컬러 팔레트 (`app/globals.css` `@theme` 블록)

| Tailwind 키 | HEX | 용도 |
|---|---|---|
| `cream` | `#FAF6F0` | 메인 배경 (캐릭터 몸 톤) |
| `cream-warm` | `#FFF8F0` | 카드/패널 배경 |
| `lilac-soft` | `#E8DEF5` | 보조 배경, hover |
| `lilac` | `#D4C7EE` | 메인 강조 (구름 무늬 톤) |
| `lilac-mid` | `#B8A8D8` | 보더, divider |
| `lilac-deep` | `#9F8AD0` | 강조 텍스트, 액티브 |
| `gold` | `#E8C26A` | 포인트 (별/펜던트/CTA) |
| `gold-soft` | `#F2D78A` | 별 글로우 |
| `eye-purple` | `#5A3E8C` | 본문 텍스트 (눈동자 톤) |
| `text-light` | `#7A6BA0` | 보조 텍스트 |
| `night` | `#1F1735` | 다크 영역 (사주판) |
| `night-deep` | `#2A1F4D` | 다크 그라데이션 종점 |

### 그라데이션
- **메인 배경**: `cream` → `lilac-soft` (위→아래, 새벽/별빛 톤) — `html` 요소에 적용
- **사주판/다크 영역**: `night` → `night-deep` + 금색 별 파티클

### 폰트
- 본문 (`font-sans`): `Noto Sans KR` 300~700
- 디스플레이 (`font-display`): `온글잎 비비체` (placeholder, `public/fonts/Bibi.ttf` 추가 후 활성)
- 사주 한자판 (예정): `Noto Serif KR`

### 애니메이션
- `animate-float` — 캐릭터 떠다니기 (3s)
- `animate-star-twinkle` — 별 깜빡임 (2.5s)
- `animate-fade-in` — 페이지 진입 (0.5s)

### 모티프
- 4꼭지/8꼭지 별 (이마/후광/펜던트에서 추출) — 액센트·로딩·구분선
- 구름/물결 무늬 (몸/꼬리) — 섹션 배경 패턴
- 금색 테두리 + 태슬 — 프리미엄 카드 (유료 결과)
- 둥근 모서리 (`rounded-2xl` 이상 기본) — 캐릭터 푹신함 반영

## 별콩이 페르소나

### 정체성
- 별의 수호자, 작은 신령/요정
- 따뜻함 + 차분함 + 신비로움 + 친절함 + 약간의 장난기
- 판단하지 않음, 단정 짓지 않음

### 화법 원칙 (system_prompt 핵심)
1. **단정적 예언 금지** — "~한다", "~될 것이다" X → "~할 가능성이 있어", "이런 흐름이 보여" O
2. **흐름·가능성·선택** 3 키워드 중심
3. **불안 자극 금지** — 운명론적 협박 표현 절대 금지
4. **장난기는 짧게** — 한 턴에 한 번, 전체 톤은 차분
5. **따뜻한 마무리** — "별콩이가 응원할게" 류 응원 한마디
6. **위기 시그널 시** — 페르소나 내려놓고 hotline 우선

### 1·2인칭
- 1인칭: `별콩이는` / `나는`
- 2인칭: `너` (반말, 친근)

### 사주 출력 구조
```
별콩이가 사주를 펼쳐볼게... ✨
[사주판 4기둥 시각화]
→ 일간 풀이 ("너의 본질은 ~한 흐름이야")
→ 대운 흐름
→ 세운 (올해)
→ 사용자 질문 답변
→ 마무리 응원
```

## dev/prod 분리 정책

- **단일 Vercel 프로젝트** + 환경 스코프 분리:
  - `main` 브랜치 → Production → `byeolkongtalk.com`
  - `dev` 브랜치 → Preview → `dev.byeolkongtalk.com`
- **Supabase**: dev/prod 별도 프로젝트
- **카카오 OAuth**: dev/prod 별도 앱
- **토스페이먼츠**: dev=테스트 키, prod=라이브 키
- **AUTH_TOKEN_SECRET**: dev/prod 다른 시크릿 (32자 hex)
- **로컬 개발**: `.env.local`은 **dev Supabase/카카오/토스** 가리킴 (prod 리소스로 로컬 돌리기 금지)

### 마이그레이션 동기화 규칙

- 새 마이그레이션은 **`supabase/migrations/<timestamp>_<name>.sql`** 컨벤션 (Supabase CLI 표준)
- Supabase의 GitHub 연동이 활성화되어 있어, `dev` 브랜치 push → Supabase `dev` 브랜치에 자동 적용 / `main` 머지 → Supabase `main` 브랜치에 자동 적용
- 즉 코드(GitHub) 흐름이 DB(Supabase) 흐름과 자동 동기화됨 — 수동 양쪽 적용 불필요

## 환경변수 (필수)

`.env.local.template` 참고. 핵심:
- `CLAUDE_API_KEY`
- 카카오: `KAKAO_CLIENT_ID`/`_SECRET`/`_REDIRECT_URI`/`_JS_KEY`/`_ADMIN_KEY`
- 토스: `NEXT_PUBLIC_TOSS_CLIENT_KEY`/`TOSS_SECRET_KEY`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
- App: `NEXT_PUBLIC_BASE_URL`
- 보안: `AUTH_TOKEN_SECRET`
- 선택: `NEXT_PUBLIC_GA_ID`, `ADMIN_USER_IDS`

## 배포

- prod 도메인: https://byeolkongtalk.com
- dev 도메인: https://dev.byeolkongtalk.com
- GitHub: https://github.com/geonhee-lee0912/byeolkongtalk
- 카카오 redirect URI: dev/prod 각각 등록 필수

## 코딩 규칙

- TypeScript strict, 함수형 컴포넌트 + hooks
- Tailwind v4 기본 (`@theme`로 토큰 확장). 복잡 애니메이션만 `globals.css`
- 별 잔액: 트랜잭션 필수 (`SELECT FOR UPDATE` → 차감 → INSERT → COMMIT)
- 단정적 예언 톤 금지 (페르소나 화법 원칙 따름)
- Server Components 기본, Client Components는 인터랙션 필요한 경우만
- Cache Components (Next.js 16) — Phase 5+에서 활용 검토

## 진행 상황 (Phase)

- [x] **Phase 0** — 도메인 구매 (byeolkongtalk.com via Cloudflare Registrar)
- [x] **Phase 1** — 레포 부트스트랩 (Next 16 + Tailwind 4 + 디자인 시스템 + 랜딩 페이지)
- [x] **Phase 2** — dev/prod 인프라 셋업 (Supabase Branching + Git sync, 카카오 dev/prod 앱, Vercel 프로젝트 + 도메인 매핑, env 22개)
- [x] **Phase 3** — 외부 서비스 추가 — 토스페이먼츠 결제 채택 (v1 패턴 이식: `lib/toss` + `/api/payment/ready`·`/confirm` + `/api/payments/list` + `payments` 마이그레이션 + `/shop` 충전소). GA4 는 선택(미적용)
- [ ] **Phase 4** — 검증된 인프라 이식
  - [x] (a) logger + /api/health + boundary 페이지 — `error_logs` 마이그레이션, `lib/supabase`/`lib/env`/`lib/logger`, `/api/health`, `/api/log/error`, `app/error.tsx` + `app/global-error.tsx` + `app/not-found.tsx`. dev/prod 양쪽 `/api/health` 200 OK
  - [x] (b) auth — 카카오 OAuth + 익명 식별자 + 쿠키 세션 + `/api/auth/*`. `users` 마이그레이션 + error_logs FK ALTER, `lib/session` (Next 16 `await cookies()`) + `lib/auth-token` HMAC + `lib/kakao` + `lib/admin`, `middleware.ts` (anon + admin guard), `AuthBootstrap` + `KakaoSdkLoader`, `app/login`
  - [x] (c) stars — `star_balances` + `star_transactions` + `spend_stars`/`charge_stars` RPC (SELECT FOR UPDATE + 멱등성), `lib/stars`, `/api/stars/balance` + `/api/stars/spend`. `/api/auth/kakao` 신규 유저 잔액 INSERT + `/api/auth/withdraw` stars 삭제 단계도 보강. `chargeStars` 호출처(결제 confirm)는 Phase 3 토스 결제로 연결 완료. `star_transactions.reading_id` FK + spend 의 reading 소유권 검증은 Phase 5 readings 추가 후
  - [ ] (d) admin — 어드민 콘솔 + HMAC 쿠키 + admin_actions + bulk API
  - [x] (e) sensitive — Phase 5 (e1) 과 통합 완료 (위 Phase 5 e1 항목 참고)
- [ ] **Phase 5** — 사주 도메인 신규 설계
  - [x] (a) 코어 — manseryeok@1.0.1 + `lib/saju/calc` wrapper + 마이그레이션 (user_profiles 1:N + readings + messages + star_transactions.reading_id FK ALTER) + `data/persona/byeolkong.md` 시스템 프롬프트
  - [x] (b) 입력 폼 + 사주판 + `/api/consultations/saju/calc` — 분리 셀렉트 + 12지지 시간 + 양/음력 + 윤달 + 시간모름. 4기둥 그리드 + 오행 막대 + 일주 ★. 랜딩에 CTA. **검증**: dev/prod 양쪽 브라우저에서 본인 사주 정확도 spot check + 음력 변환 + 시간모름 분기 모두 통과
  - [x] (c) Claude 풀이 채팅 — `SAJU_READING_COST=22` 단일 가격. `lib/claude` (페르소나 caching + 사주 컨텍스트 + 수렴 가이드 동적 주입) + `/api/readings` POST (profile+reading+spendStars 원자) + `/api/consultations/saju/chat` SSE 스트림 + `/saju/concern` 고민 입력 + `/saju/reading` 채팅 UI + ChatBubble + SajuBoardCompact. [END] 마커 자동 종료. **검증**: dev + prod 양쪽 카카오 로그인 → 사주 입력 → 22별 차감 → 별콩이 자동 풀이 SSE 통과
  - [x] (e1 / Phase 4 e) 위기 시그널 안전망 — `sensitive_alerts` (5 카테고리 + severity 1-3) + `lib/sensitive` (regex 1차 + Claude haiku 2차) + `/api/consultations/saju/chat` 통합 (응답 헤더 + DB INSERT + readings.has_sensitive) + `SafetyBanner` (카테고리별 hotline + 익명·무료 강조 + 별콩이 톤 안내). **검증**: dev "죽고 싶어" 키워드로 SafetyBanner 노출 + sensitive_alerts row 생성 확인
  - [x] (e2) 결과 / 공유 / 마이페이지 — `lib/saju/closing` 마무리 한마디 추출 + `/api/readings/[id]` 단건 + `/api/readings` 리스트 + `/saju/result` (사주판 + 한마디 카드 + 대화 다시보기 + 공유) + `ShareButtons` (Web Share + 클립보드 + has_sensitive 차단) + `/api/og/saju/[readingId]` next/og 1200×630 + `lib/kakao-share` SDK feed + `/mypage` (프로필 + 잔액 + 히스토리 + 로그아웃/탈퇴) + 랜딩 MY 진입점. reading [END] → result 자동 이동
- [ ] **Phase 6** — v1 종료 + v2 prod 런칭 (DNS 전환, v1 archive)

### MVP 골든 패스 완성 후 다음 단계 — 화면 단위 UX 정제 + 타로 도입

Phase 5 (e2) 까지 끝나서 **카카오 로그인 → 사주 입력 → 사주판 → 22별 차감 → 별콩이 SSE 풀이 → [END] → 결과/공유 → 마이페이지 히스토리** 가 dev/prod 양쪽 end-to-end 동작.

**컨셉 피벗 (2026-05-25)**: v2 = 사주 단일 → **사주 + 타로 듀얼**. 진입 흐름도 v1 스타일로 회귀.

**현재 사용자 흐름** (dev 반영 완료):
- `/` 홈 → v1 톤 감정 태그 그리드 (6개, 인기 2 / 다른 4. "오늘의 카드" 제외)
- 감정 클릭 → 로그인 가드 → `sessionStorage.byeolkong:emotion` 저장 후 `/concern`
- `/concern` (신규) → 감정 컨텍스트 + 고민 textarea (10~200자) + **사주/타로 동등 picker**
- 선택 후 `byeolkong:pending_consultation = {emotion, concern, type}` 저장 후 분기
  - `saju` → `/saju` (생일 입력 → 사주판 → "풀이 듣기" 클릭 시 pending 있으면 `/saju/concern` 건너뛰고 바로 `/api/readings` → `/saju/reading` 직행)
  - `tarot` → `/tarot` (placeholder "곧 만나" — 다음 단계에 본격 포팅)
- 사주 흐름은 기존과 동일 (SSE → [END] → 결과/공유/마이페이지)
- legacy: `/concern` 없이 `/saju` 직접 진입해도 기존 `/saju/concern` 흐름 작동 (폴백)

**Header / BottomTab / Footer** ([components/layout/](components/layout)):
- `Header` — 로고 별콩톡(Cafe24) + ⭐ 잔액 칩 (→/shop) + MY 아바타 칩 (→/mypage). `/login` 만 제외 모든 라우트에 sticky top
- `BottomTab` 4탭 — 고민 상담(/) / 내 고민톡(/readings) / 별콩 상점(/shop) / 내 정보(/mypage). iOS safe-area, active = lilac-deep
- `AppShell` — pathname 기반 (/login 제외) Header + BottomTab 자동 부착. `pb-20` 으로 탭 가림 방지
- `Footer` — v1 베이스, 홈에서만 마운트. 사업자 정보 + 약관/개인정보/환불 링크 v1 그대로 (해당 페이지는 v2 에 없음 → 404, 출시 전 포팅 필요)

**폰트**: `public/fonts/Cafe24Ssurround.otf` → `next/font/local` → `--font-display` (타이틀/디스플레이). 본문은 Noto Sans KR 유지.

**다음 사이클 후보** (사용자가 캡처/지적해주거나 다음 진행 결정):

1. **타로 본격 도입** (가장 큰 부채)
   - v1 `data/tarot_card_data.json` 78장 + `public/cards/`, `public/cards-webp/` 자산 포팅
   - `/tarot` placeholder → 스프레드 선택 (원/투/쓰리/관계, 가격 10/15/22/35별)
   - `/tarot/draw` — 가로 스와이프 덱 + FLIP 애니메이션 + 방향 선택 (v1 패턴)
   - `/tarot/reading` — `[CARD:n]` 마커 + 스프레드별 system prompt + 별 차감 + SSE
   - DB 스키마: `readings.consultation_type` ('saju' | 'tarot') + `readings.spread_type` / `drawn_cards JSONB` 추가 마이그레이션
   - 별도 API 라우트 `/api/consultations/tarot/*` 또는 chat 라우트 분기

2. **화면 디테일 다듬기** (사용자 캡처 보고 결정)
   - 홈 (히어로 톤/타이틀 카피/감정 태그 카드)
   - `/concern` (사주/타로 picker 비주얼)
   - 기존 `/saju`, `/saju/reading`, `/saju/result`, `/mypage` (Header/BottomTab 추가로 인한 패딩/위계 충돌 확인)

3. **운영/legal 정리**
   - `/terms`, `/privacy`, `/refund` 페이지 — Footer 링크가 가리키는데 v2 에 없음 (현재 404)
   - Footer 부제 "AI 타로 친구" 톤 정리 (이제 사주+타로 듀얼)
   - 동일 사업자 가정으로 사업자 정보/이메일 그대로 — 변경 필요 시 [components/layout/Footer.tsx](components/layout/Footer.tsx) 수정

**진행 컨벤션** (이 흐름으로 새 세션 진입):
- 사용자가 해당 페이지 dev 에서 열어 캡처 + 어색한 부분 짚음
- 코드 변경 → 빌드 → dev push → 사용자 새로고침 검증 → 좋으면 main fast-forward
- 한 화면당 1~3 사이클이면 보통 정리됨
- 큰 작업 (타로 도입) 은 단계 나눠서 (스키마 → 자산 → draw → reading) 사이클 다회로 끊어서 진행

**완료 (2026-06-29 세션)**:
- ✅ **타로 도입** — 스프레드 선택/draw/reading/result/공유/OG 전부 라이브.
- ✅ **사주 resume** — 미완료 사주 reading 이어하기 (타로와 파리티). readings 리스트 API `ended` 판정을 고민 상담(사주+타로)으로 확장 + `/saju/reading?id=` resume (빈 메시지면 첫 풀이 자동 복구).
- ✅ **"고민 이어가기" 연속성 기능** — 완료 reading 참조 새 reading (`previous_reading_id` + `continuation_mode` 마이그레이션). `/api/readings/continue`(서버 복사: saju-fresh/saju-deep/tarot-deep) + tarot-fresh 는 draw 흐름에 `byeolkong:continuation` sessionStorage 마커 + chat 라우트가 부모 요약(지난 고민 + 마지막 한마디, excludeInvite) 주입 + 첫 턴 가이드 교체. UI 는 `ContinuationModal` 팝업(포털, 헤더/탭/풋터 가림). 2경로 — 타로: "타로 카드 새로 뽑아 상담"(정가) / "동일한 카드로 이어서 상담"(deep), 사주: 단일 "지난 대화를 이어서 상담"(deep). 가격 deep = 상품 정가 × 0.6 반올림("40% 할인"). 스펙/계획: `docs/superpowers/{specs,plans}/2026-06-29-reading-continuation*`.
  - 동반 수정: 결과 페이지 뒤로가기 → 내 고민톡, 타로 공유 버튼 2단 그리드(흰배경+보라텍스트), 사주 선택 페이지네이션(3/page), 카카오 공유 버튼 라벨 버그 수정, 타로 OG 한마디 closeCap 상향.

**보류된 큰 부채** (출시 전 처리):
- Phase 4 (d) admin 콘솔 (운영 도구 — 대시보드/사용자/에러/민감 검토)
- `middleware.ts` → `proxy.ts` rename (Next 16 deprecation 경고)
- 카카오 prod 앱의 JS 키 + Web 도메인 (`byeolkongtalk.com`) 등록 — prod 카카오 공유 동작용. dev 앱은 `dev.byeolkongtalk.com` 등록 시 4019 해소. **단 dev 는 Vercel Deployment Protection(SSO)** 때문에 외부 스크래퍼가 OG 이미지/`/cards-webp` 에셋을 못 받아 → 카카오 미리보기 이미지·"이미지로 저장"의 카드 그림이 빔. prod(보호 없음)에선 정상. dev 에서 확인하려면 Vercel Settings → Deployment Protection 해제 필요(보안 트레이드오프).

### Phase 2 결정 사항
- Supabase: 단일 프로젝트 + **Branching with Git sync** 채택 (별도 프로젝트 X). dev 브랜치 ~₩13k/월
- 결제: **토스페이먼츠 채택** (v1 패턴 이식, Phase 3). 결제위젯 v2 SDK + `/api/payment/ready`·`/confirm` + `payments` 테이블 + `/shop` 충전소
- AUTH_TOKEN_SECRET: dev/prod 다른 32 hex 시크릿 (Vercel env 등록 완료)

### Phase 5 (e2) 운영 노트 — 결과 / 공유 / 마이페이지
- 마무리 한마디 추출 (`lib/saju/closing`): 마지막 assistant 메시지 `[END]` 제거 + 마지막 문단 (250자 cap). 페르소나가 응답 끝에 응원 한마디를 보장하니까 거의 항상 자연스러운 문단
- 공유 흐름: 1) 카카오톡 (Kakao.Share.sendDefault feed — OG 이미지 + 마무리 한마디 + 링크) 2) 링크/텍스트 (Web Share API → 클립보드 폴백)
- 위기 차단 분기: `readings.has_sensitive=true` → result 페이지의 ShareButtons 가 "🤍 너만의 기록으로 둘게" 안내 박스로 자동 대체. OG 이미지 라우트도 403 반환 (URL 직접 접근 차단)
- OG 이미지 라우트 (`/api/og/saju/[readingId]`): UUID 형식 검증 → has_sensitive 차단 → readings + messages 조회 → Pretendard CDN 폰트 모듈 캐싱 → 1200×630 다크 그라데이션 + 4기둥 한자 + 한마디 + 일간/도메인 워터마크. 카카오톡 미리보기 / 트위터 카드용
- 마이페이지: 회원 탈퇴는 동의 체크박스 → `/api/auth/withdraw` (CSRF Origin 검증 + 카카오 unlink + users CASCADE). 충전 버튼은 `/shop` (토스 충전소) 로 연결

### Phase 5 (e1) / Phase 4 (e) 운영 노트 — 위기 시그널 안전망
- 감지 흐름: chat 라우트 → user 마지막 메시지 → `detectSensitiveSync` (~1ms) → 매칭 시 응답 헤더 `X-Sensitive-Category` + `X-Sensitive-Severity` → 스트림 완료 후 `sensitive_alerts` INSERT + `readings.has_sensitive=true`. 회색지대(low certainty)면 `detectSensitiveAsync` (Claude haiku) fire-and-forget — false positive 검수 + alert 보강
- regex 패턴 (5 카테고리): `lib/sensitive.ts` PATTERNS — 한국어 변형 (받침/띄어쓰기/단축) 일부 흡수. 추가 키워드 등록은 이 배열에 row 추가
- 카테고리별 hotline (`components/safety/SafetyBanner.tsx` `HOTLINES`):
  - suicide → 109(자살예방상담전화, 2024 통합), 1577-0199(정신건강위기상담), 129(보건복지상담센터)
  - school_violence → 117, 1388
  - domestic_violence → 1366, 112
  - sexual_violence → 1366, 해바라기센터
  - substance_abuse → 1342, 129
- 페르소나 (`data/persona/byeolkong.md`) 의 위기 안내 톤과 일치. 별콩이 응답 자체도 페르소나 가이드로 위기 시 hotline 안내 우선
- 운영자 검토: Phase 4 (d) admin 콘솔 (`/admin/sensitive`) 까지는 Supabase SQL Editor 에서 수동 — `SELECT * FROM sensitive_alerts WHERE reviewed_at IS NULL ORDER BY severity DESC, created_at DESC;` 후 reviewed_at + action_taken 마킹
- `readings.has_sensitive=true` 인 reading 은 Phase 5 (e2) 결과 화면에서 공유 비활성화 분기 (v1 패턴) 들어갈 예정

### Phase 5 (c) 운영 노트 — 풀이 채팅 + Claude
- 가격: 단일 22별/풀이. `SAJU_READING_COST` 상수만 바꾸면 일괄 변경. 무료 정책 X
- 수렴 임계치 (단일): convergeStart 4턴/1800자, hardcap 6턴/2200자, abs 9턴. 짧은 핑퐁 사용자도 abs 에서 안전 종료
- 페르소나 system prompt 는 매 호출 정적 (12-15K 토큰 추정) → `cache_control: ephemeral` 마킹. 첫 턴 cache write 1.25× / 후속 cache read 0.1× → 5턴 세션 ~33-40% 비용 절감 추정
- chat 라우트는 readings 소유권 검증 + messages 테이블에서 누적 turn/chars 직접 계산 (서버 권위). 클라가 보낸 messages history 는 Claude 입력용으로만 사용, DB 신뢰 X
- 첫 풀이는 readings.question 을 user 메시지로 전송 → 별콩이가 자동 풀이 (UX 흐름: concern 입력 → readings INSERT → reading 페이지가 question 전달)
- KOE006/KOE101 트라이아지: 카카오 콘솔 1) Redirect URI 등록 2) Web 도메인 등록 (별개) 3) Client Secret 활성화 4) Vercel env 추가 후 redeploy 필수 (저장만으로 안 반영)

### Phase 5 (b) 운영 노트 — 사주판
- 12지지 시간 매핑: 시진 시작값 (자시→0, 축시→2, …, 해시→22). 학설별 조자시/야자시 차이는 MVP 후 검토
- 시간 모름 = `hour: null` 로 calc 라우트 호출 → `SajuResult.input.hourKnown=false` + 자정 기준 계산. UI 에서 "시주는 참고용" 안내
- 오행 색상: 별콩이 톤 (cream/lilac/gold 와 어울리는 부드러운 톤). `components/saju/SajuBoard` 의 `ELEMENT_COLORS` 에 정의. 전통 채도와 다름 — 일관 유지
- 음력 입력 시 manseryeok 가 자동 양력 변환 후 4기둥 계산. UI 는 `SajuResult.input.inputCalendar` 로 원래 입력 표기 보존
- `/api/consultations/saju/calc` 는 로그인 가드 없음 (계산만, DB 저장 X). 로그인 + readings INSERT 는 Phase 5 (c) chat 진입 시

### Phase 5 (a) 운영 노트 — 사주 도메인 코어
- `lib/saju/calc.ts` 의 `calcSaju(input)` 만 호출. manseryeok API 직접 호출 X (wrapper 가 정규화 + JSONB 직렬화 책임)
- `SajuResult.input` 메타에 `inputCalendar`/`hourKnown`/`isLeapMonth` 저장 — 음력 입력은 표시용으로 보존 (UI 에서 다시 음력으로 보여줄 때)
- 시간 모름 = `hour: null` 로 calcSaju 호출 → 자정(0시)으로 계산 + `hourKnown: false` 마킹. UI 에서 "시주는 참고용" 안내 필요
- ON DELETE CASCADE 체인 (`users → user_profiles → readings → messages`) 덕분에 withdraw 라우트가 추가 코드 없이 자동 정리. `star_transactions.reading_id` 만 SET NULL (audit 유지)
- `user_profiles.is_primary` partial unique index 로 user 당 primary 1개 보장. 새 primary 설정 시 기존 primary 를 false 로 먼저 update 필요 (트랜잭션)
- 페르소나 system prompt 는 정적 (12-15K 토큰 추정) → Claude API 호출 시 `cache_control: { type: "ephemeral" }` 로 마킹 권장 (Phase 5 c 에서). saju_data 는 turn-specific 이라 user message 에 동적 주입

### Phase 4 (c) 운영 노트 — 별 재화 RPC
- `spend_stars(p_user_id, p_amount, p_reading_id?, p_source?)` — readingId 는 Phase 5 까지 NULL 허용. SELECT FOR UPDATE 로 동시 차감 직렬화. 잔액 < amount 시 `success=false reason=insufficient`
- `charge_stars(p_user_id, p_amount, p_payment_id, p_source?)` — 같은 payment_id 재호출 시 `idempotent=true` 응답. PG 결제 confirm 라우트 retry 안전
- 호출 코드는 항상 `lib/stars` 의 래퍼 통해서. RPC 직접 호출 X (service_role 만 EXECUTE)
- `/api/stars/spend` 의 amount 상한은 100별 (위조 차단). Phase 5 에서 도메인별 max cost 검증 추가 예정
- 신규 유저 카카오 로그인 시 `star_balances` row 자동 INSERT — RLS service_role 우회

### Phase 4 (b) 운영 노트 — 카카오 OAuth 흐름 + 알려진 부채
- 쿠키/storage prefix 통일: 모든 `byeolkong_` (`byeolkong_user_id`/`_anon_id`/`_admin_token`/`_oauth_state` + localStorage `byeolkong_user`/`_token`)
- Next 16 의 `cookies()` 는 async → 서버 컴포넌트/API 라우트에서 `await getSession()` 필수
- OAuth state CSRF: 32자 hex nonce 를 `byeolkong_oauth_state` 쿠키에 5분 TTL 로 저장 → 콜백에서 일치 검증 + 1회용 즉시 삭제 + open redirect 방지 (`/` 시작 + `//` 차단)
- 어드민 토큰 자동 발급: 카카오 콜백 → `setUserCookie` 가 ADMIN_USER_IDS 화이트리스트에 매칭되면 `byeolkong_admin_token` (HMAC-SHA256 32자 hex) 도 같이 발급
- 회원탈퇴: 카카오 unlink 실패 시 503 + DB 삭제 중단 (좀비 OAuth 방지). Phase 4 (b) 시점엔 users 만 삭제, stars/readings/payments 는 Phase 4 c+ 에서 보강
- `middleware.ts` deprecation: Next 16 에서 `middleware` → `proxy` 컨벤션 권장. 빌드 동작은 OK 지만 추후 chore commit 으로 rename 예정
- 카카오 redirect URI: dev=`https://dev.byeolkongtalk.com/api/auth/kakao`, prod=`https://byeolkongtalk.com/api/auth/kakao` 둘 다 카카오 콘솔에 등록 필수

### Phase 4 (a) 운영 노트 — Supabase main 자동 sync
- main(production) 브랜치는 GitHub Integration 첫 활성화 시점에 `<timestamp> / remote_schema` baseline row 가 `supabase_migrations.schema_migrations` 에 자동 생성됨. 그 timestamp 의 .sql 파일은 git repo 엔 없으므로 매 main push 마다 drift 로 abort → 한 번 수동 정리 필요
- 진단 위치: Branches → main → **Workflow logs** (Migrations FAILED + 마지막 줄 `Remote migration versions not found in local migrations directory`)
- 해결: main DB SQL Editor 에서 `DELETE FROM supabase_migrations.schema_migrations WHERE version = '<baseline_ts>';` → 빈 commit (`git commit --allow-empty`) 으로 재트리거
- 이후 새 마이그레이션 push 마다 main Workflow logs 에서 SUCCESS 확인 습관화
- Vercel env 새로 등록 직후엔 `/api/health` 로 URL/Key mismatch 검증 (Phase 4 a 진행 중 prod env 한 번 잘못 매칭됐던 사례)

## 관련 레포

- v1 (참고용, sunset 예정): https://github.com/geonhee-lee0912/tarot-friend
  - 인프라 패턴(auth/payment/admin/logger) 이식 시 참고
  - 도메인 종료 후 GitHub archived 처리
