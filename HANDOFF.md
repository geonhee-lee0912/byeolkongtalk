# HANDOFF — 보유 기간이 지난 개인정보 자동 파기 (예약 작업)

- 마지막 갱신: 2026-11-22 · 자리: 로컬(Windows, Claude — 약관·방침 세션)

## 목표
geonhee-lee0912/byeolkongtalk#53 의 `purge_expired_records` 를 매일 부르는 Vercel cron(운영자 결정 애플-4-1A).

## 지금 상태
- 시작. env `RETENTION_PURGE=on` 이 없으면 세기만 한다 — 운영에서 켜는 것이 '첫 삭제 go'(운영자).

## 다음 할 일
- [어디서든] 실패하는 라우트 시험 → 라우트·vercel.json → tsc·테스트·빌드 → 초안 PR(#53 머지·Supabase success 뒤 ready).

## 확인 못 한 것
- 배포된 cron 의 실제 실행(운영 배포에서만 돈다).

## 건드리면 안 되는 것
- 운영 env·운영 DB·머지·배포.
