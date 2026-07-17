# W3 — 열린 수렴 → 결과화면 단절 해소 (설계)

**작성일**: 2026-07-17
**근거**: [2026-07-16 findings](2026-07-16-paywall-funnel-extension-findings.md) §4·§7 — 증발 27건(42%) 전원 결과 화면 미도달 → C2(추천 카드)·공유·이어가기 CTA 전부 미노출. 재방문 실유저 0이므로 사후 회생만으로는 볼 사람이 없음 → **세션 내 출구가 주공, 사후 회생은 후방(+W5 알림 랜딩 인프라)**.

## 방향 결정 (사용자 확정)

- **C 세트**: B(세션 내 출구) 주공 + A(사후 회생) 후방 + 정리요약 auto-END
- 출구 형태: **별콩이 멘트 + [결과 카드 보기] 칩** (기존 idle nudge 패턴 확장, 로컬 고정 문구 — API 호출 없음)

## 1. 세션 내 출구 (주공)

### 서버 — wrap-mode 헤더
- 사주/타로 chat 라우트가 응답 헤더 `X-Wrap-Mode: free | converge | hardcap` 추가.
- 판정은 라우트가 이미 보유한 값(assistantTurnsSoFar+1, 누적 chars, 임계치 override)으로 계산 — `lib/claude.ts`의 wrap-mode 로직과 동일 기준.

### 클라 — 출구 nudge (양쪽 reading 페이지)
- **발동 조건**: (wrap-mode ≥ converge) OR (해당 메시지에 RECO 칩 부착). free 모드 초반엔 발동 X (상담 얕아짐 방지 — 초반 증발은 W4 몫).
- **타이밍**: 마지막 assistant 메시지 완료 후 무응답 `IDLE_EXIT_MS = 60_000`.
- **표현**: 별콩이 로컬 말풍선 1개(고정 문구 풀에서 랜덤) + 말풍선 아래 [결과 카드 보기] 칩.
  - 문구 예: "오늘은 여기까지 해도 충분해. 지금까지 얘기, 결과 카드로 만들어둘게 — 보고 갈래?"
- **칩 클릭** = 기존 forceEnd 흐름 재사용 (고정 마무리 문구 전송 → 그레이스풀 마무리 + [END] → 결과 자동 이동). 칩 경유 문구는 고정이라 DB에서 식별 가능 → "출구 칩 전환율" 사후 측정.
- tarot: 기존 NUDGE_STAGE_1/2 유지, 출구를 3단계로 추가. saju: nudge 인프라 없음 → 출구 단계만 이식.
- 로컬 멘트는 DB 저장 X (클라 표시 전용, 히스토리 전송에서도 제외).

## 2. 사후 회생 (후방)

- `/api/readings` GET: `ended=false` && 마지막 메시지 `STALE_RESULT_MS = 6h` 이전 → `resultReady: true` (순수 lazy — DB 마이그레이션/cron 없음).
- 내 고민톡: `resultReady` 리딩은 카드 링크를 결과 화면으로, "이어하기" 칩 대신 "결과 보기".
- 결과 화면: END 없는 리딩도 렌더. 미완료(stale) 리딩엔 "이어서 대화하기" 보조 버튼 — resume 경로 보존.
- `extractClosingLine`이 [END] 없는 대화에서도 동작하는지 확인, 필요 시 보정.
- W5 카카오 알림("결과 카드 준비됐어")의 랜딩이 됨.

## 3. 정리요약 auto-END

- `lib/claude.ts` dynamicPart 상시 규칙 1줄: 사용자가 명시적으로 정리/요약 요청 시 그 턴은 요약 + 그레이스풀 마무리 + [END].
- ⚠️ 프롬프트 변경 — QA 하네스 검증 필수, dev 서버 재시작 함정 주의.

## 상수 (튜닝 가능)

| 상수 | 값 | 위치 |
|---|---|---|
| IDLE_EXIT_MS | 60초 | reading 페이지 |
| STALE_RESULT_MS | 6시간 | /api/readings |
| 출구 발동 하한 | converge | wrap-mode 헤더 기준 |

## 검증 계획

1. QA 하네스: converge 도달 케이스 → `X-Wrap-Mode` 헤더 전이(free→converge→hardcap) 확인 / 정리요약 요청 → [END] 종료.
2. 브라우저(로컬): converge까지 대화 → 60초 방치 → 멘트+칩 → 클릭 → forceEnd → 결과 화면 도달.
3. stale: dev DB 오래된 미완료 리딩 → 리스트 "결과 보기" → 결과 렌더 + "이어서 대화하기" 동작.

## 성공 지표 (다음 분석 사이클)

- abandon_mid 비율 42% → 감소 / 증발 유저 결과 도달률 0% → 상승
- 출구 칩 노출 대비 클릭률
- C2: next_reco 노출 기회 회복 → 이어가기 전환 1건 → 증가
