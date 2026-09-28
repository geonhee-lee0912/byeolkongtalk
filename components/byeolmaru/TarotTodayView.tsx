"use client";

// components/byeolmaru/TarotTodayView.tsx — 오늘 타로 전용 화면(P5-3).
// 🔴 DailyCardBlock 은 자격(entitled/trialUsed)을 props 로 받는다 — 허브가 넘겨주던 값이다.
//    전용 페이지가 되면서 스스로 캘린더 응답에서 자격을 읽어야 한다(같은 라우트를 쓴다 —
//    자격 전용 API 를 새로 만들지 않는다. 응답이 이미 entitled/trialUsed 를 싣고 있다).
import { useEffect, useState } from "react";
import DailyCardBlock from "./DailyCardBlock";
import GuestLoginWall from "./GuestLoginWall";
import { useByeolmaruSubscribe } from "./useByeolmaruSubscribe";
import { trackUiEvent } from "@/lib/analytics/ui-events";

type State =
  | { kind: "loading" }
  | { kind: "need_login" }
  | { kind: "error" }
  | { kind: "ready"; entitled: boolean; trialUsed: boolean; today: string };

export default function TarotTodayView({
  initialDate,
  injected,
  autoOpenRitual = false,
}: {
  initialDate?: string;
  injected?: { status: number; body: unknown };
  /** 주소가 타로를 가리켜 들어왔나(= 뽑으러 온 것). 껍데기가 **진입 시점**에 판정해 넘긴다 —
   *  여기서 URL 을 다시 읽으면 탭 전환의 `router.replace` 와 구분이 안 된다. */
  autoOpenRitual?: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  async function refresh() {
    try {
      const { status, body } =
        injected ??
        (await (async () => {
          const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
          return { status: res.status, body: await res.json().catch(() => null) };
        })());
      if (status === 401) { trackUiEvent("byeolmaru_need_login"); setState({ kind: "need_login" }); return; }
      // 🔴 오늘(KST)을 함께 붙든다 — 라벨("오늘/그날")과 뽑기 허용 판정이 이 값에 걸린다.
      //    캘린더 응답의 today 를 정본으로 쓰되, 404 경로엔 그 필드가 없어 클라 계산을 폴백으로 둔다.
      const kstNow = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      // 404(생일 미입력)여도 화면은 뜬다 — 오늘 타로는 생일이 필요 없다(daily-card 라우트는
      // 세션만 확인한다). 🔴 다만 자격은 **바디에서 읽는다**. 라우트가 404 에도 entitled/
      // trialUsed 를 실어 보내므로, 프로필 없는 구독자에게 체험 CTA 를 보여주는 일이 없다.
      if (status === 404) {
        const j = body as { entitled?: boolean; trialUsed?: boolean } | null;
        setState({ kind: "ready", entitled: !!j?.entitled, trialUsed: !!j?.trialUsed, today: kstNow });
        return;
      }
      // 🔴 404 외 오류(500·네트워크 등)는 "모르는 상태"다 — entitled:false 로 접으면 이미
      //    체험을 쓴 구독자에게 "3일 무료 체험 시작"이 다시 뜬다(위 404 분기와 같은 버그가
      //    트리거만 바뀐 것). error 로 보내 별도 화면을 띄운다.
      if (status < 200 || status >= 300) { setState({ kind: "error" }); return; }
      const j = body as { entitled?: boolean; trialUsed?: boolean; today?: string } | null;
      if (!j) { setState({ kind: "error" }); return; }
      setState({ kind: "ready", entitled: !!j.entitled, trialUsed: !!j.trialUsed, today: j.today ?? kstNow });
    } catch {
      setState({ kind: "error" });
    }
  }
  useEffect(() => { void refresh(); }, []);

  // 🔴 구독·체험이 바뀐 뒤의 갱신은 **주입을 무시하고 서버를 다시 문다** — 주입값은 껍데기가
  //    진입 시 한 번 받은 스냅샷이라, 그걸 다시 읽으면 방금 산 구독이 화면에 반영되지 않는다.
  const { startTrial, openSubscribe, subscribeModal } = useByeolmaruSubscribe(() => void refreshFromServer());

  async function refreshFromServer() {
    const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
    const body = await res.json().catch(() => null);
    const kstNow = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    if (res.status === 401) { setState({ kind: "need_login" }); return; }
    if (res.status === 404) {
      const j = body as { entitled?: boolean; trialUsed?: boolean } | null;
      setState({ kind: "ready", entitled: !!j?.entitled, trialUsed: !!j?.trialUsed, today: kstNow });
      return;
    }
    if (!res.ok || !body) { setState({ kind: "error" }); return; }
    const j = body as { entitled?: boolean; trialUsed?: boolean; today?: string };
    setState({ kind: "ready", entitled: !!j.entitled, trialUsed: !!j.trialUsed, today: j.today ?? kstNow });
  }

  if (state.kind === "loading") return <p className="text-center text-text-light">펼치는 중…</p>;
  // 🔴 벽은 세 탭이 공유한다(GuestLoginWall) — 문구·레이아웃을 여기서 다시 쓰지 말 것.
  //    이 탭만 다른 점: 보고 있던 날짜를 next 에 실어 보낸다 — 공유 링크 수신자가 로그인 후
  //    같은 날로 돌아오게.
  // 🔴 "별마루 먼저 둘러보기" 보조 링크는 2026-09-27 에 제거됐다(사용자 결정). 그 링크가
  //    있던 이유(공유 링크 수신자의 출구)는 상단 `← 별마루`(BackHeader)가 이미 진다 —
  //    되살리면 같은 목적지가 한 화면에 두 번 생긴다.
  if (state.kind === "need_login") return (
    <GuestLoginWall next={`/byeolmaru/day?tab=tarot${initialDate ? `&date=${initialDate}` : ""}`} />
  );
  // 🔴 오류(500·네트워크 실패)를 "자격 없음"으로 접지 않는다 — 접으면 이미 체험을 쓴 구독자에게
  //    무료 체험 CTA(DailyCardBlock)가 다시 뜬다. 모르는 상태는 모르는 화면으로 보여준다.
  if (state.kind === "error") return <p className="text-center text-text-light">지금은 오늘 타로를 못 펼쳤어. 잠시 뒤에 다시 와줄래?</p>;

  // 🔴 ?date= 가 없으면 오늘이다. 검증은 다리(DayTabsBridge)가 이미 했으니 여기선 폴백만 한다.
  const date = initialDate ?? state.today;
  const isToday = date === state.today;

  return (
    <div className="space-y-4">
      <DailyCardBlock
        date={date}
        todayKst={state.today}
        entitled={state.entitled}
        trialUsed={state.trialUsed}
        onStartTrial={startTrial}
        onSubscribe={openSubscribe}
        autoOpenRitual={autoOpenRitual}
      />
      {subscribeModal}
    </div>
  );
}
