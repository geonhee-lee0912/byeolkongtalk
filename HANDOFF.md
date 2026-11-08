# 앱 화면 전체 손보기

- 마지막 갱신: 2026-11-08 · 자리: 로컬(운영자 PC, Claude Code)
- 목표: 앱 화면 손보기 3단계 — 남은 시트·팝업 27개를 공통 Sheet·Dialog·겹창 스택으로 옮긴다. 웹 모양 그대로. 계획 `docs/superpowers/plans/2026-11-08-앱-화면-3-나머지시트.md`, 스펙 `docs/superpowers/specs/2026-11-07-앱-화면-design.md` §8
- 지금 상태: 계획 Task 1~5 구현·커밋 완료(타입·테스트·빌드 통과, 앱 흉내 헤드리스 확인). 최종 리뷰 진행 중. 이 브랜치는 `claude/app-screens-2`(PR #38, 머지 대기) 위에 쌓았다 — #38 이 dev 에 머지된 뒤 PR(base dev)을 연다
- 다음 할 일: [어디서든] 최종 리뷰 Critical·Important 고침 → HANDOFF 지우고 ROADMAP 정리 → #38 머지 뒤 PR(base dev) + `@codex review`
- 확인 못 한 것: 실기기 전부(디자인 다듬기 뒤 빌드 1회에서) · 우리 사이 카드 뽑기 안 별 확인의 클릭 번짐(QA봇에 대화 없음) · 결제창까지 가야 열리는 상태
- 건드리면 안 되는 것: 겹창 안의 결제·별·저장 로직과 history 연동(옮기기만) · 운영 배포(앱 출시 때)
