# HANDOFF — 카카오 닉네임 폴백에서 회원번호 빼기

- 마지막 갱신: 2026-11-22 · 자리: 로컬(Windows, Claude)

## 목표
카카오 프로필 닉네임이 없는 회원의 이름(`users.nickname`)에 카카오 회원번호를 넣지 않는다.

## 지금 상태
- **운영자 답 대기: 새 폴백 이름** — A `별친구` 고정(추천) / B `별콩이_` + 무작위 4자리(애플과 같은 모양) / C 직접 정한 글자. 코드는 아직 안 고쳤다.
- 만드는 곳은 둘뿐: `app/api/auth/kakao/route.ts`(웹 · 운영에도 있음) · `lib/auth/kakao-verify.ts`(앱).
- 퍼지는 곳: `/api/auth/me` → 헤더·마이·토스 `customerName` · 내 사주 저장 때 `user_profiles.display_name` 복사 → 궁합 `readings.saju_data.names`(화면용). 어드민 표시. 지금 AI 입력엔 닉네임·본인 이름이 안 간다(옛 대화 글에는 남았을 수 있다).
- 카카오 재로그인은 매번 `users.nickname` 을 덮는다(`lib/auth/sign-in.ts` loginExisting). A 는 그대로 두면 옛 값이 스스로 바뀐다. B 는 매번 숫자가 바뀌므로 '이름을 못 받으면 기존 값 유지' 분기가 더 필요하다.
- 건수 읽기 SQL 은 작성·로컬 검증 끝(저장소 밖, 운영자 전달용). 정리 SQL 은 이름이 정해진 뒤.

## 다음 할 일
- [어디서든] 답 반영: 기존 잠금 테스트(`kakao-callback`·`kakao-verify`)를 새 규칙으로 먼저 실패시킴 → 수정 → `nickname.ts` 머리 주석 → tsc·전체 테스트.
- [로컬에서] 정리 SQL(`users.nickname` 은 폴백 + 자기 `kakao_id` 와 정확히 같은 값만 · 복사본) 로컬 Postgres 검증 → 운영자 전달.
- [어디서든] 이 파일을 지우고 base `dev` PR + 반대편 리뷰 + Claude 코드 리뷰(로그인).

## 확인 못 한 것
- 운영에 해당 회원·복사본이 있는지(건수 SQL 은 운영자 실행).
- 카카오 콘솔에서 닉네임이 필수 동의인지 선택인지.

## 건드리면 안 되는 것
- 원장 해시 공식(`lib/auth/identity-hash.ts`) · 운영 DB 쓰기 · 머지 · 운영 배포 · geonhee-lee0912/byeolkongtalk#48 의 변경 범위.
