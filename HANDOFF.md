# Expo 오류 로그에 푸시 토큰이 남지 않게

- 마지막 갱신: 2026-11-22 · 자리: 로컬 Claude(워크트리 silly-panini-92c3ca)

## 목표
`lib/push/expo.ts` 가 요청 실패 때 Expo 의 errors 를 Error message 에 통째로 실어 `error_logs` 로 간다. Expo 문서: `PUSH_TOO_MANY_EXPERIENCE_IDS` 의 details 에 요청한 푸시 토큰 목록이 들어 있다. 상태 코드와 오류 code 만 남긴다. 운영자 11-22 "새 세션 말고 여기서".

## 지금 상태
- 브랜치만 땄다. 로그에 남은 토큰 행은 운영·dev 모두 없음(읽기 전용으로 셈).

## 다음 할 일
- [어디서든] 실패하는 시험 → 최소 수정 → 타입·전체 테스트·빌드 → PR(base dev)·Codex.

## 확인 못 한 것
- 실제 Expo 에서 그 오류가 난 적은 없다(문서와 코드로만 확인).

## 건드리면 안 되는 것
- 재시도·선점 해제 동작 · 운영 DB.
