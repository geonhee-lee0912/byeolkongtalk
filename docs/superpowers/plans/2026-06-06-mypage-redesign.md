# 마이페이지(내 정보) 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마이페이지를 계정·프로필 허브로 재정렬한다 — 내 명식을 상단 프로필 카드로 통합, 모든 사주를 "사주 목록"에서 관리, 오행 분포를 한 줄로, 결제/별 내역 화면 + 고객센터 진입점 추가.

**Architecture:** `app/mypage/page.tsx` 재구성 + 공용 `SajuBoard` 오행 블록 한 줄화 + 신규 `/mypage/payments` 페이지 + 신규 `GET /api/stars/transactions`. 기존 `profiles` API / `ProfileForm` / 삭제 모달 / 별 잔액 카드 / 탈퇴 로직은 그대로 재사용.

**Tech Stack:** Next.js (App Router) + React 19 + Tailwind 4 + Supabase (service role). **테스트 프레임워크 없음** → 각 태스크 검증은 `npm run build`(타입체크 통과) + 로컬 dev 서버(`npm run dev`) 육안 확인.

**대상 레포/브랜치:** `C:\Users\c\Desktop\vibe\project\byeolkong_talk`, `dev` 브랜치.

**스펙:** `docs/superpowers/specs/2026-06-06-mypage-redesign-design.md`

**디자인 토큰(기존):** `cream-warm` `lilac-soft` `lilac-mid` `lilac-deep` `eye-purple` `gold` `gold-soft` `text-light` `rose-*`. 컨테이너 폭 `max-w-md mx-auto px-5`.

---

## File Structure

- `app/api/stars/transactions/route.ts` — **신규**. 로그인 유저의 `star_transactions` 최신순 반환. `/api/payments/list` 패턴 복제.
- `components/saju/SajuBoard.tsx` — **수정**. 오행 5줄 막대 블록(약 111–162행) → 한 줄 요약으로 교체.
- `app/mypage/page.tsx` — **수정**. 프로필 카드에 명식 통합 / "내 사주" 단독 섹션 제거 / "지인 사주"→"사주 목록"(나+지인, 탭 펼침) / 계정·고객 메뉴 + 약관 링크 추가.
- `app/mypage/payments/page.tsx` — **신규**. 결제 내역 + 별 내역 2탭.

각 파일은 독립적으로 빌드/동작 가능하도록 순서: API → 공용 컴포넌트 → 신규 페이지 → 마이페이지 재구성.

---

## Task 1: 별 내역 조회 API

**Files:**
- Create: `app/api/stars/transactions/route.ts`

참고 패턴(복제 대상): `app/api/payments/list/route.ts` — `getSession()` 로 userId, 없으면 빈 배열, `getServiceSupabase()` 로 select.

`star_transactions` 컬럼(확정): `id, user_id, type('charge'|'spend'|'bonus'|'refund'), amount, balance_after, source, payment_id, reading_id, created_at`. 인덱스 `(user_id, created_at DESC)` 존재.

- [ ] **Step 1: 라우트 작성**

Create `app/api/stars/transactions/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  charge: "충전",
  spend: "사용",
  bonus: "보너스",
  refund: "환불",
};

/** 현재 로그인 유저의 별 트랜잭션 내역 (최신순). 게스트는 빈 배열. */
export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ transactions: [] });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("star_transactions")
    .select("id, type, amount, balance_after, source, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("star transactions list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const transactions = (data ?? []).map((t) => ({
    id: t.id,
    type: t.type as "charge" | "spend" | "bonus" | "refund",
    typeLabel: TYPE_LABEL[t.type] ?? t.type,
    // charge/bonus/refund 는 +, spend 는 - 로 부호 표기
    signedAmount: t.type === "spend" ? -Math.abs(t.amount) : Math.abs(t.amount),
    balanceAfter: t.balance_after,
    source: t.source,
    createdAt: new Date(t.created_at).getTime(),
  }));

  return NextResponse.json({ transactions });
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run build`
Expected: 빌드 성공 (타입 에러 없음). `@/lib/supabase` `getServiceSupabase`, `@/lib/session` `getSession` import 가 해석되는지 확인 — 안 되면 `app/api/payments/list/route.ts` 의 import 경로와 동일하게 맞출 것.

- [ ] **Step 3: dev 서버에서 응답 확인**

Run: `npm run dev` 후 로그인 상태 쿠키로 `http://localhost:3000/api/stars/transactions` 호출.
Expected: `{ "transactions": [...] }` 형태. 별을 한 번이라도 쓴 계정이면 `type:"spend"` 항목이 보임. 비로그인은 `{ "transactions": [] }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/stars/transactions/route.ts
git commit -m "feat(api): 별 트랜잭션 내역 조회 GET /api/stars/transactions"
```

---

## Task 2: SajuBoard 오행 분포 → 한 줄

**Files:**
- Modify: `components/saju/SajuBoard.tsx` (오행 막대 블록 교체)

현재 `SajuBoard` 구조: 4기둥 그리드 → 시주 모름 안내 → **오행 막대 블록(`bg-cream-warm` 카드, 약 111–162행)**. 이 마지막 블록만 교체한다. `ELEMENT_COLORS`, `ELEMENTS`, `maxCount`, `totalElements`, `getStemElement/getBranchElement`, 4기둥 그리드는 **그대로 둔다**.

- [ ] **Step 1: 오행 막대 블록을 한 줄 요약으로 교체**

`components/saju/SajuBoard.tsx` 에서 `{/* 오행 막대 */}` 주석부터 그 `</div>` 닫힘까지(현재 약 111–162행, `<div className="bg-cream-warm rounded-xl p-4 ...">` … `</div>`)를 아래로 교체:

```tsx
      {/* 오행 한 줄 요약 */}
      <div className="bg-cream-warm rounded-xl px-3 py-2.5 border border-lilac-mid/30 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        {ELEMENTS.map((el) => {
          const count = saju.elementCount[el];
          const isMax = count === maxCount && maxCount > 0;
          return (
            <span
              key={el}
              className="inline-flex items-center gap-1 text-[12px]"
            >
              <span
                className={`inline-flex w-5 h-5 rounded items-center justify-center text-[11px] font-bold ${
                  isMax ? "ring-1 ring-eye-purple/40" : ""
                }`}
                style={{
                  backgroundColor: ELEMENT_COLORS[el].bg,
                  color: ELEMENT_COLORS[el].text,
                }}
              >
                {el}
              </span>
              <span className={isMax ? "font-bold text-eye-purple" : "text-text-light"}>
                {count}
              </span>
            </span>
          );
        })}
        <span className="text-lilac-mid/60 mx-0.5">·</span>
        <span className="text-[12px] text-text-light">
          일간 <span className="text-eye-purple font-bold">{saju.dayStem}</span>
          ({saju.dayElement})
        </span>
        <span className="text-lilac-mid/60 mx-0.5">·</span>
        <span className="text-[12px] text-text-light">
          양 {saju.yinYangCount.yang} · 음 {saju.yinYangCount.yin}
        </span>
      </div>
```

> 주의: `totalElements` 상수가 이 블록에서만 쓰였다면 교체 후 미사용 변수가 된다. `npm run build`(혹은 eslint)에서 경고/에러나면 `const totalElements = 8;` 선언 줄도 삭제할 것. `maxCount` 는 위 코드에서 계속 사용하므로 유지.

- [ ] **Step 2: 타입체크 + 미사용 변수 정리**

Run: `npm run build`
Expected: 성공. `totalElements` 미사용 에러가 나면 해당 선언 삭제 후 재빌드.

- [ ] **Step 3: dev 서버 육안 확인 (공용 영향 3곳)**

Run: `npm run dev` 후 확인:
- `/mypage` (명식 있는 계정) — 명식 아래 오행이 한 줄로 보임
- 사주 풀이 결과 화면 `/saju/result` — 동일하게 한 줄
- `/saju/concern` picker 에서 사주 선택 시 `SajuBoard` 영역 — 한 줄
Expected: 세 곳 모두 5줄 막대가 사라지고 `목N 화N 토N 금N 수N · 일간 X(목) · 양N 음N` 한 줄. 가장 많은 오행에 ring 강조.

- [ ] **Step 4: Commit**

```bash
git add components/saju/SajuBoard.tsx
git commit -m "refactor(saju): 오행 분포 5줄 막대 → 한 줄 요약 (공용)"
```

---

## Task 3: 결제 / 별 내역 페이지

**Files:**
- Create: `app/mypage/payments/page.tsx`

데이터 소스: `GET /api/payments/list` (Task 외 기존) → `{ payments: [{id, packageLabel, stars, amount, status, paidAt}] }`. `GET /api/stars/transactions` (Task 1) → `{ transactions: [{id, type, typeLabel, signedAmount, balanceAfter, source, createdAt}] }`. 잔액: `GET /api/stars/balance` → `{ balance }`.

- [ ] **Step 1: 페이지 작성 (2탭: 결제 / 별 내역)**

Create `app/mypage/payments/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Payment {
  id: string;
  packageLabel: string;
  stars: number;
  amount: number;
  status: "pending" | "completed" | "refunded";
  paidAt: number;
}

interface StarTx {
  id: string;
  type: "charge" | "spend" | "bonus" | "refund";
  typeLabel: string;
  signedAmount: number;
  balanceAfter: number;
  source: string;
  createdAt: number;
}

const PAYMENT_STATUS_LABEL: Record<Payment["status"], string> = {
  pending: "대기",
  completed: "완료",
  refunded: "환불",
};

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}`;
}

export default function PaymentsPage() {
  const [tab, setTab] = useState<"payments" | "stars">("payments");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [txs, setTxs] = useState<StarTx[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [pay, tx, bal] = await Promise.all([
        fetch("/api/payments/list", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/stars/transactions", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/stars/balance", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
      ]);
      if (pay?.payments) setPayments(pay.payments as Payment[]);
      if (tx?.transactions) setTxs(tx.transactions as StarTx[]);
      if (bal) setBalance(bal.balance ?? 0);
      setLoading(false);
    })();
  }, []);

  const totalCharged = payments
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + p.amount, 0);

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <Link href="/mypage" className="text-[12px] text-text-light/70">
          ‹ 내 정보
        </Link>
      </div>

      {/* 요약 */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div className="bg-gradient-to-br from-gold-soft/30 via-cream-warm to-lilac-soft/40 rounded-2xl p-4 border border-gold-soft/40 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-text-light/80 mb-1">현재 별 잔액</div>
            <div className="text-[20px] font-bold text-eye-purple">
              ⭐ {balance ?? 0}별
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-text-light/80 mb-1">누적 결제</div>
            <div className="text-[15px] font-bold text-eye-purple">
              {totalCharged.toLocaleString()}원
            </div>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="w-full max-w-md mx-auto px-5 mb-4 flex gap-2">
        {([["payments", "결제 내역"], ["stars", "별 내역"]] as const).map(
          ([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-xl text-[13px] font-bold ${
                tab === key
                  ? "bg-lilac-deep text-white"
                  : "bg-cream-warm text-text-light border border-lilac-mid/30"
              }`}
            >
              {label}
            </button>
          )
        )}
      </div>

      {/* 리스트 */}
      <div className="w-full max-w-md mx-auto px-5">
        {loading ? (
          <p className="text-text-light text-[13px] text-center py-8">잠시만…</p>
        ) : tab === "payments" ? (
          payments.length === 0 ? (
            <p className="text-text-light/70 text-[13px] text-center py-8">
              아직 결제 내역이 없어
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="bg-cream-warm rounded-2xl p-3 border border-lilac-mid/30 flex items-center justify-between"
                >
                  <div>
                    <div className="text-[14px] font-bold text-eye-purple">
                      {p.packageLabel}
                      <span className="ml-2 text-[11px] font-normal text-text-light/70">
                        {PAYMENT_STATUS_LABEL[p.status]}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-light/70 mt-0.5">
                      {fmtDate(p.paidAt)} · ⭐{p.stars}별
                    </div>
                  </div>
                  <div className="text-[14px] font-bold text-eye-purple">
                    {p.amount.toLocaleString()}원
                  </div>
                </div>
              ))}
            </div>
          )
        ) : txs.length === 0 ? (
          <p className="text-text-light/70 text-[13px] text-center py-8">
            아직 별 사용 내역이 없어
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {txs.map((t) => (
              <div
                key={t.id}
                className="bg-cream-warm rounded-2xl p-3 border border-lilac-mid/30 flex items-center justify-between"
              >
                <div>
                  <div className="text-[14px] font-bold text-eye-purple">
                    {t.typeLabel}
                  </div>
                  <div className="text-[11px] text-text-light/70 mt-0.5">
                    {fmtDate(t.createdAt)} · 잔액 {t.balanceAfter}별
                  </div>
                </div>
                <div
                  className={`text-[14px] font-bold ${
                    t.signedAmount < 0 ? "text-text-light" : "text-eye-purple"
                  }`}
                >
                  {t.signedAmount > 0 ? "+" : ""}
                  {t.signedAmount}별
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: dev 서버 확인**

Run: `npm run dev` → 로그인 후 `http://localhost:3000/mypage/payments`.
Expected: 상단 잔액/누적 결제 요약 + [결제 내역][별 내역] 탭. 별 내역 탭에 `사용 -22별` 같은 항목, 결제 내역 탭에 충전 항목(없으면 빈 상태 문구). `‹ 내 정보` 링크로 `/mypage` 복귀.

- [ ] **Step 4: Commit**

```bash
git add app/mypage/payments/page.tsx
git commit -m "feat(mypage): 결제/별 내역 화면 (/mypage/payments)"
```

---

## Task 4: 마이페이지 재구성

**Files:**
- Modify: `app/mypage/page.tsx`

세 가지 변경: (A) 프로필 카드에 명식 통합 + "내 사주" 단독 섹션 제거, (B) "지인 사주"→"사주 목록"(나+지인, 탭 펼침), (C) 계정·고객 메뉴 + 약관 링크 추가. 기존 상태/핸들러(`editingSelf`, `saveSelf`, `showAddAcq`, `editAcqId`, `deleteAcqId`, `saveAcquaintance`, `deleteAcquaintance`, `toInitial`, `self`, `acquaintances`)는 재사용.

### 4A. 프로필 카드에 명식 통합 + "내 사주" 섹션 제거

- [ ] **Step 1: 펼침 상태 추가**

`app/mypage/page.tsx` 상태 선언부(`const [deleteAcqId, setDeleteAcqId] = ...` 아래)에 사주 목록 행 펼침 상태 추가:

```tsx
  const [expandedId, setExpandedId] = useState<string | null>(null);
```

- [ ] **Step 2: 프로필 카드 블록 교체 (명식 통합)**

기존 `{/* 프로필 카드 */}` 블록 전체(`<div className="w-full max-w-md mx-auto px-5 mb-4">` … 닫는 `</div>`)를 아래로 교체. 아바타+닉네임 행 아래 divider + 명식(`SajuBoard`) + [수정] 을 통합:

```tsx
      {/* 프로필 카드 (명식 통합) */}
      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-lilac-soft overflow-hidden flex items-center justify-center">
              {me.user.profile_img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.user.profile_img}
                  alt="프로필"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Image
                  src="/byeolkong-main.png"
                  alt="별콩이"
                  width={56}
                  height={56}
                />
              )}
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-bold text-eye-purple">
                {me.user.nickname}
              </div>
              <div className="text-[11px] text-text-light/70 mt-0.5">
                카카오 · 풀이 {readings.length}회
              </div>
            </div>
            {self && !editingSelf && (
              <button
                onClick={() => setEditingSelf(true)}
                className="text-[11px] text-text-light/60 underline self-start"
              >
                수정
              </button>
            )}
          </div>

          {/* 내 명식 */}
          <div className="mt-3 pt-3 border-t border-lilac-mid/20 -mx-4">
            {self && !editingSelf ? (
              <>
                <SajuBoard saju={self.saju} />
                <p className="text-[11px] text-text-light/70 text-center mt-2">
                  {self.birthDate.replace(/-/g, ". ")}
                  {self.isLunarInput ? " · 음력" : " · 양력"}
                  {self.birthTime ? ` · ${self.birthTime}` : " · 시간 모름"}
                </p>
              </>
            ) : editingSelf ? (
              <div className="px-4">
                <ProfileForm
                  mode="self"
                  initial={self ? toInitial(self) : undefined}
                  defaultSelfName={me.user.nickname}
                  submitLabel="저장하기"
                  loading={savingProfile}
                  onSubmit={saveSelf}
                />
                <button
                  onClick={() => setEditingSelf(false)}
                  className="mx-auto mt-3 block text-[12px] text-text-light/60 underline"
                >
                  취소
                </button>
              </div>
            ) : (
              <div className="px-4">
                <button
                  onClick={() => setEditingSelf(true)}
                  className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
                >
                  내 사주 입력하기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
```

> 참고: `SajuBoard` 는 자체적으로 `max-w-md mx-auto px-5` 를 가진다. 카드 내부 패딩(`p-4`)과 겹치지 않도록 명식 컨테이너에 `-mx-4` 로 상쇄했다. dev 확인 시 좌우 정렬이 어색하면 `-mx-4` 를 `-mx-2` 로 조정.

- [ ] **Step 3: 기존 "내 사주" 단독 섹션 삭제**

기존 `{/* 계정 사주 (프로필 카드 영역) */}` 블록 전체(`<div className="w-full max-w-md mx-auto px-5 mb-6">` … `setEditingSelf` 분기를 담은 닫는 `</div>`, 현재 약 261–309행)를 **삭제**. (해당 로직은 4A Step 2 에서 프로필 카드로 이동됨.)

- [ ] **Step 4: 타입체크 + 확인 후 커밋**

Run: `npm run build` → 성공. `npm run dev` → `/mypage` 상단 프로필 카드 안에 닉네임 + 명식 + 오행 한 줄 + [수정]. 단독 "내 사주" 섹션 사라짐. [수정] 누르면 인라인 `ProfileForm` 편집.

```bash
git add app/mypage/page.tsx
git commit -m "feat(mypage): 내 명식을 프로필 카드로 통합 + 단독 내 사주 섹션 제거"
```

### 4B. "지인 사주" → "사주 목록" (나 + 지인, 탭 펼침)

- [ ] **Step 1: 목록 데이터 + 헬퍼**

`self`/`acquaintances` 아래(`saveSelf` 위 또는 컴포넌트 본문 상단)에 목록용 결합 배열과 라벨 헬퍼 추가:

```tsx
  const allProfiles = [...(self ? [self] : []), ...acquaintances];
  const relationBadge = (p: ProfileItem) =>
    p.isPrimary ? "나" : RELATION_LABEL[p.relationType] ?? "지인";
```

- [ ] **Step 2: "지인 사주" 섹션을 "사주 목록"으로 교체**

기존 `{/* 지인 사주 목록 */}` 블록 전체(`<div className="w-full max-w-md mx-auto px-5 mb-6">` … 닫는 `</div>`)를 아래로 교체. 제목 변경, `allProfiles` 순회, 행 탭 펼침(`expandedId`), 펼치면 `SajuBoardCompact` + 수정/삭제(나=삭제 없음). 추가/편집 폼(`showAddAcq || editAcqId`)은 기존 그대로 유지:

```tsx
      {/* 사주 목록 (나 + 지인) */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] font-bold text-eye-purple">사주 목록</div>
          {!showAddAcq && !editAcqId && (
            <button
              onClick={() => setShowAddAcq(true)}
              className="text-[11px] text-lilac-deep font-bold underline"
            >
              + 지인 추가
            </button>
          )}
        </div>

        {(showAddAcq || editAcqId) && (
          <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30 mb-3">
            <ProfileForm
              mode="acquaintance"
              initial={
                editAcqId
                  ? toInitial(acquaintances.find((a) => a.id === editAcqId)!)
                  : undefined
              }
              initialName={
                editAcqId
                  ? acquaintances.find((a) => a.id === editAcqId)?.displayName
                  : undefined
              }
              initialRelation={
                editAcqId
                  ? (acquaintances.find((a) => a.id === editAcqId)
                      ?.relationType as Exclude<ProfileItem["relationType"], "self">)
                  : undefined
              }
              submitLabel={editAcqId ? "수정하기" : "추가하기"}
              loading={savingProfile}
              onSubmit={(payload) => saveAcquaintance(payload, editAcqId)}
            />
            <button
              onClick={() => {
                setShowAddAcq(false);
                setEditAcqId(null);
              }}
              className="mx-auto mt-3 block text-[12px] text-text-light/60 underline"
            >
              취소
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {allProfiles.map((p) => {
            const open = expandedId === p.id;
            return (
              <div
                key={p.id}
                className="bg-cream-warm rounded-2xl border border-lilac-mid/30 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(open ? null : p.id)}
                  className="w-full p-3 flex items-center justify-between text-left"
                >
                  <div>
                    <div className="text-[14px] font-bold text-eye-purple">
                      {p.isPrimary ? me.user.nickname : p.displayName}
                      <span className="ml-2 text-[11px] text-text-light/70 font-normal">
                        {relationBadge(p)}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-light/70 mt-0.5">
                      {p.birthDate.replace(/-/g, ". ")}
                      {p.isLunarInput ? " · 음력" : " · 양력"}
                    </div>
                  </div>
                  <span className="text-text-light/50 text-[12px]">
                    {open ? "▴" : "▾"}
                  </span>
                </button>

                {open && (
                  <div className="px-3 pb-3 pt-1 border-t border-lilac-mid/20">
                    <div className="py-2 flex justify-center">
                      <SajuBoardCompact saju={p.saju} />
                    </div>
                    <div className="flex items-center justify-end gap-3 mt-1">
                      <button
                        onClick={() => {
                          if (p.isPrimary) {
                            setEditingSelf(true);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          } else {
                            setEditAcqId(p.id);
                            setShowAddAcq(false);
                            setExpandedId(null);
                          }
                        }}
                        className="text-[11px] text-text-light/60 underline"
                      >
                        수정
                      </button>
                      {!p.isPrimary && (
                        <button
                          onClick={() => setDeleteAcqId(p.id)}
                          className="text-[11px] text-rose-400 underline"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
```

> 내 사주(`isPrimary`) 행의 "수정"은 상단 프로필 카드의 인라인 편집(`editingSelf`)을 켜고 맨 위로 스크롤한다 — 편집 진입점을 한 곳(프로필 카드)으로 통일. 지인은 기존 흐름(`editAcqId`) 유지.

- [ ] **Step 3: import 추가**

파일 상단 import 에 `SajuBoardCompact` 추가:

```tsx
import SajuBoardCompact from "@/components/saju/SajuBoardCompact";
```

- [ ] **Step 4: 타입체크 + 확인 후 커밋**

Run: `npm run build` → 성공. `npm run dev` → `/mypage` "사주 목록" 제목, 첫 행 `[나]` 뱃지(닉네임), 이후 지인. 행 탭하면 펼쳐서 `SajuBoardCompact` + 수정/삭제. 나 행엔 삭제 없음, "수정" 누르면 맨 위 프로필 카드 편집 열림. `+ 지인 추가`/삭제 모달 기존대로 동작.

```bash
git add app/mypage/page.tsx
git commit -m "feat(mypage): 지인 사주 → 사주 목록 (나+지인 통합, 탭 펼침)"
```

### 4C. 계정·고객 메뉴 + 약관 링크

- [ ] **Step 1: 메뉴 묶음 + 약관 링크 추가**

`{/* 지인 삭제 확인 모달 */}` 블록 **앞**(사주 목록 섹션 닫힌 직후)에 계정·고객 메뉴 블록 삽입:

```tsx
      {/* 계정·고객 메뉴 */}
      <div className="w-full max-w-md mx-auto px-5 mb-2 flex flex-col gap-2">
        <Link
          href="/mypage/payments"
          className="bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex items-center justify-between"
        >
          <span className="text-[14px] text-eye-purple font-medium">
            결제 / 별 내역
          </span>
          <span className="text-text-light/50">›</span>
        </Link>
        {/* 고객센터: 연락 채널 미정 → 타겟 보류 (UI만). 채널 확정 시 href 교체. */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            alert("고객센터는 곧 열릴 예정이야!");
          }}
          className="bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex items-center justify-between"
        >
          <span className="text-[14px] text-eye-purple font-medium">
            고객센터 / 문의
          </span>
          <span className="text-text-light/50">›</span>
        </a>
      </div>

      {/* 약관 링크 */}
      <div className="w-full max-w-md mx-auto px-5 mb-2 flex items-center justify-center gap-2 text-[11px] text-text-light/60">
        <Link href="/terms" className="underline">이용약관</Link>
        <span>·</span>
        <Link href="/privacy" className="underline">개인정보처리방침</Link>
        <span>·</span>
        <Link href="/refund" className="underline">환불정책</Link>
      </div>
```

> 고객센터는 스펙대로 "링크만 뚫고 타겟 보류". 채널(이메일/카카오 채널) 확정되면 `<a href="#" onClick=...>` 를 실제 `mailto:` 또는 채널 URL 로 교체.

- [ ] **Step 2: 타입체크 + 확인 후 커밋**

Run: `npm run build` → 성공. `npm run dev` → `/mypage` 사주 목록 아래에 "결제 / 별 내역"(→ `/mypage/payments` 이동), "고객센터 / 문의"(alert), 그 아래 약관·개인정보·환불 링크 한 줄. 회원 탈퇴 블록은 그대로 맨 아래.

```bash
git add app/mypage/page.tsx
git commit -m "feat(mypage): 계정·고객 메뉴 + 약관 링크 묶음 추가"
```

---

## Self-Review 결과

**Spec coverage:**
- 명식 프로필 통합 → Task 4A ✓
- 사주 목록(나+지인, 탭 펼침, 나 삭제불가) → Task 4B ✓
- 오행 한 줄(공용) → Task 2 ✓
- 결제/별 내역 화면 → Task 3 ✓ + 별 내역 API → Task 1 ✓
- 고객센터 진입점(보류 링크) → Task 4C ✓
- 약관 링크 → Task 4C ✓

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "고객센터 타겟 보류"는 스펙이 명시한 의도된 미결정(placeholder가 아니라 결정).

**Type consistency:** API 반환 필드(`transactions[].signedAmount/balanceAfter/typeLabel`, `payments[].packageLabel/stars/amount/status/paidAt`)가 Task 3 페이지 인터페이스와 일치. `ProfileItem`/`self`/`acquaintances`/`toInitial` 등은 기존 `app/mypage/page.tsx` 정의 그대로 사용. `SajuBoardCompact`/`SajuBoard` props(`saju: SajuResult`) 일치.

**미해결(구현 중 확정):** `star_transactions.source` 라벨 노출은 생략(typeLabel 만 사용) — 필요 시 추가. 별 내역 화면 통합 타임라인 대신 2탭 채택.
