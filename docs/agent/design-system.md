# 별콩톡 디자인 시스템

> `AGENTS.md` 에서 뺀 절. 화면 일을 할 때 읽는다. 정본은 `app/globals.css` `@theme` 블록.


`app/globals.css` `@theme` 블록이 정본.

| 키 | HEX | 용도 |
|---|---|---|
| `cream` / `cream-warm` | `#FAF6F0` / `#FFF8F0` | 메인 배경 / 카드·패널 |
| `lilac-soft` / `lilac` / `lilac-mid` / `lilac-deep` | `#E8DEF5` / `#D4C7EE` / `#B8A8D8` / `#9F8AD0` | 보조배경·hover / 강조 / 보더 / 액티브 |
| `gold` / `gold-soft` | `#E8C26A` / `#F2D78A` | 포인트(별·CTA) / 글로우 |
| `eye-purple` / `text-light` | `#5A3E8C` / `#7A6BA0` | 본문 / 보조 텍스트 |
| `night` / `night-deep` | `#1F1735` / `#2A1F4D` | 다크 영역(사주판) |

- 그라데이션: 메인 배경 `cream`→`lilac-soft`(html) / 다크 영역 `night`→`night-deep` + 금색 별 파티클
- 애니메이션: `animate-float`(3s) · `animate-star-twinkle`(2.5s) · `animate-fade-in`(0.5s)
- 모티프: 4·8꼭지 별(액센트·로딩·구분선) · 구름/물결(섹션 배경) · 금테+태슬(유료 카드) · `rounded-2xl` 이상 기본
- 오행 색상은 별콩이 톤(전통 채도와 다름) — `components/saju/SajuBoard` 의 `ELEMENT_COLORS`. 일관 유지

