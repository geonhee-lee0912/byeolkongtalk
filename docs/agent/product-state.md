# 별콩톡 현행 prod 상태와 전환 기록

> `AGENTS.md` 에서 뺀 절. 재화·상품 상태를 건드리거나 숫자 판독을 할 때 읽는다. 가격은 코드 상수가 정본이다.


- **재화 정본 — 가격은 코드 상수가 정본이다. 문서 숫자와 어긋나면 코드를 믿을 것.**
  웰컴 15별(`WELCOME_BONUS_STARS`, 09-28 20→15) · 첫충전 +20%(`FIRST_CHARGE_BONUS_RATE`) · 연애 패스 30/60/100(`PASS_PLANS`) + 무료 인트로 3턴(`FREE_INTRO_TURNS`) · 소프트캡 20턴/일 + 5별=+5턴(무제한) · 사주 20(`SAJU_READING_COST`)
- **우리 사이 스킬 4종 = 스레드 내부 실행** (`lib/relationship/skills.ts` `RELATIONSHIP_SKILLS`) — 관계체크인 45 / 걔속마음 40 / 우리궁합 40 / 싸움판정 30. 별도 라우트·화면 없음(`lib/relationship/{draw,compat}-thread.ts` + `ThreadDrawModal`/`ThreadCompatCard`/`ThreadCardStrip`). 칩 UI 는 입력창 ⚡ `SkillSheet`. 스킬은 활성 패스 필요
- **관계 기억** = 최근 24메시지 원문 + 초과분 haiku 델타 요약(`rolling_summary`/`summarized_msg_count` 커서, `lib/relationship/memory.ts`). 최근창은 항상 user 발화로 시작(Anthropic 규칙)
- **민감 감지**: 회색지대는 **스트림 시작 전 haiku 2차 판정을 await**(~1초, 3초 타임아웃 시 regex 폴백). regex high 는 즉시 확정. 패턴은 `lib/sensitive-patterns.ts` PATTERNS(고민 쓰기 화면도 쓰는 순수 모듈 — import 0 계약 테스트), hotline 은 `components/safety/SafetyBanner.tsx` `HOTLINES`. `has_sensitive=true` 면 공유 차단 + OG 라우트 403
- **위기 대화는 서버측 강제 종료 없음** — `has_sensitive` 면 abs-cap `[END]` 억제(안전 > 비용). rate-limit 20/분은 유지
- **타로 프리미엄(5장+)**: 첫 풀이 3라벨 골격(🃏💫🔗) + 카드당 6~7문장 + `[CARD:n]` 마커 선행 강제. 수렴 임계치는 카드 수 기준(`WRAP_THRESHOLDS`)
- **next_reco 중단** — haiku 태깅 off + 결과 화면 추천 카드 제거. **인챗 칩(clarifier·extend·이어가기)과 `components/reco/RecoInlineCard` 는 생존**
- **계측**: `page_views` + `/api/pv` + `/admin/traffic` · 탈퇴 시 utm 스냅샷 보존 · `PROMPT_VERSION`(`lib/prompt-version.ts`) 코호트
- ⚠️ **`[END]` → 결과는 자동 이동이 아니라 수동 [결과 보기 →] 버튼**. `result_viewed_at` 은 사실상 **"버튼을 눌렀나"**를 잰다. 🚫 **자동 이동은 2026-07-31 기각** — 유저 통제를 뺏고, 게다가 이 지표가 "종료 도달"과 같아져 **정의상 소멸**한다. 미열람의 본체는 어차피 **종료 동작 자체를 안 하는 53%** 쪽이다 — `specs/2026-07-26-unviewed-results-findings.md` 를 그 축으로 재검토할 것
- 🗑️ **측정 창 규율(수익성 판정 사이클) 폐기 (2026-07-31)** — 광고 배급 붕괴로 관측 창이 오염돼 사이클이 깨졌다. day 0·d4~d28 캘린더·배포 슬롯 규율 전부 삭제. 다음 로드맵은 새로 짠다. 실측 판독과 판독 도구(`scripts/cycle-snapshot-*.sql`)는 살아 있다 — 판독 일정은 회사 레포 이슈(옮기기 전엔 로컬 메모리 `w1-w7-work-queue`)


## 완료된 전환 (기록)

- ✅ **`middleware.ts` → `proxy.ts` 전환 완료 (2026-07-31)**. Next 16 은 루트 `proxy.ts` + `export function proxy(req)` 를 쓴다(`config` 는 그대로 · 문서 `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). 코드모드 대신 수동 rename — 병렬 작업 중 리포 전체 코드모드가 위험했고, 실제 변경이 파일명+함수명뿐이라 얻는 게 없었다.
  ⚠️ **이 전환은 조용히 실패한다** — 인식이 안 되면 크래시 없이 anon 쿠키 미발급(계측 전체 오염) + `/admin` 페이지 가드 소실. 그래서 검증 3종이 필수다: ①빌드 라우트 표에 `ƒ Proxy` 가 뜨는가 ②새 시크릿 창에서 anon 쿠키 발급 ③토큰 없이 `/admin` → 리다이렉트

