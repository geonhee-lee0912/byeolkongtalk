# 별마루 배포 후 성과 측정 쿼리 (prod read-only)

2026-10-02 "별마루 배포 후 성과 측정" 세션이 만든 판독 쿼리 7종. 그 세션 임시 폴더에만 있어 사라지기 전에 옮겨 뒀다.
실행: `SUPABASE_PAT=<pat> bash scripts/byeolmaru-post-deploy/run.sh` → 결과는 `scratchpad/byeolmaru-post-deploy/`(git 미추적).

| 파일 | 보는 것 | 창 |
|---|---|---|
| q1_reach | 일별 별마루 PV/UV + 사이트 UV(침투율) | 09-22~ |
| q2_funnel | 페이월 노출 → 체험 → 구독 클릭 → 구독 완료(slot 별) | 09-28~ |
| q3_engage | 참여·이탈·진입 경로(free_item·day_tab·no_profile·need_login·home 카드·크로스셀) | 09-28~ |
| q4_output_cost | 산출물 수 + `llm_usage` 원가 | 09-28~ |
| q5_retention | 별마루 방문일수 분포 · 출석 연속 | 09-28~ |
| q6_guardrail | 배포 직전 4일 vs 직후 4일 사이트 핵심지표 | **고정 창** — 재사용 시 `win` 날짜를 바꿀 것 |
| q7_fortune_check | 유료 사주/운세 리포트 구매 일별 추이 | 09-09~ |

규약: 지인 6명 제외 · KST 자정 버킷 `(created_at at time zone 'UTC' + interval '9 hours')::date` · `user_id IS NULL OR …` 3값 가드.

## 1차 판독 기준선 (2026-09-28 ~ 10-02, 5일)

- 고유 방문자 **20명**(사이트 UV 의 3.5~9.7%), 일별 UV 3·2·8·4·3 · **재방문 0명** · 출석 11명 전원 1일 · 구독 **0건**
- 입구: `byeolmaru_no_profile` **16명** · 게스트 프로필 CTA 클릭 10명 · 날짜 선택 5명
- 페이월: 노출 9명 → 체험 시작 3명 → 구독 클릭 0 → 완료 0
- LLM 원가 5일 ₩14.73
- 가드레일(직전 4일 → 직후 4일): 가입 110→90 · 타로 리딩 108→91 · 타로 별 소모 1,560→1,297 · 결제 매출 ₩15,200→₩21,100
- ⚠️ 유료 운세 리포트 구매 09-20~27 18건 → 09-28 이후 5일 1건 — 결제 경로는 살아 있음(10-01 정상 1건), 원인 미확정("의심")

## 다시 읽을 때 주의

- **10-02 이후 입구가 바뀐다** — 홈 진입 카드·하단탭 "오늘 거리" 점(prod 10-02 `030905ba`), 생일 벽 인라인 입력(`/mypage` 이탈 제거 — 스펙 `docs/superpowers/specs/2026-10-02-생일벽-인라인-입력-design.md`). 그래서 `no_profile` 이후 단계는 **배포일 전후를 갈라** 읽을 것. 생일 입력 자체는 `birth_prompt_clicked`/`birth_prompt_saved{surface:"byeolmaru_hub"…}` 로 본다(신규 입력 = `hadBirth=false`).
- 재방문·구독은 분자가 한 자릿수라 퍼센트가 아니라 **실인원**으로 읽는다.
