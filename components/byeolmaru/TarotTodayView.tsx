"use client";

// components/byeolmaru/TarotTodayView.tsx — 오늘 타로 전용 화면(P5-3).
// 🔴 DailyCardBlock 은 자격(entitled/trialUsed)을 props 로 받는다 — 허브가 넘겨주던 값이다.
//    전용 페이지가 되면서 스스로 캘린더 응답에서 자격을 읽어야 한다(같은 라우트를 쓴다 —
//    자격 전용 API 를 새로 만들지 않는다. 응답이 이미 entitled/trialUsed 를 싣고 있다).
import { useEffect, useState } from "react";
import Link from "next/link";
import DailyCardBlock from "./DailyCardBlock";
import BackHeader from "./BackHeader";
import { useByeolmaruSubscribe } from "./useByeolmaruSubscribe";
import { trackUiEvent } from "@/lib/analytics/ui-events";

type State =
  | { kind: "loading" }
  | { kind: "need_login" }
  | { kind: "ready"; entitled: boolean; trialUsed: boolean };

export default function TarotTodayView() {
  const [state, setState] = useState<State>({ kind: "loading" });

  async function refresh() {
    try {
      const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
      if (res.status === 401) { trackUiEvent("byeolmaru_need_login"); setState({ kind: "need_login" }); return; }
      // 404(생일 미입력)여도 화면은 뜬다 — 오늘 타로는 생일이 필요 없다(daily-card 라우트는
      // 세션만 확인한다). 🔴 다만 자격은 **바디에서 읽는다**. 라우트가 404 에도 entitled/
      // trialUsed 를 실어 보내므로, 프로필 없는 구독자에게 체험 CTA 를 보여주는 일이 없다.
      if (res.status === 404) {
        const j = await res.json().catch(() => null);
        setState({ kind: "ready", entitled: !!j?.entitled, trialUsed: !!j?.trialUsed });
        return;
      }
      if (!res.ok) { setState({ kind: "ready", entitled: false, trialUsed: false }); return; }
      const j = await res.json();
      setState({ kind: "ready", entitled: !!j.entitled, trialUsed: !!j.trialUsed });
    } catch {
      setState({ kind: "ready", entitled: false, trialUsed: false });
    }
  }
  useEffect(() => { void refresh(); }, []);

  const { startTrial, openSubscribe, subscribeModal } = useByeolmaruSubscribe(refresh);

  if (state.kind === "loading") return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">펼치는 중…</main>;
  if (state.kind === "need_login") return (
    <main className="mx-auto w-full max-w-md p-6 text-center">
      <p className="mb-4 text-eye-purple">로그인하면 오늘 카드를 뽑을 수 있어.</p>
      <Link href="/login?next=/byeolmaru/tarot" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">로그인하러 가기</Link>
      {/* 공유 링크 수신자는 대부분 비로그인 — 주 CTA(로그인)와 동급이 아니게 보조 링크로만 */}
      <Link href="/byeolmaru" className="mt-3 block text-xs text-text-light underline">별마루 먼저 둘러보기</Link>
    </main>
  );

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <BackHeader title="오늘 타로" />
      <DailyCardBlock
        entitled={state.entitled}
        trialUsed={state.trialUsed}
        onStartTrial={startTrial}
        onSubscribe={openSubscribe}
      />
      {subscribeModal}
    </main>
  );
}
