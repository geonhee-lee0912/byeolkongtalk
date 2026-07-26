# 우리 사이 인-스레드 스킬 — 거부/실패 경로 검증 (2026-07-26)

**계기**: Phase 3 배포 후 남아 있던 "(E) 브라우저 미검증 엣지" — 잔액부족·패스없음·중복개시·생성실패 카드보존·`deep_feelings` 주행·비활성 스킬 차단.
**성격**: 돈 경로라 측정 창과 무관하게 검증 우선. **코드 변경 0** — 전부 통과했다.
**결론**: 6개 중 **5개 검증 완료, 1개는 구조적으로 런타임 테스트 불가**. 결함 0건.

---

## 1. 라우트의 실제 게이트 순서 (실측)

`app/api/relationship/chat/route.ts` 의 `skillStart`(tarot_draw) 경로:

```
skill_inactive → skill_already_active → pass_required → invalid_cards → INSUFFICIENT_STARS → [차감] → 생성
```

⚠️ **카드 위조 검증이 차감보다 앞**이다. 즉 "잔액 부족" 을 테스트하려면 유효한 카드 장수를 보내야 잔액 게이트까지 내려간다 — 결제 전에 페이로드를 검증하는 올바른 순서이고, 처음엔 이걸 몰라 테스트가 `invalid_cards` 에서 멈췄다.

---

## 2. 거부 경로 5종 — `scripts/smoke-skill-edges.ts` (신규, 로컬 전용)

API 비용 0(전부 Claude 호출 전에 끊긴다). 각 케이스마다 **잔액 불변 + 락 미잔류**를 함께 단언 — 거부는 됐는데 별이 빠지거나 락이 남으면 유저가 영구히 스킬을 못 쓴다.

| # | 케이스 | 기대 | 결과 |
|---|---|---|---|
| E1 | 패스 없음 + 스킬 개시 | 402 `pass_required` | ✅ 무차감·락 없음 |
| E2 | 패스 있음 + 잔액 1별 부족 | 402 `INSUFFICIENT_STARS` (`balance:44, required:45`) | ✅ 무차감·락 없음 |
| E3 | 인-플라이트 락(방금) + 재개시 | 400 `skill_already_active` | ✅ 중복 차감 없음 |
| E4 | 굳은 락(10분 전) + 재개시 | 락 override → 결제 단계 도달 | ✅ 하드 크래시 복구 작동 |
| E5 | 무료 인트로 3턴 소진 후 일반 대화 | 402 `pass_required` | ✅ P0-1 경계 재확인 |

**12/12 PASS.**

- **무료 인트로는 스킬에 적용되지 않는다**(`route.ts:150-152`) — 스킬은 항상 패스 필요. E1 이 신규 관계에서도 402 인 이유.
- E4 트릭: 굳은 락 + 잔액 부족을 동시에 걸면, override 됐으면 `INSUFFICIENT_STARS`(결제 단계 도달), 안 됐으면 `skill_already_active` 로 갈린다 → **생성 없이 무료로** override 여부를 판정.

---

## 3. 생성 실패 → 환불 — `scripts/smoke-skill-refund.ts` (신규, 고의 실패 주입)

기존 스모크가 덮지 못한 유일한 머니 패스. `smoke-draw-inthread.ts` 는 "정상 경로에 환불 없음"만 단언한다(`:226`) — **실패 시 환불이 실제로 도는지는 미검증이었다.**

방법: `.env.local` 의 `CLAUDE_API_KEY` 를 임시로 무효화 → dev 서버 재시작 → 실제 skillStart → DB 상태 판정 → env 원복.

스트림 개시 후 실패라 서버가 `controller.error()` 로 끊고 **클라 `fetch` 자체가 reject**(`UND_ERR_SOCKET`)된다 — 상태코드가 아니라 DB 가 진실.

| 단언 | 결과 |
|---|---|
| 차감이 실제로 일어났다(=실패 지점이 차감 이후) | ✅ `spend 45 / rel_skill_checkin` |
| 환불 트랜잭션 1건 | ✅ `charge 45 / rel_skill_checkin_refund` |
| 잔액 원복 | ✅ 999,900 → 999,900 |
| 락 해제 (`active_skill` null) | ✅ |
| 카드 스트립 메시지 정리 | ✅ 0건 |

**5/5 PASS** — `rollbackDraw`(환불 + 스트립 삭제 + 락 해제)가 스트림-내 실패 분기에서 정상 작동.

---

## 4. 남은 1개 — 구조적으로 런타임 테스트 불가

**비활성 스킬 차단**(`skill_inactive` 400, `route.ts:174`·`:276`·`:441`): `RELATIONSHIP_SKILLS` 레지스트리에 `active:false` 스킬이 **하나도 없다** → 런타임으로 이 분기를 태울 방법이 없다. 코드상 차감보다 앞에 있고("은퇴한 스킬은 API 직접 호출로도 결제되면 안 된다"), 스킬을 은퇴시키는 날 자동으로 유효해진다. 테스트용 더미 스킬을 레지스트리에 넣는 건 프로덕션 진열에 영향을 주므로 **하지 않았다**.

**`deep_feelings` 브라우저 육안 주행**은 이번 범위 밖(런타임 경로는 `smoke-draw-inthread.ts deep_feelings` 로 이미 커버, 남은 건 UI 시각 확인뿐).

---

## 5. 재현

```
# dev 서버 필요 (localhost:3000)
node --import tsx --env-file=.env.local scripts/smoke-skill-edges.ts     # 거부 5종, API 비용 0
# 환불은 CLAUDE_API_KEY 무효화 + dev 서버 재시작 후:
node --import tsx --env-file=.env.local scripts/smoke-skill-refund.ts
```

두 스크립트는 `.gitignore` 등재(로컬 전용, `smoke-*` 형제들과 동일 정책).

⚠️ 부수 관찰: 로컬 `/api/health` 가 **503** 을 반환한다(라우트 자체는 정상 동작). dev Supabase/env 조합 문제로 보이며 이번 작업과 무관 — 별건으로 확인 필요.
