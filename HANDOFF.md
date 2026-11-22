# HANDOFF — 탈퇴 실패 때 별만 먼저 지워지는 것 고치기

- 마지막 갱신: 2026-11-22 · 자리: 로컬(Windows, Claude)

## 목표
탈퇴 마지막 `users` 삭제가 실패해도 남은 회원의 별 잔액·내역이 그대로 있게 한다.

## 지금 상태
- 확인됨(가짜 DB + 실제 라우트): `app/api/auth/withdraw/route.ts` 가 `users` 삭제 전에 `star_transactions`·`star_balances` 를 따로 지운다. 운영·dev 공통.
- FK 전수 조사와 실제 Postgres 재현 중.

## 다음 할 일
- [로컬에서] 전체 마이그레이션을 올린 Postgres 에서 CASCADE 만으로 탈퇴가 되는지 확인 → 실패하는 테스트 → 수정.
- [로컬에서] 이미 피해를 본 회원을 세는 읽기 SQL → 운영자 전달(실행은 운영자).
- [어디서든] 이 파일을 지우고 base `dev` PR + 반대편 리뷰 + Claude 코드 리뷰(탈퇴·별).

## 확인 못 한 것
- 운영 피해 여부 · 운영 FK 가 마이그레이션과 같은지.

## 건드리면 안 되는 것
- 탈퇴 때 무엇을 얼마나 보관할지(별도 결정 4-2·`claude/retention-purge`) · DB 구조 · 운영 DB 쓰기 · 머지 · 운영 배포.
