# HANDOFF — 안드로이드 앱의 FCM 자동 등록 끄기

- 마지막 갱신: 2026-11-22 · 자리: 로컬(Windows, Claude)

## 목표
안드로이드 앱이 첫 실행 때 Google(FCM)에 자동 등록하지 않게 `firebase_messaging_auto_init_enabled=false` 를 매니페스트에 넣는다(운영자 11-22 "알림-4B 자동 등록 끔"). 토큰은 지금 코드대로 로그인 + 알림 허용 때 `getExpoPushTokenAsync` 로만 받는다.

## 지금 상태
- 브랜치만 만들었다. 실패하는 테스트부터.

## 다음 할 일
- [로컬에서] 테스트 → `mobile/plugins` 설정 플러그인 → prebuild 로 만든 매니페스트 확인 → 타입·전체 테스트 → 이 파일을 지우고 base `dev` PR + `@codex review`.

## 확인 못 한 것
- 실기기 통신·알림 수신(다음 안드로이드 빌드).

## 건드리면 안 되는 것
- 개인정보처리방침·약관(따로 진행, 문구 승인 전) · 머지 · 운영 배포 · EAS 빌드.
