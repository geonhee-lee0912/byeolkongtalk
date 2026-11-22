# HANDOFF — 카카오 닉네임 폴백에서 회원번호 빼기

- 마지막 갱신: 2026-11-22 · 자리: 로컬(Windows, Claude)

## 목표
카카오 프로필 닉네임이 없는 회원의 이름(`users.nickname`)에 카카오 회원번호를 넣지 않는다.

## 지금 상태
- 폴백 두 곳 확인: `app/api/auth/kakao/route.ts` · `lib/auth/kakao-verify.ts`.
- 값이 퍼지는 곳(표시·저장·외부 전달) 전수 조사 중.

## 다음 할 일
- [어디서든] 새 폴백 문구를 운영자에게 묻는다 → 실패하는 테스트 → 수정 → tsc·전체 테스트.
- [어디서든] 이미 저장된 값을 세는 읽기 SQL·정리 SQL 을 운영자에게 전달(실행은 운영자).
- [어디서든] 이 파일을 지우고 base `dev` PR + 반대편 리뷰 + Claude 코드 리뷰(로그인).

## 확인 못 한 것
- 전부(방금 시작).

## 건드리면 안 되는 것
- 원장 해시 공식(`lib/auth/identity-hash.ts`) · 운영 DB 쓰기 · 머지 · 운영 배포 · geonhee-lee0912/byeolkongtalk#48 의 변경 범위.
