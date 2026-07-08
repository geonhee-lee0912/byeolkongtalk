# 유저 안내 팝업 (개별+전체 발송) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민이 특정 유저 또는 전체 유저에게 1회성 안내 팝업을 발송하고, 유저가 "확인"을 눌러야 소멸되는 시스템.

**Architecture:** `popups`(본체, target_user_id NULL=전체) + `popup_acks`(유저별 확인) 2테이블. 어드민 발송/회수 API + 유저 조회/ack API + AppShell 통합 모달. 스펙: `docs/superpowers/specs/2026-07-09-user-popup-design.md`

**Tech Stack:** Next 16 App Router, Supabase(service_role), 기존 requireAdmin/logAdminAction/포털 모달 패턴 재사용.

**검증 컨벤션:** 테스트 프레임워크 없음 — 각 태스크는 `npx tsc --noEmit` + `npm run build` 통과 후 커밋. DB 동작은 dev Supabase 상대 임시 스크립트로 확인, E2E 는 dev 배포 후 브라우저 확인.

---

### Task 1: 마이그레이션

**Files:** Create `supabase/migrations/20260709000000_user_popups.sql`

- [ ] SQL 작성 (inquiries 마이그레이션 스타일):

```sql
-- 20260709000000_user_popups.sql — 어드민 발 1회성 안내 팝업 (개별 + 전체 발송)
CREATE TABLE IF NOT EXISTS popups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = 전체 발송
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS popup_acks (
  popup_id        UUID NOT NULL REFERENCES popups(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (popup_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_popups_target ON popups(target_user_id, created_at);

ALTER TABLE popups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE popup_acks ENABLE ROW LEVEL SECURITY;
-- RLS 정책 미추가: 기존 테이블과 동일하게 service_role 로만 접근.
```

- [ ] 커밋 + dev push (Supabase dev 브랜치 자동 적용) → Workflow logs SUCCESS 확인

### Task 2: 어드민 발송/회수 API

**Files:**
- Create `app/api/admin/popups/route.ts` (POST 발송)
- Create `app/api/admin/popups/[id]/route.ts` (DELETE 회수)
- Modify `lib/admin-actions.ts` — AdminActionName 에 `"popup_send" | "popup_revoke"` 추가

- [ ] POST: requireAdminWrite → body `{ title, body, targetUserId? }` 검증(title 1~100자, body 1~2000자, targetUserId UUID면 존재 확인) → popups INSERT → logAdminAction(popup_send, target_type "popup")
- [ ] DELETE: requireAdminWrite → popups 삭제(acks CASCADE) → logAdminAction(popup_revoke)
- [ ] tsc + build → 커밋

### Task 3: 유저 조회/ack API

**Files:**
- Create `app/api/popups/route.ts` (GET — 내 미확인 팝업 중 가장 오래된 1건)
- Create `app/api/popups/[id]/ack/route.ts` (POST — 확인 기록, 멱등)

- [ ] GET: getSession → 401 if 미로그인 → popups `.or(target_user_id.eq.<me>,target_user_id.is.null)` created_at asc → 내 acks 제외 후 첫 건 반환 `{ popup: { id, title, body } | null }`
- [ ] ack POST: getSession → 대상 검증(target null 또는 나) → popup_acks upsert(onConflict popup_id,user_id / ignoreDuplicates) → 200
- [ ] dev DB 임시 스크립트로 시나리오 검증(개별/전체/ack 후 미노출/멱등) 후 스크립트 삭제
- [ ] tsc + build → 커밋

### Task 4: 유저 모달 + AppShell 통합

**Files:**
- Create `components/popup/UserPopupGate.tsx` (client — fetch + 포털 모달, ContinuationModal 스타일)
- Modify `components/layout/AppShell.tsx` — shell 보이는 분기에 `<UserPopupGate />` 추가

- [ ] Gate: 마운트 1회 GET /api/popups → 없으면 null 렌더. 있으면 createPortal 모달(cream 카드, 별콩이 이미지, title/body(pre-wrap), "확인했어" 버튼) → POST ack 후 닫기. 실패 시 조용히 닫기(다음 진입 재노출)
- [ ] AppShell: hide 분기(login/admin/start)엔 미부착 — 스펙의 노출 제외 요건 자동 충족
- [ ] tsc + build → 커밋

### Task 5: 어드민 UI

**Files:**
- Create `app/admin/popups/page.tsx` (server — 발송 목록 + 확인수/유저수)
- Create `components/admin/PopupAdmin.tsx` (client — 전체 발송 폼 + 회수 버튼)
- Create `components/admin/PopupSend.tsx` (client — 유저 상세용 개별 발송 폼)
- Modify `app/admin/layout.tsx` — nav 에 `{ href: "/admin/popups", label: "공지 팝업", emoji: "📢" }`
- Modify `app/admin/users/[id]/page.tsx` — 팝업 섹션(발송 폼 + 해당 유저 이력)

- [ ] /admin/popups: popups 전체 + popup_acks 카운트 + users 총수 → 행별 "확인 n/m" + 회수 버튼. 전체 발송 폼은 confirm("전 유저에게 노출됩니다...") 1회
- [ ] 유저 상세: PopupSend(제목/내용 → POST targetUserId 포함) + 그 유저 대상 발송 이력(확인 시각)
- [ ] tsc + build → 커밋 → dev push → main ff

### E2E 검증 (dev/prod)

- [ ] 어드민: 내 계정에 개별 발송 → 홈 진입 시 모달 → "확인했어" → 재진입 시 미노출
- [ ] 전체 발송 → 다른 계정(또는 시크릿창 새 계정)에서 노출 확인 → 회수 → 미노출
