# 가격 조정 — 첫 충전 보너스 축소 + 연애 상담 패스 인상 — 설계

**작성일**: 2026-07-20 · **상태**: 브레인스토밍 완료 · 사용자 승인 → 구현
**배경**: 수익성/마진 + 리텐션. 별 원가는 낮아 별당 마진은 이미 크지만, 무료·보너스 별이 후해서 첫 결제 후 재결제가 안 일어남(리텐션 0, 전환 75%가 갭 결제). 첫 충전 보너스 축소 = 마진 + "한 번에 많이 주지 말고 재결제 유도". 연애 상담은 신상품 수익성 확보.
**작업 큐**: `memory/w1-w7-work-queue.md` "3f 이후 후속 ②③".

## 결정

**첫 결제 할인** — 첫 충전 보너스 **+50% → +20%** (`FIRST_CHARGE_BONUS_RATE` 0.5→0.2). 예: 30별 결제 45→36별, 10별 15→12별.

**연애 상담 패스** — `PASS_PLANS` cost **1일 20→30 · 3일 40→60 · 7일 60→100** (C2안). 라벨(시간 표기)·스킬(45/40/40/30)·소프트캡(20턴)·연장(5별) **유지**.

## 정합 (웰컴 30별 기준)
- 1일 30 = 웰컴 30별 딱(트라이얼 소진용). 첫 유료 진입은 3일부터.
- 3일 60 = star_30×2 / 웰컴30+star_30.
- 7일 100 = **star_70+star_30(₩8,700)** / 웰컴30+star_70. 일당 최저(14)라 장기권 유도 유지.

## 영향 파일 (마이그레이션 없음)
- `lib/constants.ts` — `FIRST_CHARGE_BONUS_RATE` 0.5→0.2
- `lib/relationship/types.ts` — `PASS_PLANS` cost 30/60/100
- `lib/relationship/types.test.ts` — 패스 값 테스트 30/60/100
- `app/shop/page.tsx` — "+50%" 문구 2곳 → "+20%" (실 보너스는 상수 계산이라 값은 자동, 문구만)
- `components/upsell/ResultUpsell.tsx` · `components/upsell/RechargeBlock.tsx` — "+50%" 문구 → "+20%"
- `components/relationship/PassPanel.tsx` — 패스 가격 렌더가 `PASS_PLANS` 참조면 자동, 하드코딩이면 수정(구현 시 확인)
- `purchase_relationship_pass` RPC는 서버가 `PASS_PLAN_BY_KIND[kind].cost`로 확정하니 상수만 바꾸면 반영(클라 cost 위조 무관).

## 리스크
- **이중 인상**(첫결제 축소 + 패스 인상) → 신상품 초기 진입·갱신 저하 가능. **`/admin/relationship`(방금 신설)로 패스 구매·갱신율 추적**하며 조정.

## 배포
3e prod 일괄 편입 vs 별도 — 사용자 결정.
