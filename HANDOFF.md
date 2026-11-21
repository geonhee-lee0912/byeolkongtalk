# HANDOFF — 우리 사이·연애 시뮬 서비스 종료 — 입구를 막고 두 화면을 종료 안내로 바꾼다(데이터는 그대로)

- 마지막 갱신: 2026-11-21 · 자리: 로컬(Windows, Claude, 워크트리 `.claude/worktrees/close-relationship`)

## 목표
운영자 결정(우리 사이·연애 시뮬을 종료한 서비스로)에 따라 사용자 화면의 입구를 전부 막고 `/relationship`·`/relationship/sim` 을 종료 안내 화면으로 바꾼다. DB·마이그레이션·어드민은 손대지 않는다.

## 지금 상태
- origin/dev 에서 브랜치를 땄다. 전 화면(홈·사용법·보관함·마이·두 화면) 390 폭 사진을 바꾸기 전에 찍어 둠(로컬 scratchpad).

## 다음 할 일
- [어디서든] 입구 막기: 홈 고정 카드·홈 캐러셀 sim 카드·사용법 칸·`/start?v=relationship`·보관함 시뮬 탭·마이 보관함 요약 두 칸·타로/운세 결과의 '연애 상담으로 돌아가기'·앱 껍데기 화면 표
- [어디서든] 두 화면 → 종료 안내(별콩이 그림·한 문단·홈으로/보관함으로)
- [어디서든] 타입·전체 테스트
- [로컬에서] 390 폭 전후 사진 · PR(base dev) · `@codex review`

## 운영자에게 물을 것 — `/api/relationship/*` 를 서버에서도 막을지 (돈 경로라 되돌리기 어려운 일)
화면 입구를 다 막아도 API 는 열려 있다(옛 탭·직접 호출로 새 대화·결제가 가능). 라우트별 판단:

| 라우트 | 하는 일 | 판단 |
|---|---|---|
| `GET /api/relationship` | 관계 목록 | **열어 둔다** — 마이(`app/mypage/page.tsx`)가 '이 프로필은 관계에 쓰이는 중' 판정에 쓴다. 쓰기 없음 |
| `PATCH /api/relationship` | 내 프로필·상대 정보 수정 | 열어 둔다(돈 없음, 쓰는 화면이 사라져 실제 호출 0) |
| `POST /api/relationship` | 새 상대 등록 | 막을 후보(410) |
| `POST /api/relationship/chat` | 상담 대화(무료 3턴 뒤 별 차감·이용권) | **막을 후보(410)** — 별 차감 |
| `POST /api/relationship/pass` · `/extend` | 이용권 구매·연장(별 차감) | **막을 후보(410)** — 별 차감 |
| `GET·POST /api/relationship/slot` | 상대 칸 추가(별 차감 가능) | 막을 후보(GET 은 열어 둬도 무해) |
| `POST /api/relationship/sim` · `/sim/chat` | 시뮬 새 판·대화(별 차감 가능, 모델 호출) | **막을 후보(410)** |
| `POST /api/relationship/sim/feedback` | 인형 대사 👍/👎 → 상대 성격 메모(돈 없음) | 막을 후보(쓰기) |
| `GET /api/relationship/sim` · `/sim/quote` | 지난 판 읽기·가격 | 열어 둬도 무해(읽기) |

- 추천: 쓰기(POST) 7곳만 `410 { error: "service_closed" }` 로 막고 GET·PATCH 는 둔다. 살아 있는 이용권이 없어 환불 대상은 없다.
- 막는다면 별·결제 경로라 PR 을 따로 내고 Claude `/code-review` + Codex 리뷰를 받는다(규칙). 이 브랜치는 화면만 바꾼다.

## 확인 못 한 것
- (작업 중)

## 건드리면 안 되는 것
- 별마루 '우리 오늘'(`/byeolmaru/day?tab=woori`, `byeolmaru_watch`) — 다른 기능
- `app/admin/*`·`supabase/migrations/`·데이터
- 환불 정책(`app/refund/page.tsx`)의 '연애 상담 패스' 문구 — 약관이라 운영자 결정
- 타로 '관계 스프레드'(`tarot:relationship_5`) — 우리 사이와 다른 타로 상품
