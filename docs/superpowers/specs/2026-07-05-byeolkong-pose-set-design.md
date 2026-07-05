# 별콩이 상황별 이미지 8종 — 디자인 스펙 (2026-07-05)

## 배경

`byeolkong-main.png` 단일 이미지가 서비스 17곳+에 재사용 중 (`byeolkong-hero.png` 2곳, `profile.png` 얼굴 크롭 아바타 4곳). 상황(기다림/축하/고민 입력/에러)과 무관하게 항상 같은 포즈 → 감정 맥락에 맞는 포즈 세트를 추가한다.

## 스타일 고정

- 플랫 파스텔 일러스트 (**광고 소재의 3D 인형 스타일 금지**)
- 크림 + 라일락 + 골드 팔레트, 이마 별·후광·귀 장식·펜던트 유지
- 투명 배경 PNG (단색 배경 생성 → remove_background)
- 레퍼런스: `public/byeolkong-main.png` (nano_banana_pro 캐릭터 레퍼런스 — 광고 소재 세션에서 검증된 파이프라인)

## 이미지 8종

| # | 파일 | 포즈 | 배치 대상 |
|---|---|---|---|
| 1 | `byeolkong-listen.png` | 몸 살짝 기울여 두 손 모으고 경청 | /concern, /saju/concern 고민 입력 |
| 2 | `byeolkong-focus.png` | 수정구슬 별빛 들여다보며 집중 | 운세 생성 로딩, 사주 풀이 대기 |
| 3 | `byeolkong-joy.png` | 별 뿌리며 폴짝, 활짝 웃음 | 웰컴 별 모달, 결과 도착 |
| 4 | `byeolkong-curious.png` | 고개 갸웃 + 물음표 별 | 404/에러, 내 고민톡 빈 상태 |
| 5 | `byeolkong-tarot.png` | 타로 카드 부채꼴로 든 포즈 | /tarot 홈 |
| 6 | `byeolkong-saju.png` | 펼친 두루마리 읽는 포즈 | /saju 입력 |
| 7 | `byeolkong-shop.png` | 별 가득 든 주머니 안은 포즈 | /shop, 충전 유도 |
| 8 | `byeolkong-cheer.png` | 두 팔 들어 응원 | 결과 마무리 카드, 마이페이지 |

## 파이프라인

포즈당 2안(총 16장) 생성 → 사용자 선택 → remove_background → `public/` 추가 → 화면별 `src` 교체(레이아웃 변경 없음) → 빌드 + preview 검증 → dev push. 남는 자리(푸터/어드민 등)는 `byeolkong-main.png` 유지.

## 크레딧

힉스필드 잔액 ~266에서 시작. 16장 예상 60~160. 부족 시 사용자에게 알리고 조정.
