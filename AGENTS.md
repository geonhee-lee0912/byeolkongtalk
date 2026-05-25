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
- AI: Claude API (`claude-sonnet-4-20250514`, SSE 스트리밍)
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
    auth/, payment/, stars/, admin/, log/, health/   # 공통 인프라
lib/
  consultations/saju/           # manseryeok wrapper, 페르소나
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
- [ ] **Phase 3** — 외부 서비스 추가 (PG사 결정 후 결제 / GA4 — 선택)
- [ ] **Phase 4** — 검증된 인프라 이식
  - [x] (a) logger + /api/health + boundary 페이지 — `error_logs` 마이그레이션, `lib/supabase`/`lib/env`/`lib/logger`, `/api/health`, `/api/log/error`, `app/error.tsx` + `app/global-error.tsx` + `app/not-found.tsx`. dev/prod 양쪽 `/api/health` 200 OK
  - [ ] (b) auth — 카카오 OAuth + 익명→유저 마이그레이션 + 쿠키 세션 + `/api/auth/*`
  - [ ] (c) stars — 별 잔액/트랜잭션 + RPC + `/api/stars/*`
  - [ ] (d) admin — 어드민 콘솔 + HMAC 쿠키 + admin_actions + bulk API
  - [ ] (e) sensitive — 위기 시그널 감지 + SafetyBanner + alerts 테이블
- [ ] **Phase 5** — 사주 도메인 신규 설계 (manseryeok + 페르소나 + UI + 가격표)
- [ ] **Phase 6** — v1 종료 + v2 prod 런칭 (DNS 전환, v1 archive)

### Phase 2 결정 사항
- Supabase: 단일 프로젝트 + **Branching with Git sync** 채택 (별도 프로젝트 X). dev 브랜치 ~₩13k/월
- 결제: 토스 → 보류, PG사 미정 (Phase 4 시점 결정 — 카카오페이/네이버페이/부트페이 등 후보)
- AUTH_TOKEN_SECRET: dev/prod 다른 32 hex 시크릿 (Vercel env 등록 완료)

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
