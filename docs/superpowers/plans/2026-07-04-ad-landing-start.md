# 광고 전용 랜딩 `/start` 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙(`docs/superpowers/specs/2026-07-04-ad-landing-start-design.md`)의 광고 전용 랜딩 — utm_content별 메뉴, 선택→로그인→웰컴 팝업→기존 흐름 핸드오프, 홈 넛지 배너, 결과 화면 업셀 — 을 구현한다.

**Architecture:** 새 페이지 `app/start/page.tsx` 하나가 utm_content(counsel/daily/tarot)로 분기해 기존 상수(`EMOTION_OPTIONS`, `FORTUNE_LIST`)를 재사용해 메뉴를 그린다. 선택은 `sessionStorage(byeolkong:start_pending)`에 저장 후 로그인 왕복을 견디고, 복귀 시 `?welcome=1`(kakao 콜백이 신규가입에 이미 부여)이면 웰컴 팝업 → 닫으면 기존 흐름(`/concern` 또는 `FORTUNE_CONFIG.href`)으로 `router.push`(브라우저 백 = 랜딩 복귀). 업셀/넛지는 기존 API(`/api/stars/first-charge-status`, `/api/readings`) 재사용 — 새 서버 코드 없음.

**Tech Stack:** Next.js 16 App Router · React 19 Client Components · Tailwind v4 · sessionStorage/localStorage (기존 auth 패턴)

**검증 방식 주의:** 이 레포엔 테스트 러너가 없다(package.json에 jest/vitest 없음). 컨벤션(AGENTS.md)대로 각 태스크 검증은 `npx tsc --noEmit`(에러 0 기준 — 단 untracked `scripts/verify-offer.ts`의 기존 에러 5건은 무시) + 마지막에 dev 배포 후 브라우저 시나리오로 한다.

---

## 참고: 확인된 기존 동작 (구현 전제)

- **kakao 콜백** (`app/api/auth/kakao/route.ts:163-165`): `next` 경로에 쿼리가 있어도 `new URL(next, baseUrl)`로 보존되고, `login=success` + 신규가입 시 `welcome=1`을 덧붙여 redirect. OAuth `state`는 `{nonce}|{nextPath}` 포맷이라 next의 `?`/`&`가 살아남는다.
- **로그인 가드 패턴** (`app/page.tsx:52-65`): `localStorage.getItem("byeolkong_user")` 유무로 판정 → 없으면 `/login?next=...`.
- **모달 패턴** (`components/common/StarConfirmModal.tsx`): `createPortal(document.body)` + `z-[80]` + mounted state — 페이지 transform 스택 컨텍스트 회피.
- **첫충전 자격 API** (`/api/stars/first-charge-status`): `{ eligible: boolean }` 반환, 비로그인/실패 시 `eligible: false`.
- **fortune/result** 는 `ftType: FortuneType | null` state를 이미 가짐 (`app/fortune/result/page.tsx:167`).

---

### Task 1: `/start` 페이지 골격 + 접근 가드 + AppShell 예외

**Files:**
- Create: `app/start/page.tsx`
- Modify: `components/layout/AppShell.tsx:9-12`

- [ ] **Step 1: AppShell 예외 추가** — `HIDE_SHELL_PREFIXES`에 `/start` 추가:

```tsx
/** Header/BottomTab 를 숨길 경로 (정확 매치 또는 prefix) */
const HIDE_SHELL_PREFIXES: string[] = [
  "/login",
  "/admin",
  "/start",
];
```

- [ ] **Step 2: 페이지 골격 작성** — `app/start/page.tsx` 생성. 이 단계에서는 가드 + 히어로 + 리본까지 (메뉴는 Task 2, 핸드오프는 Task 3에서 채움):

```tsx
"use client";

// 광고 전용 랜딩 — utm_content(counsel|daily|tarot)별 메뉴만 노출.
// 유효 utm_content 없이 직접 진입하면 홈으로 (오가닉 유저는 이 페이지를 모르게).
// 선택 → (비로그인) 카카오 로그인 → 웰컴 팝업 → 기존 흐름 핸드오프.

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { WELCOME_BONUS_STARS } from "@/lib/constants";

const VARIANTS = ["counsel", "daily", "tarot"] as const;
type Variant = (typeof VARIANTS)[number];

const HERO_COPY: Record<Variant, { line1: string; line2: string }> = {
  counsel: { line1: "요즘 마음 복잡하지?", line2: "별콩이가 들어줄게" },
  daily: { line1: "오늘 하루,", line2: "어떤 흐름일까?" },
  tarot: { line1: "카드는 네가", line2: "직접 뽑아" },
};

function isVariant(v: string | null): v is Variant {
  return VARIANTS.includes(v as Variant);
}

export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <StartPageInner />
    </Suspense>
  );
}

function StartPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const variant = sp.get("utm_content");
  const valid = isVariant(variant);

  // 광고 전용 가드 — 유효 utm_content 없으면 홈으로
  useEffect(() => {
    if (!valid) router.replace("/");
  }, [valid, router]);

  if (!valid) return null;
  const heroCopy = HERO_COPY[variant];

  return (
    <main className="min-h-dvh w-full flex flex-col items-center animate-fade-in">
      {/* 다크 히어로 — 광고 카피 매칭 */}
      <section
        className="w-full"
        style={{
          background:
            "linear-gradient(180deg, #16122E 0%, #241C49 45%, #4A3A82 100%)",
        }}
      >
        <div className="max-w-md mx-auto px-5 pt-12 pb-8 flex flex-col items-center">
          <div className="relative w-[120px] h-[120px] mb-3 animate-float">
            <Image
              src="/byeolkong-hero.png"
              alt="별콩이"
              fill
              sizes="120px"
              priority
              className="object-contain drop-shadow-lg"
            />
          </div>
          <h1
            className="font-display text-[26px] text-white leading-snug text-center"
            style={{ textShadow: "0 2px 16px rgba(120,90,200,0.55)" }}
          >
            {heroCopy.line1}
            <br />
            {heroCopy.line2}
          </h1>
        </div>
      </section>

      {/* 골드 리본 — "무료" 약속 없이 웰컴 별만 */}
      <div className="w-full bg-gold-soft/90 py-2.5 text-center">
        <p className="text-[13px] font-extrabold text-eye-purple">
          지금 가입하면 웰컴 별 {WELCOME_BONUS_STARS}개 ✨
        </p>
      </div>

      {/* 서비스 메뉴 — Task 2 에서 채움 */}
      <section className="w-full max-w-md mx-auto px-5 py-6 flex flex-col gap-3" />
    </main>
  );
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 신규 에러 0 (scripts/verify-offer.ts 기존 5건만)

- [ ] **Step 4: 커밋**

```bash
git add app/start/page.tsx components/layout/AppShell.tsx
git commit -m "feat(start): 광고 전용 랜딩 골격 — utm_content 가드 + 히어로/리본 + 쉘 숨김"
```

### Task 2: variant별 서비스 메뉴 3종

**Files:**
- Modify: `app/start/page.tsx` (Task 1 골격에 추가)

- [ ] **Step 1: import 확장 + 데이터 준비** — 파일 상단 import에 추가:

```tsx
import {
  EMOTION_OPTIONS,
  EMOTION_GRADIENTS,
  type EmotionTag,
} from "@/lib/emotions";
import {
  FORTUNE_CONFIG,
  FORTUNE_LIST,
  FORTUNE_GRADIENTS,
  type FortuneConfig,
} from "@/lib/fortune/types";
```

`HERO_COPY` 아래에 목록 상수 추가:

```tsx
// daily variant: 광고가 약속한 "오늘의 운세"를 맨 위로 (별콩 운세 10종 전체)
const DAILY_ORDERED: FortuneConfig[] = [
  FORTUNE_CONFIG.daily,
  ...FORTUNE_LIST.filter((f) => f.type !== "daily"),
];

const TAROT_FORTUNES: FortuneConfig[] = FORTUNE_LIST.filter(
  (f) => f.base === "tarot"
);
```

- [ ] **Step 2: 리스트 하위 컴포넌트 2개** — 파일 하단(StartPageInner 밖)에 추가. `onSelect`는 Task 3의 핸드오프가 받을 콜백:

```tsx
function EmotionList({ onSelect }: { onSelect: (tag: EmotionTag) => void }) {
  return (
    <>
      {EMOTION_OPTIONS.map((option) => (
        <button
          key={option.tag}
          onClick={() => onSelect(option.tag)}
          className="flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition text-left"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: EMOTION_GRADIENTS[option.tag] }}
          >
            <Image
              src={option.icon}
              alt=""
              width={42}
              height={42}
              className="object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-eye-purple text-[15px] leading-snug">
              {option.tag}
            </p>
            <p className="text-[12px] text-text-light mt-0.5 leading-relaxed">
              {option.description}
            </p>
          </div>
        </button>
      ))}
    </>
  );
}

function FortuneMenuList({
  items,
  highlightType,
  onSelect,
}: {
  items: FortuneConfig[];
  /** 이 type 카드에 "광고에서 본 그거" 뱃지 + 강조 보더 */
  highlightType?: string;
  onSelect: (href: string) => void;
}) {
  return (
    <>
      {items.map((f) => {
        const highlighted = f.type === highlightType;
        return (
          <button
            key={f.type}
            onClick={() => onSelect(f.href)}
            className={[
              "flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl text-left transition",
              highlighted
                ? "border-2 border-gold shadow-[0_0_0_3px_rgba(232,194,106,0.18)]"
                : "border border-lilac-soft hover:border-lilac-deep/40",
            ].join(" ")}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-[24px] shrink-0"
              style={{ background: FORTUNE_GRADIENTS[f.type] }}
            >
              {f.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[15px] font-bold text-eye-purple">
                  {f.label}
                </span>
                {f.cost > 0 && (
                  <span className="text-[10px] font-bold text-lilac-deep bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                    ⭐ {f.cost}
                  </span>
                )}
                {highlighted && (
                  <span className="text-[10px] font-bold text-eye-purple bg-gold-soft/70 px-1.5 py-0.5 rounded-full">
                    광고에서 본 그거 ✨
                  </span>
                )}
              </div>
              <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
                {f.tagline}
              </p>
            </div>
          </button>
        );
      })}
    </>
  );
}
```

- [ ] **Step 3: StartPageInner에 스텝 상태 + 메뉴 렌더** — `StartPageInner` 안에 타로 갈래 상태 추가:

```tsx
  // 타로 갈래 스텝: branch(2택) → counsel(감정 10종) | fortune(타로 운세 5종)
  const [tarotStep, setTarotStep] = useState<"branch" | "counsel" | "fortune">(
    "branch"
  );
```

빈 `<section ... />`을 다음으로 교체 (`handleSelect`는 Task 3에서 정의 — 이 단계에서는 임시로 `console.log` 대신 no-op 함수를 두지 말고 Task 3와 같이 커밋해도 된다. 분리 커밋하려면 `const handleSelect = (_p: StartPending) => {};` 임시 스텁 사용):

```tsx
      {/* 서비스 메뉴 — variant 분기 */}
      <section className="w-full max-w-md mx-auto px-5 py-6 flex flex-col gap-3">
        {variant === "counsel" && (
          <>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              어떤 고민이야? 골라봐
            </p>
            <EmotionList
              onSelect={(tag) => handleSelect({ kind: "emotion", tag })}
            />
          </>
        )}

        {variant === "daily" && (
          <>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              보고 싶은 운세 리포트를 골라봐
            </p>
            <FortuneMenuList
              items={DAILY_ORDERED}
              highlightType="daily"
              onSelect={(href) => handleSelect({ kind: "fortune", href })}
            />
          </>
        )}

        {variant === "tarot" && tarotStep === "branch" && (
          <>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              타로, 어떻게 볼까?
            </p>
            <button
              onClick={() => setTarotStep("counsel")}
              className="flex flex-col items-center gap-1.5 p-6 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition"
            >
              <span className="text-[28px]">🔮</span>
              <span className="text-[16px] font-bold text-eye-purple">
                타로로 고민 상담
              </span>
              <span className="text-[12px] text-text-light">
                별콩이와 대화하며 카드를 풀어가
              </span>
            </button>
            <button
              onClick={() => setTarotStep("fortune")}
              className="flex flex-col items-center gap-1.5 p-6 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition"
            >
              <span className="text-[28px]">🃏</span>
              <span className="text-[16px] font-bold text-eye-purple">
                타로 운세 보기
              </span>
              <span className="text-[12px] text-text-light">
                한 장의 리포트로 빠르게
              </span>
            </button>
          </>
        )}

        {variant === "tarot" && tarotStep === "counsel" && (
          <>
            <button
              onClick={() => setTarotStep("branch")}
              className="self-start text-[12px] text-text-light/80 px-1"
            >
              ‹ 다시 고르기
            </button>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              어떤 고민이야? 골라봐
            </p>
            <EmotionList
              onSelect={(tag) => handleSelect({ kind: "emotion", tag })}
            />
          </>
        )}

        {variant === "tarot" && tarotStep === "fortune" && (
          <>
            <button
              onClick={() => setTarotStep("branch")}
              className="self-start text-[12px] text-text-light/80 px-1"
            >
              ‹ 다시 고르기
            </button>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              보고 싶은 타로 운세를 골라봐
            </p>
            <FortuneMenuList
              items={TAROT_FORTUNES}
              onSelect={(href) => handleSelect({ kind: "fortune", href })}
            />
          </>
        )}
      </section>
```

- [ ] **Step 4: 타입 체크** (Task 3와 같이 커밋할 거면 Task 3 후에)

Run: `npx tsc --noEmit`
Expected: 신규 에러 0

### Task 3: 선택 → pending 저장 → 로그인/직진 핸드오프

**Files:**
- Modify: `app/start/page.tsx`

- [ ] **Step 1: pending 타입 + 헬퍼** — `isVariant` 아래에 추가:

```tsx
const START_PENDING_KEY = "byeolkong:start_pending";

type StartPending =
  | { kind: "emotion"; tag: EmotionTag }
  | { kind: "fortune"; href: string };

function readPending(): StartPending | null {
  try {
    const raw = sessionStorage.getItem(START_PENDING_KEY);
    return raw ? (JSON.parse(raw) as StartPending) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: proceed + handleSelect** — `StartPageInner` 안 (가드 useEffect 아래)에 추가:

```tsx
  // 핸드오프: 저장된 선택을 기존 흐름으로. router.push 라 브라우저 백 = /start 복귀
  const proceed = (pending: StartPending) => {
    try {
      sessionStorage.removeItem(START_PENDING_KEY);
    } catch {}
    if (pending.kind === "emotion") {
      try {
        sessionStorage.setItem("byeolkong:emotion", pending.tag);
      } catch {}
      router.push("/concern");
    } else {
      router.push(pending.href);
    }
  };

  const handleSelect = (pending: StartPending) => {
    try {
      sessionStorage.setItem(START_PENDING_KEY, JSON.stringify(pending));
    } catch {}
    // 홈과 동일한 로그인 가드 패턴 (localStorage byeolkong_user)
    let loggedIn = false;
    try {
      loggedIn = !!localStorage.getItem("byeolkong_user");
    } catch {}
    if (!loggedIn) {
      router.push(
        `/login?next=${encodeURIComponent(`/start?${sp.toString()}`)}`
      );
      return;
    }
    proceed(pending);
  };
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 신규 에러 0

- [ ] **Step 4: 커밋** (Task 2+3 묶음)

```bash
git add app/start/page.tsx
git commit -m "feat(start): variant별 메뉴 3종 + 선택 저장 + 로그인/직진 핸드오프"
```

### Task 4: 웰컴 별 팝업 + 로그인 복귀 자동 진행

**Files:**
- Create: `components/start/WelcomeStarsModal.tsx`
- Modify: `app/start/page.tsx`

- [ ] **Step 1: WelcomeStarsModal 작성** — `components/start/WelcomeStarsModal.tsx` 생성 (StarConfirmModal의 포털 패턴):

```tsx
"use client";

// 웰컴 별 도착 팝업 — 광고 랜딩(/start) 신규 가입 복귀 시 1회 노출.
// body 포털 (페이지 transform 스택 컨텍스트에서 z-40/50 쉘 아래 깔리는 문제 회피).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { WELCOME_BONUS_STARS } from "@/lib/constants";

export default function WelcomeStarsModal({
  balance,
  onStart,
}: {
  balance: number | null;
  onStart: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-night/60 backdrop-blur-sm animate-fade-in px-5">
      <div className="w-full max-w-sm bg-cream rounded-3xl p-7 text-center">
        <div className="relative w-24 h-24 mx-auto mb-3">
          <div className="absolute inset-0 bg-gold/40 rounded-full blur-xl scale-110" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/byeolkong-main.png"
            alt="별콩이"
            className="relative w-full h-full object-contain"
          />
        </div>
        <p className="font-display text-[22px] text-eye-purple leading-tight">
          웰컴 별 {WELCOME_BONUS_STARS}개 도착 ✨
        </p>
        <p className="mt-2 text-[13px] text-text-light leading-relaxed">
          만나서 반가워! 별콩이가 선물을 준비했어.
          <br />이 별로 상담이나 운세를 바로 볼 수 있어.
        </p>
        <div className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gold-soft/40">
          <span className="text-[13px] font-extrabold text-eye-purple">
            현재 잔액 ⭐ {balance ?? WELCOME_BONUS_STARS}
          </span>
        </div>
        <button
          onClick={onStart}
          className="mt-6 w-full py-3.5 rounded-full bg-lilac-deep text-white font-bold text-[15px] active:scale-[0.98] transition"
        >
          바로 시작하기
        </button>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: /start에 복귀 처리 연결** — `app/start/page.tsx` import 추가:

```tsx
import WelcomeStarsModal from "@/components/start/WelcomeStarsModal";
```

`StartPageInner` 안 (`tarotStep` state 옆)에 상태 추가:

```tsx
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
```

`handleSelect` 아래에 로그인 복귀 effect + 팝업 닫기 핸들러 추가:

```tsx
  // 로그인 복귀: 신규가입(welcome=1)이면 팝업, 기존 유저면 pending 바로 진행
  useEffect(() => {
    if (!valid) return;
    if (sp.get("login") !== "success") return;
    if (sp.get("welcome") === "1") {
      setWelcomeOpen(true);
      void fetch("/api/stars/balance", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) =>
          setBalance(typeof d?.balance === "number" ? d.balance : null)
        )
        .catch(() => {});
      return;
    }
    const pending = readPending();
    if (pending) proceed(pending);
    // 마운트 1회 판정 (로그인 복귀는 항상 fresh mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  const handleWelcomeClose = () => {
    setWelcomeOpen(false);
    // 새로고침 시 팝업 재노출 방지 — login/welcome 파라미터만 제거 (utm 유지)
    const clean = new URLSearchParams(sp.toString());
    clean.delete("login");
    clean.delete("welcome");
    router.replace(`/start?${clean.toString()}`);
    const pending = readPending();
    if (pending) proceed(pending);
  };
```

`</main>` 직전에 팝업 렌더 추가:

```tsx
      {welcomeOpen && (
        <WelcomeStarsModal balance={balance} onStart={handleWelcomeClose} />
      )}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 신규 에러 0

- [ ] **Step 4: 커밋**

```bash
git add components/start/WelcomeStarsModal.tsx app/start/page.tsx
git commit -m "feat(start): 웰컴 별 팝업 + 로그인 복귀 시 pending 자동 진행"
```

### Task 5: 홈 재방문 넛지 배너

**Files:**
- Modify: `app/page.tsx` (배너: 22-44행 effect + 187행 section)

- [ ] **Step 1: import + 상태 추가** — `app/page.tsx` 상단 import에 `WELCOME_BONUS_STARS` 추가:

```tsx
import { WELCOME_BONUS_STARS } from "@/lib/constants";
```

`Home` 컴포넌트의 `hasResumable` 옆에 상태 추가:

```tsx
  const [welcomeNudge, setWelcomeNudge] = useState(false);
```

- [ ] **Step 2: 기존 readings effect 확장** — `setHasResumable(resumable);` 바로 뒤에 추가 (같은 iife 안):

```tsx
        // 웰컴 넛지: 로그인했는데 리딩이 하나도 없는 유저 (광고 가입 후 이탈 재방문 등)
        let loggedIn = false;
        try {
          loggedIn = !!localStorage.getItem("byeolkong_user");
        } catch {}
        setWelcomeNudge(loggedIn && list !== null && readings.length === 0);
```

- [ ] **Step 3: 배너 렌더 + 스크롤 타깃** — `{hasResumable && (` 배너 바로 위에 추가:

```tsx
          {welcomeNudge && (
            <button
              onClick={() =>
                document
                  .getElementById("emotion-grid")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="w-full flex items-center gap-3 mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-gold-soft/80 to-gold/50 border border-gold/50 text-left shadow-[0_4px_18px_rgba(232,194,106,0.25)] animate-fade-in"
            >
              <span className="text-[20px] shrink-0">⭐</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-eye-purple leading-tight">
                  웰컴 별 {WELCOME_BONUS_STARS}개가 기다리고 있어
                </p>
                <p className="text-[11.5px] text-eye-purple/75 mt-0.5 leading-tight">
                  아래에서 첫 고민을 골라봐 · 운세 리포트는 하단 별콩 운세
                  탭에서!
                </p>
              </div>
              <span className="text-eye-purple/60 text-[16px] shrink-0">↓</span>
            </button>
          )}
```

같은 파일의 고민 카테고리 섹션(`<section className="w-full max-w-md mx-auto px-4 pt-7 pb-8 relative z-10">`)에 id 부여:

```tsx
        <section
          id="emotion-grid"
          className="w-full max-w-md mx-auto px-4 pt-7 pb-8 relative z-10"
        >
```

- [ ] **Step 4: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add app/page.tsx
git commit -m "feat(home): 웰컴 별 넛지 배너 — 로그인+리딩 0건 유저, 감정 그리드 스크롤"
```

### Task 6: 결과 화면 업셀 (첫충전 배너 + 크로스셀)

**Files:**
- Create: `components/upsell/ResultUpsell.tsx`
- Modify: `app/(consultations)/saju/result/page.tsx:215` (CTA div 뒤)
- Modify: `app/tarot/result/page.tsx:291` (CTA div 뒤)
- Modify: `app/fortune/result/page.tsx:500` (CTA div 뒤, 비공개 분기)

- [ ] **Step 1: ResultUpsell 작성** — `components/upsell/ResultUpsell.tsx` 생성:

```tsx
"use client";

// 결과 화면 하단 공용 업셀 — 첫 충전 +50% 배너(자격자만) + 크로스셀 카드 2장.
// 크로스셀 규칙(정적, 개인화 없음):
//   상담 결과(variant="counsel") → 오늘의 운세 + 이번달
//   운세 결과(variant=FortuneType) → 상담 진입 1개 + 같은 base 의 다음 운세 1개

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FORTUNE_CONFIG,
  FORTUNE_LIST,
  FORTUNE_GRADIENTS,
  type FortuneType,
  type FortuneConfig,
} from "@/lib/fortune/types";

interface CrossCard {
  href: string;
  emoji: string;
  label: string;
  tagline: string;
  badge: string;
  gradient: string;
}

function cardFromFortune(f: FortuneConfig): CrossCard {
  return {
    href: f.href,
    emoji: f.emoji,
    label: f.label,
    tagline: f.tagline,
    badge: f.cost === 0 ? "무료" : `⭐ ${f.cost}`,
    gradient: FORTUNE_GRADIENTS[f.type],
  };
}

function crossCards(variant: "counsel" | FortuneType): CrossCard[] {
  if (variant === "counsel") {
    return [FORTUNE_CONFIG.daily, FORTUNE_CONFIG.monthly].map(cardFromFortune);
  }
  const cfg = FORTUNE_CONFIG[variant];
  const sameBase = FORTUNE_LIST.filter((f) => f.base === cfg.base);
  const idx = sameBase.findIndex((f) => f.type === cfg.type);
  const next = sameBase[(idx + 1) % sameBase.length];
  return [
    {
      href: "/",
      emoji: "💬",
      label: "별콩이랑 고민 상담",
      tagline: "리포트 말고 대화로 깊게 나누고 싶다면",
      badge: "상담",
      gradient: "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)",
    },
    cardFromFortune(next),
  ];
}

export default function ResultUpsell({
  variant,
}: {
  variant: "counsel" | FortuneType;
}) {
  const [firstChargeEligible, setFirstChargeEligible] = useState(false);

  useEffect(() => {
    void fetch("/api/stars/first-charge-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFirstChargeEligible(d?.eligible === true))
      .catch(() => {});
  }, []);

  const cards = crossCards(variant);

  return (
    <div className="w-full max-w-md mx-auto px-5 mt-8 flex flex-col gap-3">
      {firstChargeEligible && (
        <Link
          href="/shop"
          className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-gold-soft/60 to-gold/40 border border-gold/50"
        >
          <span className="text-[22px]">🎁</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-extrabold text-eye-purple">
              첫 충전하면 별 +50% 보너스
            </p>
            <p className="text-[11.5px] text-eye-purple/70 mt-0.5">
              처음 딱 한 번, 어떤 패키지든 절반을 더 얹어줘
            </p>
          </div>
          <span className="text-eye-purple/60 text-[16px]">›</span>
        </Link>
      )}

      <p className="text-[13px] font-bold text-eye-purple px-1 mt-1">
        이런 것도 있어 ✨
      </p>
      {cards.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition"
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0"
            style={{ background: c.gradient }}
          >
            {c.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold text-eye-purple">
                {c.label}
              </span>
              <span className="text-[10px] font-bold text-lilac-deep bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                {c.badge}
              </span>
            </div>
            <p className="text-[12px] text-text-light mt-0.5 leading-snug line-clamp-1">
              {c.tagline}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: saju/result 삽입** — `app/(consultations)/saju/result/page.tsx`:

import 추가:

```tsx
import ResultUpsell from "@/components/upsell/ResultUpsell";
```

CTA div 닫힌 뒤(215행 `</div>`)와 `<ContinuationModal` 사이에:

```tsx
      <ResultUpsell variant="counsel" />
```

- [ ] **Step 3: tarot/result 삽입** — `app/tarot/result/page.tsx`: 동일 import + CTA div(291행 `</div>`)와 `<ContinuationModal` 사이에:

```tsx
      <ResultUpsell variant="counsel" />
```

- [ ] **Step 4: fortune/result 삽입** — `app/fortune/result/page.tsx`: 동일 import + CTA 블록 div 닫힌 뒤(500행)와 하단 안내 `<p className="mt-5 ...">` 사이에 (공개 뷰/타입 미확정 시 비노출):

```tsx
      {!isPublic && ftType && <ResultUpsell variant={ftType} />}
```

- [ ] **Step 5: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add components/upsell/ResultUpsell.tsx "app/(consultations)/saju/result/page.tsx" app/tarot/result/page.tsx app/fortune/result/page.tsx
git commit -m "feat(upsell): 결과 화면 공용 업셀 — 첫충전 배너 + 크로스셀 2장"
```

### Task 7: 딥링크 문서 갱신 + dev 배포 + 시나리오 검증

**Files:**
- Modify: `docs/superpowers/plans/2026-07-04-ad-launch.md` (Task 9 딥링크 + 진행 현황)

- [ ] **Step 1: 광고 딥링크 교체 기록** — `2026-07-04-ad-launch.md`의 진행 현황 Phase 3 항목에 있는 딥링크 3개를 다음으로 교체 (Task 9 본문에도 메모):

```
소재1 상담:  https://byeolkongtalk.com/start?utm_source=meta&utm_medium=paid&utm_campaign=launch_2026q3&utm_content=counsel
소재2 운세:  https://byeolkongtalk.com/start?utm_source=meta&utm_medium=paid&utm_campaign=launch_2026q3&utm_content=daily
소재3 타로:  https://byeolkongtalk.com/start?utm_source=meta&utm_medium=paid&utm_campaign=launch_2026q3&utm_content=tarot
```

- [ ] **Step 2: dev push**

```bash
git add docs/superpowers/plans/2026-07-04-ad-launch.md
git commit -m "docs(plan): 광고 딥링크를 /start 랜딩으로 교체"
git push origin dev
```

- [ ] **Step 3: dev 시나리오 검증** (스펙 "검증" 섹션 그대로 — 시크릿 창):

1. 소재 3종 URL 콜드 진입 각각: 메뉴 노출 → 카드 선택 → 카카오 로그인 → 웰컴 팝업(잔액 30) → 서비스 도달 → **브라우저 백 → /start 복귀(variant 유지)**
2. `dev.byeolkongtalk.com/start` (utm 없이) → 홈으로 replace
3. 리딩 0건 계정 홈 진입 → 넛지 배너 노출 + 클릭 시 감정 그리드 스크롤 → 리딩 1건 생성 후 배너 소멸
4. 결과 화면 3종(사주/타로 상담, 운세 리포트) 하단 — 첫충전 배너(자격자) + 크로스셀 카드 2장 + 링크 동작

- [ ] **Step 4: 이상 없으면 main 병합은 보류** — Phase 4(메타 등록)에서 픽셀 env 와 함께 일괄 prod 배포 (광고 시작 전까지 /start 는 prod에 없어도 무방).

---

## 스펙 커버리지 맵

| 스펙 요구 | 태스크 |
|---|---|
| 얕은 랜딩 + 기존 흐름 재사용 | T1~T4 |
| 선택 → 로그인 순서 | T3 |
| 소재별 메뉴 (counsel 10종 / daily 운세 전체+오늘 강조 / tarot 갈래) | T2 |
| 광고 전용 접근 가드 | T1 |
| 웰컴 별 큰 팝업 | T4 |
| 브라우저 백 → 랜딩 복귀 | T3 (router.push) + T7 검증 |
| 결과 업셀 (모든 유저, 첫충전+크로스셀) | T6 |
| 홈 재방문 넛지 (별콩 운세 탭 언급 포함) | T5 |
| 리본 카피 "지금 가입하면 웰컴 별 30개" | T1 |
| 딥링크 교체 | T7 |
