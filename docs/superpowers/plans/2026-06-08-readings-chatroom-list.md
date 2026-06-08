# 내 고민톡(/readings) 채팅방 목록 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/readings`(내 고민톡)의 고민 상담 탭을 "별콩이와 나눈 대화방" 채팅방 목록 느낌으로 바꾼다 — 행마다 아바타(타로=카드스택 / 사주=4종 일러스트) + 제목줄 + 사주 서브텍스트 + 별콩이 답변 2줄 미리보기.

**Architecture:** `GET /api/readings` 가 각 리딩의 첫 assistant 메시지 도입부를 마커 제거·절단해서 `preview` 필드로 함께 내려준다(기존 messages 배치 쿼리 패턴 재사용). 프론트는 consult 탭 행을 새 레이아웃으로 교체하고, 사주 아바타는 `public/icons/saju/{productId}.png` 규칙으로 매핑한다. 별콩 운세 탭과 결과/상세 페이지는 손대지 않는다.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (service role). 이 레포에는 테스트 러너가 없음 → 검증은 `npx tsc --noEmit` 타입체크 + `npm run dev` 수동 브라우저 확인으로 한다.

**Spec:** `docs/superpowers/specs/2026-06-08-readings-chatroom-list-design.md`

---

## File Structure

- `public/icons/saju/today_letters.png` `nature.png` `choice.png` `good_days.png` — 사주 4종 아바타 에셋 (신규, product ID 무공백 파일명).
- `app/api/readings/route.ts` — GET 응답에 `preview` 필드 추가 (첫 assistant 메시지 도입부 배치 조회 + 마커 strip + 절단).
- `app/readings/page.tsx` — `ReadingItem.preview` 추가, 상대시간 헬퍼·사주 아바타·프로필칩·서브텍스트·2줄 미리보기로 consult 탭 행 교체.

각 task 는 위 파일 단위로 독립적으로 커밋 가능하다.

---

## Task 1: 사주 4종 아이콘 에셋 정리

사용자가 `public/` 루트에 풀컬러 일러스트를 넣어뒀고, 일부 파일명에 공백이 있다(`choice 02.png`, `good days.png`). product ID 기준 무공백 경로로 복사한다. (원본은 남겨둬도 무방 — 참조하지 않게 됨.)

**Files:**
- Create: `public/icons/saju/today_letters.png`
- Create: `public/icons/saju/nature.png`
- Create: `public/icons/saju/choice.png`
- Create: `public/icons/saju/good_days.png`

- [ ] **Step 1: 디렉토리 생성 + 4개 파일 복사**

PowerShell (byeolkong_talk 루트에서):

```powershell
New-Item -ItemType Directory -Force public/icons/saju | Out-Null
Copy-Item "public/today_letters.png" "public/icons/saju/today_letters.png"
Copy-Item "public/nature.png"        "public/icons/saju/nature.png"
Copy-Item "public/choice 02.png"     "public/icons/saju/choice.png"
Copy-Item "public/good days.png"     "public/icons/saju/good_days.png"
```

- [ ] **Step 2: 4개 파일이 모두 존재하는지 확인**

Run:
```powershell
Get-ChildItem public/icons/saju
```
Expected: `today_letters.png`, `nature.png`, `choice.png`, `good_days.png` 4개가 보인다.

- [ ] **Step 3: Commit**

```bash
git add public/icons/saju
git commit -m "assets — 사주 4종 채팅방 아바타 아이콘 (product ID 경로 정리)"
```

---

## Task 2: GET /api/readings 에 별콩이 답변 도입부 `preview` 추가

현재 GET 은 유저 `question` 만 내려주고 assistant 텍스트는 안 준다. 기존에 ended/generating 판정을 위해 `messages` 를 reading ID 묶음으로 배치 조회하는 패턴이 있으니, 같은 방식으로 **각 reading 의 첫 assistant 메시지**를 가져와 마커를 제거하고 도입부를 잘라 `preview` 로 응답한다.

**Files:**
- Modify: `app/api/readings/route.ts:62-93` (fortune 배치 쿼리 다음에 preview 배치 추가 + 응답 map 에 필드 추가)

- [ ] **Step 1: 마커 제거 + 절단 헬퍼 추가**

`app/api/readings/route.ts` 상단 import 블록 바로 아래(20번째 줄 `const VALID_EMOTIONS` 위)에 추가:

```typescript
// 별콩이 답변 도입부 미리보기용 — 카드/종료 마커 제거 후 한 줄로 정리하고 절단.
function buildPreview(content: string): string {
  const cleaned = content
    .replace(/\[CARD:\d+\]/g, "")
    .replace(/\[END\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 90 ? cleaned.slice(0, 90) + "…" : cleaned;
}
```

- [ ] **Step 2: 첫 assistant 메시지 배치 조회**

`app/api/readings/route.ts` 의 fortune `hasMsgSet` 블록(62-74줄) 바로 다음, `return NextResponse.json(` (76줄) 직전에 삽입:

```typescript
  // 미리보기 — 각 reading 의 첫 assistant 메시지 도입부.
  // (reading_id, created_at) 인덱스 활용. 전체 assistant 메시지를 created_at 오름차순으로
  // 가져와, reading 별 첫 행만 채택한다.
  const allIds = (data ?? []).map((r) => r.id);
  const previewMap = new Map<string, string>();
  if (allIds.length > 0) {
    const { data: previewRows } = await supabase
      .from("messages")
      .select("reading_id, content, created_at")
      .in("reading_id", allIds)
      .eq("role", "assistant")
      .order("created_at", { ascending: true });
    for (const row of previewRows ?? []) {
      if (!previewMap.has(row.reading_id)) {
        previewMap.set(row.reading_id, buildPreview(row.content));
      }
    }
  }
```

- [ ] **Step 3: 응답 map 에 `preview` 필드 추가**

`app/api/readings/route.ts` 의 `readings: (data ?? []).map((r) => ({ ... }))` 안, `profile: r.profile,` 줄 바로 다음에 추가:

```typescript
      preview: previewMap.get(r.id) ?? null,
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (exit 0).

- [ ] **Step 5: 응답 확인**

Run: `npm run dev` 후 로그인 상태로 `http://localhost:3000/api/readings` 호출(브라우저 또는 콘솔 fetch).
Expected: `readings[]` 각 항목에 `preview` 필드가 있다. assistant 답변이 있는 리딩은 마커 없는 도입부 텍스트, 없는 리딩은 `null`.

- [ ] **Step 6: Commit**

```bash
git add app/api/readings/route.ts
git commit -m "api — GET /api/readings 에 별콩이 답변 도입부 preview 필드 추가"
```

---

## Task 3: consult 탭 행을 채팅방 레이아웃으로 교체

`app/readings/page.tsx` 의 고민 상담(consult) 탭 행을 새 구조로 바꾼다: 아바타(타로=카드스택 유지 / 사주=4종 일러스트) + 제목줄(감정태그 · 프로필칩 · 이어하기 · 상대시간) + 사주 서브텍스트 + 2줄 미리보기. 별콩 운세(fortune) 탭과 페이지네이션은 그대로 둔다.

**Files:**
- Modify: `app/readings/page.tsx` (인터페이스 13-32, 헬퍼 60-68, consult 행 210-297)

- [ ] **Step 1: `ReadingItem` 에 `preview` 추가**

`app/readings/page.tsx` 의 `interface ReadingItem` 안 `profile: ...` 줄(31) 다음에 추가:

```typescript
  preview?: string | null;
```

- [ ] **Step 2: 상대시간 + 사주 메타 헬퍼 추가**

`app/readings/page.tsx` 의 `formatDate` 함수(60-68줄) 바로 다음에 추가:

```typescript
/** 상대 시간 — 오늘/어제/N일 전/그 이전은 M/D */
function relativeDate(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86400000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return then.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
}

/** 사주 행 서브텍스트 — "상품명 · OO 사주 甲子" */
function sajuSubtext(r: ReadingItem): string | null {
  if (!isSajuProduct(r.sajuProduct)) return null;
  const product = SAJU_PRODUCT_INFO[r.sajuProduct].label;
  const who = r.profile?.relation_type === "self" || !r.profile ? "내" : r.profile.display_name;
  const pillar = dayPillar(r);
  return pillar ? `${product} · ${who} 사주 ${pillar}` : product;
}

/** 프로필 칩 라벨 — 본인이면 숨김(null), 아니면 display_name */
function profileChip(r: ReadingItem): string | null {
  if (!r.profile || r.profile.relation_type === "self") return null;
  return r.profile.display_name;
}
```

- [ ] **Step 3: 사주 아바타 컴포넌트 헬퍼 추가**

`app/readings/page.tsx` 의 Step 2 에서 추가한 `profileChip` 함수 다음에 추가:

```typescript
/** 사주 상담 아바타 — 4종 일러스트를 중립 소프트 타일 위에 얹음. 상품 미상이면 fallback */
function sajuAvatar(r: ReadingItem) {
  if (isSajuProduct(r.sajuProduct)) {
    return (
      <div className="shrink-0 self-center w-12 h-12 rounded-xl bg-cream flex items-center justify-center border border-lilac-soft overflow-hidden">
        <Image
          src={`/icons/saju/${r.sajuProduct}.png`}
          alt=""
          width={40}
          height={40}
          className="object-contain"
        />
      </div>
    );
  }
  return (
    <div className="shrink-0 self-center w-12 h-12 rounded-xl bg-lilac-soft/50 flex items-center justify-center text-[18px]">
      🔮
    </div>
  );
}
```

- [ ] **Step 4: consult 행 JSX 교체**

`app/readings/page.tsx` 의 consult 탭 블록 — `) : tab === "consult" ? (` 다음의 `<div className="flex flex-col gap-2">` 부터 그 블록을 닫는 `</div>` 까지(약 209-298줄) 를 아래로 교체한다. (`.map` 안의 `const isTarot ... const href ...` 계산은 유지하고, JSX 본문만 새 구조로.)

```tsx
          <div className="flex flex-col gap-2">
            {pagedItems.map((r) => {
              const isTarot = r.consultationType === "tarot";
              const canResume = isTarot && r.ended === false;
              const href = canResume
                ? `/tarot/reading?id=${r.id}&from=history`
                : isTarot
                  ? `/tarot/result?id=${r.id}&from=history`
                  : `/saju/result?id=${r.id}&from=history`;
              const cards = r.drawnCards ?? [];
              const subtext = isTarot ? null : sajuSubtext(r);
              const chip = profileChip(r);
              const preview = r.preview?.trim();
              return (
                <Link
                  key={r.id}
                  href={href}
                  className="bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex gap-3 items-start hover:border-lilac-deep/50 transition"
                >
                  {isTarot ? (
                    cards.length > 0 ? (
                      <div className="shrink-0 self-center flex items-center">
                        {cards.map((c, i) => (
                          <Image
                            key={i}
                            src={getCardImagePath(c.card_id)}
                            alt=""
                            width={32}
                            height={50}
                            style={{ marginLeft: i === 0 ? 0 : -18, zIndex: i }}
                            className={`rounded-[4px] border border-white/90 shadow-sm ${
                              c.direction === "reversed" ? "rotate-180" : ""
                            }`}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="shrink-0 self-center w-12 h-12 rounded-xl bg-lilac-soft/50 flex items-center justify-center text-[18px]">
                        🃏
                      </div>
                    )
                  ) : (
                    sajuAvatar(r)
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-bold text-eye-purple whitespace-nowrap">
                        {r.emotionTag ?? "고민 상담"}
                      </span>
                      {chip && (
                        <span className="shrink-0 text-[10px] font-bold text-lilac-deep bg-lilac-soft rounded-full px-1.5 py-0.5">
                          {chip}
                        </span>
                      )}
                      {canResume && (
                        <span className="shrink-0 text-[10px] font-bold text-white bg-lilac-deep rounded-full px-1.5 py-0.5">
                          이어하기
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[10px] text-text-light/60">
                        {relativeDate(r.createdAt)}
                      </span>
                    </div>
                    {subtext && (
                      <p className="text-[10px] text-text-light/60 mt-0.5 truncate">
                        {subtext}
                      </p>
                    )}
                    <p
                      className="text-[11.5px] text-text-light/80 mt-1 leading-snug overflow-hidden"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {preview || (r.generating ? "별콩이가 답을 준비하고 있어…" : r.question)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (exit 0).

> 주의: 이 교체로 consult 행에서 `choiceLabel`, `formatDate` 사용이 사라질 수 있다. `formatDate` 는 fortune 탭에서 계속 쓰므로 유지. `choiceLabel` 이 더 이상 어디서도 안 쓰이면 tsc 의 unused 경고가 아니라 lint 대상 — 사용처가 없으면 `choiceLabel` 함수와 그 전용 import(`SPREAD_INFO`)를 삭제한다. fortune 탭 등 다른 곳에서 쓰면 유지.

- [ ] **Step 6: 미사용 심볼 정리**

`choiceLabel` 사용처 확인:
```bash
grep -n "choiceLabel" app/readings/page.tsx
```
정의(44줄)만 남고 호출이 없으면 `choiceLabel` 함수(43-52줄)를 삭제하고, `SPREAD_INFO` 가 다른 곳에서 안 쓰이면 import(8줄)에서 제거한다. (`DrawnCard` 타입은 `ReadingItem` 에서 계속 사용 → 유지.) 삭제 후 다시 `npx tsc --noEmit`.

- [ ] **Step 7: 브라우저 수동 확인**

Run: `npm run dev` → 로그인 → `/readings` 고민 상담 탭.
확인:
- 타로 행: 뽑은 카드 스택 아바타 + 감정태그 제목 + 2줄 미리보기, 미완료 대화에 `이어하기` 배지.
- 사주 행: 4종 일러스트 아바타 + 감정태그 + 서브텍스트(`상품명 · OO 사주 甲子`) + 2줄 미리보기.
- 본인 외(엄마 등) 프로필일 때만 프로필 칩 노출.
- 미리보기에 `[CARD:n]`/`[END]` 마커 없음.
- 답변 없는 행도 레이아웃 안 깨짐.
- 별콩 운세 탭은 기존 그대로(아이콘/생성중 카드 회귀 없음).

- [ ] **Step 8: Commit**

```bash
git add app/readings/page.tsx
git commit -m "고민톡 — 고민 상담 탭 채팅방 행 리디자인 (아바타+제목+서브텍스트+2줄 미리보기)"
```

---

## Self-Review

**Spec coverage**
- §3 행 레이아웃 (아바타/제목줄/서브텍스트/미리보기) → Task 3 Step 4.
- §3.1 제목줄 (감정태그·프로필칩·이어하기·상대시간) → Task 3 Step 2(헬퍼)+4(JSX).
- §3.2 사주 서브텍스트 (일주 강등) → `sajuSubtext` (Task 3 Step 2).
- §3.3 2줄 미리보기 + placeholder → Task 3 Step 4 (line-clamp 2 + generating placeholder).
- §4 아바타 (타로 카드스택 / 사주 일러스트 / 운세탭 현행) → Task 3 Step 3·4.
- §5 사주 4종 아이콘 + §5.1 무공백 경로 정리 → Task 1.
- §5.2 일러스트를 중립 소프트 타일 위에 → `sajuAvatar` (Task 3 Step 3).
- §6 데이터 변경 (preview 필드, 첫 assistant 메시지 배치, 마커 strip, ~80-100자 절단) → Task 2.
- §8 검증 기준 → Task 3 Step 7 체크리스트.

**Placeholder scan:** 모든 코드 step 에 실제 코드 포함. "적절히 처리" 류 없음. ✓

**Type consistency:** `preview` 는 API(Task 2 Step 3, string|null)와 인터페이스(Task 3 Step 1, `string|null`)에서 일치. `sajuSubtext`/`profileChip`/`sajuAvatar`/`relativeDate` 시그니처가 Task 3 Step 4 호출과 일치. `isSajuProduct`/`SAJU_PRODUCT_INFO`/`dayPillar`/`getCardImagePath`/`Image` 는 page.tsx 에 이미 import 됨. ✓
