# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# 별콩톡 (byeolkongtalk)

사주·타로·연애를 아우르는 멀티모달 운세 상담 서비스. 캐릭터 **별콩이** — 별의 수호자, 작은 신령/요정. 흐름과 가능성, 선택의 방향을 안내한다.

> ⚠️ **이 문서는 "지금 코드를 만질 때 필요한 것"만 담는다.** Phase 0~5 진행 로그·세션별 완료 기록·역사적 트러블슈팅은 `docs/AGENTS-archive-2026-07-27.md` 로 이관했다(2026-07-27 압축, 30,628자 → 이 파일. 모든 세션에 자동 로드돼 ~26k 토큰을 먹던 문제).
> **아카이브가 필요하면 Grep 으로 섹션만 — 전문 Read 금지.**
> 진행 중 작업은 **아직 합쳐지지 않은 브랜치와 그 안의 `HANDOFF.md`** 가, 할 일 순서는 `ROADMAP.md` 가 관리한다(`scripts/agent/start.sh` 가 둘을 함께 찍는다). 판정·분석 일정(숫자 포함)은 회사 레포 `ROADMAP.md`. **이 문서에 진행 로그를 append 하지 말 것** — 그게 30k 로 불어난 원인이다.

## 공통 규칙

> 모든 서비스 레포의 이 절은 같은 글이다 — 고칠 땐 다른 서비스 레포의 같은 절도 함께 고친다. Claude Code 는 `CLAUDE.md`(`@AGENTS.md`)로, Codex 는 이 파일을 직접 읽는다. 사업 맥락·결정 기록·사례는 비공개 저장소 `geonhee-lee0912/braveshine-company`(기획·판정 때만 연다 — 코드 일은 이 파일로 충분해야 한다).

- **역할** — 이 서비스를 맡은 플랫폼(Claude 또는 Codex)이 기획·디자인·개발을 다 한다. 리뷰만 반대 플랫폼이 한다. 사용량 때문에 다른 플랫폼이 잠시 이어받아도 규칙은 같다. 어느 도구도 다른 도구를 일꾼으로 부르지 않는다(`codex exec`·Claude 호출 금지). PR 에 리뷰를 청하는 `@codex review` 댓글은 예외.
- **리뷰는 PR 을 만든 쪽의 반대편** — 서비스가 아니라 작성자 기준. 작업 브랜치 머리로 만든 쪽을 표시한다(`claude/…`·`codex/…`). Claude 가 만든 PR 은 연 뒤 `@codex review` 댓글, Codex 가 만든 PR 은 Claude 리뷰를 명시 호출(`/code-review <PR>`). 같은 플랫폼의 리뷰는 반대편 리뷰가 아니고, 봇 리뷰는 승인이 아니다. 승인·머지는 운영자. 되돌리기 어려운 일(DB·결제·별·로그인·탈퇴·페르소나 코어·dev→main)의 PR 은 작성자가 누구든 Claude `/code-review <PR>` 도 한 번 더 돌린다 — Codex 자동 리뷰 측정(10-31, 결함 2개 중 1개)에서 조용히 지나가는 경계 결함을 놓쳤다.
- **운영자 승인이 필요한 일**(결과물을 들고 와서 묻는다) — ①돈이 나가는 일(금액·이유·기대 효과 한 줄) ②사용자에게 보이는 운영 배포(미리보기·바뀐 점 3줄·되돌리는 법, 운영자가 "go" 할 때만) ③밖으로 나가는 것(광고·공지·SNS·이메일 — 실물) ④되돌리기 어려운 일(DB 구조·삭제, 결제·로그인, 약관 — 위험 설명 + 반대편 리뷰). 승인 없이 하는 일: 개발, dev 배포·미리보기, 리뷰, 분석·보고서, 이슈 정리, 문서.
- **결정** — 범위 축소·연기·분석 결론·구현 방향은 혼자 정하지 않는다. 결정 카드로 하나씩 묻는다: 결과물, 고를 안, 추천, 한 줄 답("지금 바빠"도 답이다 — 그러면 상관없는 일을 먼저). 기다리는 동안 작업은 브랜치에 push 해 둔다. 운영자가 드롭한 항목을 되살리지 않고, 정한 방향에 "검증 먼저" 관문을 끼우지 않는다.
- **절대 금지** — `main` 직접 push·머지 · 운영 DB 쓰기와 운영 콘솔·결제·광고 계정 조작(운영 데이터는 읽기 전용 스크립트로만, 쓰기는 SQL 을 만들어 운영자에게) · 키·풀 UUID·사용자 식별자를 코드·문서·PR·대화에 쓰기(공개 저장소) · Vercel·Supabase 프로젝트 연결 변경 · 공유 워킹 트리에서 `git add -A`·`git commit --amend`·패키지 매니저 설치 명령 직접 실행(의존성은 `scripts/agent/init.sh` 만).
- **범위** — 가정을 말하고, 모르면 묻는다. 요청 밖 코드를 고치지 않는다. 가장 단순한 해법부터.
- **판정** — "문제다" 전에 반증을 시도하고 확인됨/유력/의심을 붙인다. 실패가 조용한 변경(권한·설정·배포·네트워크)은 설정을 읽어 판정하지 말고 실물로 호출한다. 못 돌린 것은 미확인이라고 쓴다.
- **일의 단위** — 브랜치 하나 = 일 하나 = `HANDOFF.md` 하나. 기본 브랜치에서 `claude/…`·`codex/…` 브랜치를 따고 루트에 `HANDOFF.md`(제목은 `ROADMAP.md` "다음"의 그 줄과 같은 문구 · 마지막 갱신과 자리 · 목표 · 지금 상태 · 다음 할 일[어디서든|로컬에서] · 확인 못 한 것 · 건드리면 안 되는 것). 멈출 때마다 갱신해 같은 브랜치에 푸시한다 — 그 커밋이 인계다. 끝나면 마지막 커밋에서 `HANDOFF.md` 를 지우고 `ROADMAP.md` 의 줄을 "끝남"으로 옮긴 뒤 PR. 플랫폼 전용 표현(슬래시 명령·스킬·"메모리 참고")은 쓰지 않는다 — 다른 도구가 읽는다. 서비스 저장소는 공개라 `HANDOFF.md`·`ROADMAP.md`·PR 에 사업 숫자를 쓰지 않는다 — 숫자가 든 상태는 회사 레포로.
- **시작·종료** — 시작은 `scripts/agent/start.sh`(fetch·빨리감기·합쳐진 로컬 브랜치 삭제·로드맵 "다음"과 진행 중 브랜치의 HANDOFF 출력) → 브랜치 선택(클라우드 세션은 자동으로 만든 브랜치나 기본 브랜치에서 열릴 수 있다 — 이어받을 브랜치가 있으면 `git fetch origin <b> && git switch <b> && git pull --ff-only` 로 옮긴 뒤 시작하고, 자동 브랜치는 푸시하지 않는다; 실행 권한이 없으면 `bash scripts/agent/…` 로) → `HANDOFF.md` 를 끝까지 읽고 "지금 상태"를 **실행으로 재확인**(적힌 것과 다르면 그 차이를 먼저 적는다) → "자리" 줄을 이 자리로 고쳐 커밋·푸시(이게 잠금) → `scripts/agent/init.sh`. 종료는 커밋 안 된 변경 0(미완성은 `wip:`) → `HANDOFF.md` 갱신·커밋·푸시 → `scripts/agent/stop.sh` 가 통과. 로컬에서 끄기 전·클라우드 세션을 멈추기 전·도구를 바꾸기 전 전부 같다. 워크트리의 브랜치도 같다.
- **자리·도구 옮기기** — 한 브랜치는 한 번에 한 자리에서만(`HANDOFF.md` "자리" 줄이 잠금, 병렬은 브랜치를 따로). 당기기는 `--ff-only` 만, 안 되면 멈추고 운영자에게. 강제 푸시·rebase 금지. 클라우드엔 `.env.local`·브라우저·운영 데이터·모바일 빌드가 없다 — 그걸 쓰는 할 일은 `[로컬에서]`, 클라우드 세션은 건너뛴다. 도구를 바꾸면 상대의 기억은 없다고 전제하고 `HANDOFF.md` 만 믿는다. 옮겨 가며 만든 PR 은 마지막으로 많이 짠 쪽을 작성자로 보고 브랜치 머리를 맞춘다(어려우면 PR 본문 첫 줄에 "작성: Codex"). 전환은 운영자가 한다("정리해 둬" → "이어서 해").
- **커밋·PR** — 메시지는 파일로(`git commit -F <파일> -- <경로>`), 제목 다음 줄은 비운다. 커밋 전 diff 에서 키·UUID·식별자를 훑는다. PR 은 "어디에 영향이 가는지"를 먼저 쓴다(`.github/pull_request_template.md`). 화면 일은 승인한 시안을 정답으로 삼고 정답과 실제를 나란히 찍어(폰·PC 폭) 붙인다.
- **답** — 한국어. 결론 먼저, 짧게. 확인 못 한 것은 맨 앞에. 숫자는 근거와 함께. 운영자는 코드를 읽지 않는다 — 결과물로 보고하고, 운영자 몫의 다음 할 일은 어디서 무엇을 하는지 구체적으로. 다단계 작업은 단계마다 완료 현황을 표시한다.

## 명령 (두 플랫폼·로컬·클라우드 공통)

- **작업 시작**: `scripts/agent/start.sh` → 브랜치 선택(새 일이면 `git switch -c claude/<일> origin/dev`) → `HANDOFF.md` → `scripts/agent/init.sh`. PR 은 base `dev` — dev 에 직접 커밋하지 않는다(교차 리뷰는 PR 이 있어야 한다). `main` 은 운영 배포 PR 만(`docs/agent/deploy.md`)
- **작업 종료**: `HANDOFF.md` 갱신 → 커밋·푸시 → `scripts/agent/stop.sh`
- **세션 시작 1회**: `scripts/agent/init.sh` — 키가 있으면 dev 리소스인지 확인(없으면 클라우드 기본 환경으로 통과) · 빈 `.env.local` · 필요할 때만 `npm ci` · 필수 키 이름 확인(값은 출력 안 함). Node 는 `.nvmrc`(24, CI 와 같음)
- 타입: `npx tsc --noEmit --incremental false`
- 테스트(vitest 아님, CI 와 동일): `node --import tsx --test $(find . -name "*.test.ts" -not -path "./node_modules/*" -not -path "./qa/*" -not -path "./mobile/node_modules/*")`
- 빌드: `npx next build` — `Failed to fetch ... Google Fonts` 면 `.next` 를 지우지 말고 재시도. 라우트 표에 `ƒ Proxy` 가 있어야 한다
- dev 서버: `npm run dev`(:3000, 백그라운드). 페르소나 수정 뒤엔 재시작
- QA: `npm run qa -- --case=<id>` — dev 서버 필요, dev DB 의 QA봇 **[로컬에서]**
- 화면 확인: `scripts/agent/shot.sh http://localhost:3000/<경로> /tmp/a.png [유저UUID]` 후 이미지를 직접 본다. QA봇 = `11111111-1111-4111-8111-111111111111`. playwright 가 깔린 폴더가 필요하다(`BK_PLAYWRIGHT_DIR`, 로컬 전용)
- 어드민 화면: 키를 환경에 두지 말고 그 명령에만 — `ADMIN_USER_IDS=<uuid> npm run dev`
- 운영 배포: 운영자가 "prod 배포하자"고 할 때만, `docs/agent/deploy.md` 절차대로(점검은 `scripts/agent/deploy-check.sh <ref>`)
- 네트워크 판정은 샌드박스 `curl` 상태코드가 아니라 앱과 같은 Node `fetch` 로
- GitHub: 클라우드 세션에선 `gh pr`·`gh issue`(GraphQL)가 막힌다 — `gh api repos/geonhee-lee0912/byeolkongtalk/...` REST 로

## 기술 스택

- Framework: **Next.js 16** (App Router, React 19, TypeScript strict)
- Styling: **Tailwind CSS v4** (`@theme` 토큰, CSS-only — `tailwind.config.ts` 없음)
- Fonts: Noto Sans KR(본문) + Cafe24Ssurround(`--font-display`, 타이틀)
- DB: Supabase (PostgreSQL) — Branching with Git sync
- Auth: 카카오·애플 로그인(`user_identities`) + 익명 식별자 + httpOnly 쿠키 세션 + 앱 토큰(`Authorization: Bearer`, 앱 쪽 호출용)
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
mobile/                # Expo SDK 58 앱(웹뷰 껍데기) — 설정 정본은 app.config.ts(app.json 을 만들면 무시된다). Expo API 는 학습 기억 말고 버전 문서(docs.expo.dev/versions/v58.0.0)로. 루트 tsconfig 에서 제외(.vercelignore 도 있으나 Git 배포 적용은 미확정). 웹과 공유하는 건 lib/app-bridge 뿐. mobile/src 의 순수 모듈 테스트는 루트 CI 가 같이 돌린다 — react-native·expo import 금지(CI 엔 mobile/node_modules 가 없다)
docs/superpowers/{specs,plans}/
```

## 별콩이 페르소나

**구조**: `data/persona/byeolkong_core.md` 가 화법·위기 안전망·금지표현의 **단일 원천**이고, `byeolkong_{saju,tarot,fortune,relationship,relationship_draw,verdict_inthread}.md` 가 도메인별로 얹힌다.
⚠️ **코어 편집 = 전 종목 전역 변경** → 광범위 회귀 QA 필수(`[로컬에서]`). 위기 안전망·금지표현을 도메인 파일로 복사하지 말 것(드리프트 사고 방지). 화법·judge·캐시 규칙은 `docs/agent/persona.md`.

## 코딩 규칙

- 🔴 **로그인 수단은 `user_identities` 가 정본** — `users.kakao_id` 를 직접 읽지 말 것(애플 회원은 NULL). 회원의 수단·해시는 `lib/auth/user-identity.ts`·`identity-hash.ts`(카카오 해시 = 옛 원장 공식 그대로 — 바꾸면 웰컴 별 재수령), 가입·로그인은 `lib/auth/sign-in.ts` 하나로(신규 처리·웰컴 별 1회가 거기 있다). `getSession()` 은 `Authorization` 이 Bearer 방식이면(앱 토큰 — 비었거나 틀려도) 토큰만 본다 — 실패면 비로그인, 회원·익명 쿠키 폴백 없음(규칙 `lib/auth/session-resolve.ts` · 연결부 잠금 `lib/session.test.ts`)
- 🔴 **마이그레이션과 그걸 읽는 코드는 따로 올린다** — 표가 생기기 전에 코드가 뜨면 그 몇 분 동안 로그인이 깨진다(앱 ① `user_identities`). 마이그레이션 커밋만 먼저 push → Supabase 체크 success → 나머지. prod 머지도 같은 순서
- 🔴 **웹에서 세션을 끝내는 곳은 앱에도 알린다** — `/api/auth/logout`·`/api/auth/withdraw` 를 부르면 `postToApp("auth.loggedOut")` 도(웹 쿠키만 지우면 앱이 토큰을 들고 있다가 다음 실행 때 조용히 다시 로그인시킨다). 지금은 마이페이지 둘뿐이고 `lib/app-context.test.ts` 의 배선 계약이 잠근다 — 새 곳을 만들면 그 테스트도 고칠 것
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
  - 현재 상태: 전역 `f {postgres, service_role}` · public `TBL/FN/SEQ {postgres, service_role}`(SEQ 는 `20261021010000`). 즉 **새 테이블은 `ENABLE RLS` 를 깜빡해도 anon 이 못 만진다**
  - 🔴 **새 테이블은 같은 마이그레이션에 `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<표> TO service_role;` 을 직접 쓴다**(시퀀스를 따로 만들면 `GRANT USAGE, SELECT, UPDATE ON SEQUENCE … TO service_role`). Supabase 가 2026-10-30 부터 신규 테이블 자동 권한을 끊는다 — 기본 권한에 기대면 마이그레이션은 성공하고 첫 호출에서 permission denied 가 난다(빌드·테스트로 못 잡음). anon·authenticated 에는 주지 않는다. 기존 테이블은 `20261021000000` 이 일괄 명시
  - ⚠️ **카탈로그만 보고 판정하지 말 것.** 두 번 다 설정은 바뀐 것처럼 보였고 실제로는 안 먹었다. **카나리아**(RLS 안 켠 임시 테이블 + 임시 함수)를 만들어 **anon 키로 실제 HTTP 호출**해 401 을 확인하고 지울 것 — `20260729020000`~`050000` 이 그 절차다
- 사주 계산은 `lib/saju/calc.ts` 의 `calcSaju(input)` 만. tyme4ts 직접 호출 금지(wrapper 가 한자→한글 매핑+정규화+JSONB 직렬화 책임). 절기 기준(입춘 년주·절기 월주)·야자시(23시=다음날 일주). 시간 모름 = `hour: null` → 자정 계산 + `hourKnown:false` 마킹 (구 manseryeok 은 년주 입춘무시·월주 절기버그로 2026-08-23 교체)
  - 🔴 **음력→양력은 KASI 표(`lib/saju/lunar-table.ts` `lunarToSolar`)가 정본** — tyme4ts 음력(`LunarHour`·`LunarDay`)은 중국 농력이라 1900~2049 중 64개월(2012·2017 윤달 포함)이 한국과 다르다. 음력 입력을 tyme4ts 로 변환하지 말 것 (`specs/2026-10-02-음력-KASI-대조-findings.md`)
- chat 라우트는 **서버가 권위** — 소유권 검증 + `messages` 테이블에서 누적 turn/chars 직접 계산. 클라가 보낸 history 는 Claude 입력용으로만
- 단정적 예언 톤 금지(페르소나 화법 원칙)
- **`users(id)` 참조 FK 는 반드시 `ON DELETE CASCADE` 또는 `SET NULL` 명시** — 없으면(NO ACTION) 회원 탈퇴 users DELETE 가 23503 으로 차단됨 (2026-07-17 `ad_spend.created_by` 사례: unlink 만 성공한 반쪽 탈퇴 → 재시도마다 -101 info 루프)
- **페이지 metadata 의 `openGraph`/`twitter` 는 필드별 병합이 아니라 객체 통째 교체** — 페이지에서 `openGraph:{title}` 만 주면 루트 `app/layout.tsx` 의 `siteName`·`locale`·`type` 과 `app/opengraph-image.tsx` 가 붙이던 `og:image` 4종이 **조용히 사라진다**(`twitter:image` 까지). 콘텐츠 존은 `lib/seo/metadata.ts` 의 `contentMetadata()` 경유 — 공용 필드 재선언은 의도된 것이니 "중복"으로 지우지 말 것(계약 테스트가 막는다)
- **신규 `consultation_type` 값 추가 시 컬럼 폭 확인** — `'relationship'`(12자)이 `VARCHAR(10)` 을 넘어 등록이 22001 로 죽은 사례. CHECK 에 값만 넣고 폭을 안 늘리면 조용히 실패한다
- **어드민 집계는 원본 행을 앱으로 끌어오지 않는다** — `.limit(100000)` 은 아무것도 보장하지 않는다(Supabase `Max rows` 가 서버측 강제 상한이라 조용히 덮어쓴다). 새 어드민 화면·집계는 **SQL 집계 RPC** 또는 `count:"exact"` 로. ✅ **전환 완료 (2026-07-31)** — 실호출 `.limit(100000)` 0곳, `admin_*` RPC 20여 개. 스펙 `specs/2026-07-28-admin-aggregation-rpc-migration.md`
  - 🔴 **새 집계 RPC 를 쓸 때 반드시 지킬 것 4가지** (전부 2026-07-31 에 실제로 물린 함정)
    - **마이그레이션의 모든 함수 본문을 적용 전에 prod 에서 실행해볼 것.** 일부만 검증하면 나머지 하나의 오류로 **파일 전체가 실패**하고, 코드만 배포돼 화면이 깨진다(실사고 1건, 어드민 25분)
    - **날짜식은 `(created_at at time zone 'UTC' + interval '9 hours')::date`.** `at time zone 'UTC'` 를 빼면 캐스트가 세션 TimeZone 에 좌우된다
    - **NULL 3값 논리** — `NOT (col LIKE … AND …)` 는 col 이 NULL 이면 false 가 아니라 **NULL** 이라 WHERE 가 그 행을 버린다(실측 30행 유실). `col IS NULL OR …` 을 명시할 것
    - **`_` 는 LIKE 의 와일드카드다.** JS `startsWith("fortune_")` 를 `LIKE 'fortune_%'` 로 옮기면 안 된다 → `left(s,8)='fortune_'`
  - **검증은 JS↔SQL 행 단위 diff 로.** prod 원본을 read-only 로 받아 로컬에서 기존 JS 를 돌리고 같은 스냅샷의 SQL 과 대조한다(별 소모 이식이 이 방식으로 그룹 41개 차이 0 확인). 함수 자체는 `service_role` 전용이라 `run-prod-query.mjs` 로 **직접 호출은 안 된다**(permission denied 가 정상) — 본문을 인라인해서 돌릴 것
  - **표시용 목록**(행수가 데이터에 비례)은 `p_limit` + **눈에 보이는** 절단 경고, 또는 페이지네이션. 플래그만 두고 안 보여주면 의미가 없다. OFFSET 페이지네이션은 `ORDER BY` 에 **타이브레이커가 없으면 행이 중복·누락**된다
- 🔴 **`[RECO:...]` 마커 추출은 `parseAllRecoMarkers`/`parseRecoMarker`(`lib/reco-utils.ts`)만** — 정규식으로 직접 긁어 `m[1] as RecoProduct` 캐스팅 금지. enum 밖 값(LLM 환각 마커)이 새면 `RECO_DISPLAY[product]===undefined` → `display.label` 크래시로 결과 화면 전체가 죽는다(2026-08-02 prod `undefined is not an object (evaluating 'a.label')`, /tarot·/saju reading 4곳 동시 결함). 캐스트는 tsc·build·유닛을 다 통과하니 자동 게이트로 못 잡는다 — 렌더 지점(`RecoInlineCard`·`RecoConfirmModal`)엔 `if (!display) return null` 방어를 같이 둘 것. 계약은 `lib/reco-utils.test.ts`

## dev/prod 분리

- `main`→Production→byeolkongtalk.com / `dev`→Preview→dev.byeolkongtalk.com (단일 Vercel 프로젝트, 환경 스코프 분리)
- Supabase(Branching+Git sync) · 카카오 OAuth 앱 · 토스 키 · `AUTH_TOKEN_SECRET` 전부 dev/prod 분리
- **로컬 `.env.local` 은 dev 리소스를 가리킨다** — prod 리소스로 로컬 돌리기 금지
- 마이그레이션: `supabase/migrations/<timestamp>_<name>.sql`. `dev` push → Supabase dev 자동 적용 / `main` 머지 → Supabase main 자동 적용. **수동 양쪽 적용 불필요.** push 후 main Workflow logs SUCCESS 확인 습관
- 필수 env: `CLAUDE_API_KEY` · 카카오 5종 · 토스 2종 · Supabase 3종 · `NEXT_PUBLIC_BASE_URL` · `AUTH_TOKEN_SECRET`. 선택: `NEXT_PUBLIC_GA_ID`·`ADMIN_USER_IDS`. **Vercel env 등록 직후 `/api/health` 로 검증**(저장만으로 반영 안 됨 — redeploy 필요)

## 운영 함정 (실사고 기록)

- proxy 익명 쿠키 발급은 교차 사이트 POST 를 받는 경로에서 뺀다(지금 `/api/auth/apple/callback`) — Lax 쿠키가 안 실려 '없음'으로 보이지만 새로 심으면 기존 anon 을 덮어쓴다(가입 뒤 지도 승계·유입 복구·입구 반반 그룹이 끊김). 이런 경로를 새로 만들면 같은 예외와 `proxy.test.ts` 한 줄을 더할 것
- **어드민 가드**: 페이지 자체 가드는 `relationship-readings` 하나뿐 — **나머지 14화면은 `proxy.ts` 가 유일한 문**(데이터는 `/api/admin/*` 개별 `requireAdmin` 으로 이중 보호). proxy 를 건드릴 때 이 사실을 기억할 것
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

## Review guidelines

반대편 리뷰(Codex 의 GitHub 자동 리뷰 포함)는 이 절을 따른다. 리뷰는 한국어로 쓴다.

- **되돌리기 어려운 일인지 첫 줄에 적는다.** 아래에 닿으면 해당 — 머지 전에 반대편 리뷰 + 운영자 승인: `supabase/migrations/`·RPC 권한 / 별 잔액·결제(`lib/stars.ts`·`app/api/stars/`·`app/api/payment{,s}/`) / 로그인·세션·탈퇴(`lib/auth/`·`app/api/auth/`·`proxy.ts`) / 페르소나 코어(`data/persona/byeolkong_core.md`) / dev→main 정식 머지.
- 키·풀 UUID·사용자 식별자가 diff 에 있으면 가장 먼저 지적한다(공개 저장소).
- 우선 볼 함정(위 "코딩 규칙"·"운영 함정"): 마이그레이션과 그걸 읽는 코드를 한 PR 에 섞음 · 새 `SECURITY DEFINER` RPC 의 REVOKE 3종 누락 · 새 테이블의 service_role GRANT 누락 · `users(id)` FK 의 ON DELETE 누락 · 어드민 집계에서 원본 행을 앱으로 끌어옴(`.limit` 은 Max rows 에 조용히 잘림) · SQL 날짜식에서 `at time zone 'UTC'` 누락 · `[RECO:…]` 마커를 정규식으로 직접 캐스팅 · 페이지 metadata 의 `openGraph`·`twitter` 부분 덮어쓰기 · 웹 로그아웃·탈퇴에서 `postToApp("auth.loggedOut")` 누락 · `users.kakao_id` 직접 읽기 · 별 잔액 RPC 직접 호출.
- 테스트·빌드 통과를 안전의 증거로 보지 않는다 — 이 저장소의 큰 사고들은 둘 다 통과하고 운영까지 갔다. 조용히 실패하는 경로(권한·잘림·캐스트·설정)를 본다.

## 관련

- 아카이브: `docs/AGENTS-archive-2026-07-27.md`(Phase 로그·세션 기록·역사적 트러블슈팅) · `docs/superpowers/2026-07-27-work-queue-archive.md`(W1~W7 실행 로그)
- 설계·플랜 원장: `docs/superpowers/{specs,plans}/`
- v1 (sunset 예정, 인프라 패턴 참고용): https://github.com/geonhee-lee0912/tarot-friend

## 더 읽을 것 (그 영역을 만질 때만)

- 재화·상품·prod 상태, 완료된 전환 기록: `docs/agent/product-state.md`
- 화면·라우트·하단탭 흐름: `docs/agent/user-flow.md`
- 디자인 토큰·모티프: `docs/agent/design-system.md`
- 별콩이 화법·judge·프롬프트 캐시 규칙: `docs/agent/persona.md`
- 운영 배포 절차: `docs/agent/deploy.md`
