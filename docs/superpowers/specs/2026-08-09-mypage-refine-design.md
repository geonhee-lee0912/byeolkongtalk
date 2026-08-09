# 마이 탭 리파인 (보관함 압축 · 그라데이션 · 인라인 명식 · 소제목)

> 2026-08-09 브레인스토밍 확정. [[2026-08-08-mypage-readings-redesign-design]] 위에 얹는 **시각/레이아웃 리파인**.
> 관련: [[t1-ia-session-progress]]

## Goal

직전(08-08) 재설계로 마이가 "내 것들 허브"로 재구성됐지만, 사용자 피드백으로 4가지를 다듬는다.

1. 상단 보관함(타로/사주운세/시뮬/우리사이) **4개 독립 카드 → 한 박스 컴팩트**(≈2줄).
2. 프로필 헤더 **그라데이션 교체**.
3. 내 사주: **명식 인라인 노출** + 지인 사주는 **별도 팝업 목록**으로 분리.
4. 보관함·내 사주 블록에 **계정과 동일한 소제목** 부여.

## 08-08 설계에서 바뀌는 점 (명시)

- 08-08 결정 #2 "사주 프로필 = 요약 + 모달(명식 편집 **+ 지인**)"을 **부분 번복**한다.
  - 내 명식: 요약 한 줄 → **마이페이지에 SajuBoard 인라인 상시 노출**.
  - 지인 사주: 같은 모달 안 → **자체 팝업으로 분리**.
- 08-08 결정 #3 "보관함 진입 = 2×2 그리드 4카드" → **한 박스 가로 4분할(시안 3)**로 교체. 딥링크 동작·개수 집계는 그대로.

## 확정 결정 (브레인스토밍)

- **소제목 3개** — 계정 블록과 동일 스타일(작은 점 + 볼드 라벨): `보관함` / `내 사주` / `계정`.
  - "내 고민톡"이 아니라 **보관함**(사용자 지정).
- **보관함 박스 = 시안 3** — 흰 카드 하나, 가로 4분할, 칸 사이 세로 hairline 구분선. 각 칸: 상단에 `이모지 아이콘 + 개수`를 한 줄로 나란히, 그 아래 라벨(text-light, ~10.5px). 높이 ≈ 2줄.
  - 4칸: 🔮 타로 / 📜 사주·운세 / 🎭 시뮬 / 💬 우리 사이. 순서·라벨 현행 유지.
  - 각 칸 탭 → `/readings?tab=<key>` (현행 딥링크 유지). key = `tarot|fortune|sim|relationship`.
- **그라데이션 = B 딥 트와일라잇**: `night-deep(#2A1F4D) → eye-purple(#5A3E8C) → lilac-deep(#9F8AD0)`, 방향 `to-br`(135°).
  - 흰 글자 + 별 잔액 `gold-soft` 유지(어두워진 배경에서 대비 충분).
- **내 사주 블록**:
  - `self.saju` 있음 → **SajuBoard 인라인** + 하단 `수정` 버튼.
  - `self` 없음/`saju` 없음(생일 미입력) → CTA(`내 사주 입력하기` / `생일 추가하기`) → self 편집.
  - 그 아래 `지인 사주 N명 ›` **한 줄 행** → 지인 팝업 오픈.
- **지인 팝업** — 기존 `SajuProfileModal`의 지인 파트를 그대로 분리: 목록(3개/페이지 페이지네이션) · `+ 지인 추가` · 행별 케밥(⋮ → 수정/삭제) · 삭제 확인(연애 상담 사용 중 프로필 경고 체크 유지).

## 마이 화면 구조 (최종, 위→아래)

1. **프로필 헤더** — 프사 · 닉네임 · ⭐별 잔액 · 충전. 그라데이션 B. (구성 자체는 현행 유지, 배경만 교체.)
2. `● 보관함` 소제목 + **보관함 박스(시안 3)**.
3. `● 내 사주` 소제목 + **명식 인라인(또는 CTA)** + `수정` + `지인 사주 N명 ›` 행.
4. `● 계정` 소제목 + 계정 리스트(고객센터·안읽음 뱃지 / 결제·별 내역 / 회원 탈퇴) — **현행 유지**.
5. 로그아웃 버튼 · 회원 탈퇴 확인 모달 · Footer — **현행 유지**.

## 컴포넌트 계획

### 1. `components/mypage/StorageSummary.tsx` — 재작성
- 현재 2×2 그리드(4개 `Link` 카드) → **한 카드 안 가로 4분할 스트립**(시안 3).
- props(`counts: Record<ReadingCategory, number>`) · 딥링크 대상(`/readings?tab=<key>`) **불변**.
- 마크업: `<div class="card flex">` + 4×`<Link class="col">`, 칸 사이 세로 구분선(`:not(:first) border-l` 또는 `col+col::before` 대응). 각 칸 = `아이콘+개수`(한 줄) / `라벨`(아래).
- 소제목은 컴포넌트 밖(page)에서 렌더(계정과 동일 위치·스타일 통일).

### 2. `components/mypage/SajuProfileModal.tsx` — 분해 후 삭제
두 책임을 각각의 단일 목적 컴포넌트로 옮기고 원본 삭제.

- **신규 `components/mypage/AcquaintanceListModal.tsx`** — 지인 팝업.
  - 기존 모달의 "지인 사주" 섹션 + 하위 모달(케밥 시트, 삭제 확인)을 **그대로 이관**.
  - props: `profiles`(또는 `acquaintances`), `relationshipProfileIds`, `onReload`, `onClose`.
  - 기능 보존: `+ 지인 추가`(ProfileForm mode="acquaintance") · 수정 · 삭제(연애상담 사용 경고 체크박스 게이트) · 3개/페이지 페이지네이션 · 배경 스크롤 잠금 · `createPortal`.
- **신규 `components/mypage/SelfSajuEditModal.tsx`** — 내 명식 편집.
  - `ProfileForm mode="self"`(`defaultSelfName`, `initial`, `submitLabel="저장하기"`, `loading`, `onSubmit`) + 취소.
  - props: `self`(ProfileItem|null), `selfDisplayName`, `onReload`, `onClose`.
  - 저장 = self 있으면 `PATCH /api/profiles/{id}`, 없으면 `POST /api/profiles`(기존 `saveSelf` 로직 이관).
  - ⚠️ 08-08 회귀였던 **"내 명식 재수정" 버튼 소멸**을 반복하지 말 것 — 명식이 이미 있을 때도 `수정`이 항상 이 모달을 연다.

### 3. `app/mypage/page.tsx` — 블록 재배치
- import: `StorageSummary`(재작성본) · `AcquaintanceListModal` · `SelfSajuEditModal` · `SajuBoard`. (`SajuProfileModal` 제거.)
- state: `showSajuModal` → `showAcqModal` + `showSelfEdit` 로 분리.
- 프로필 헤더 배경 클래스: `from-eye-purple via-lilac-deep to-eye-purple` → `from-night-deep via-eye-purple to-lilac-deep`.
  - ✅ 토큰 확인됨 — `globals.css @theme`에 `--color-night-deep` `--color-eye-purple` `--color-lilac-deep` 존재 → `from-night-deep via-eye-purple to-lilac-deep` 유효.
- 보관함: 기존 위치에 `● 보관함` 소제목 + `<StorageSummary counts={counts} />`.
- 내 사주: 기존 "요약 카드 + 관리 버튼" 블록을 아래로 교체
  - `● 내 사주` 소제목.
  - `self?.saju` → 카드로 감싼 `<SajuBoard saju={self.saju} />` + `수정`(→ `setShowSelfEdit(true)`).
    - `SajuBoard`는 자체 `max-w-md mx-auto px-5` 래퍼가 있으니 이중 패딩 안 나게 래핑(카드 패딩 최소화 또는 board 그대로 노출). 구현 시 실렌더로 확인.
    - `showDetail` 기본(true) 인라인 노출 — 일간·음양 요약까지. (원하면 false 로 축약 가능 — 열린 세부.)
  - `self?.saju` 없음 → CTA 버튼(→ `setShowSelfEdit(true)`).
  - `지인 사주 {acquaintanceCount}명 ›` 행(→ `setShowAcqModal(true)`).
- 계정 · 로그아웃 · 탈퇴 모달 · Footer: **손대지 않음**.

## 세부 동작 / 보존 계약

- 딥링크·개수 집계(`readingCategory`, `relationshipCount`) 로직 불변.
- 지인 삭제 시 `relationshipProfileIds.includes(id)` 경고 체크 게이트 유지.
- 배경 스크롤 잠금·`createPortal`·닫기(스크림 클릭/✕) 패턴 유지.
- 그라데이션 외 프로필 헤더 마크업(프사 fallback=별콩이, 충전 링크) 불변.

## 스코프 밖 (이번 안 함)

- 보관함(`/readings`) 내부 · `/api/readings` · 설문 · 가격 비교 · 인형 실에셋 · 카톡 프사 OAuth.
- 명식 계산/데이터 로직(`calcSaju`·`/api/profiles`) 변경 없음 — 표시 위치만 이동.

## 열린 세부 (구현 중 확정)

- 인라인 `SajuBoard` `showDetail` true/false (정보량 vs 높이).
- `SelfSajuEditModal`을 별도 파일 vs `AcquaintanceListModal`과 한 파일 공존 — 파일 분리 권장(단일 목적).
- 보관함 스트립에서 `사주·운세` 라벨 1줄 유지되는 최소 폰트(≤10.5px) 실렌더 확인.

## 구현 후 조정 (2026-08-09 리뷰, dev 실렌더 반영)

- **명식 인라인 `showElements` 옵트인 기각** — 오행 박스를 마이페이지에서만 숨기려 했으나 `SajuBoard`가 8곳 공유라 일관성 문제. 삭제 취소하고 대신 **공유 레이아웃 조정**: 오행 박스 폭을 위 8기둥 판(`max-w-[300px]`)에 정렬 + `showDetail`의 일간·음양을 카운트 아래 **별도 한 줄**로 분리(기존은 카운트와 같은 flex-wrap). 순수 프레젠테이션이라 전 사주판 공통 적용.
- **수정 버튼** = 명식 카드 하단 밑줄 → **`내 사주` 소제목 행 우측 끝** pill(`self.saju`일 때만). 지인 행 `›` → **관리** pill. 두 pill 동일 스타일(`bg-lilac-soft/60`).
- **지인 팝업 추가 폼 ↔ 목록 디바이더** 추가(폼 열림 + 지인 ≥1일 때). 스크롤은 기존 모달 박스 스크롤 유지(별도 변경 없음).
