"use client";

// components/byeolmaru/TarotTodayView.tsx — 오늘 타로 전용 화면(P5-3).
// 🔴 DailyCardBlock 은 자격(entitled/trialUsed)을 props 로 받는다 — 허브가 넘겨주던 값이다.
//    전용 페이지가 되면서 스스로 캘린더 응답에서 자격을 읽어야 한다(같은 라우트를 쓴다 —
//    자격 전용 API 를 새로 만들지 않는다. 응답이 이미 entitled/trialUsed 를 싣고 있다).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import DailyCardBlock from "./DailyCardBlock";
import GuestLoginWall from "./GuestLoginWall";
import { useByeolmaruSubscribe } from "./useByeolmaruSubscribe";
import { trackUiEvent } from "@/lib/analytics/ui-events";

type Ent = {
  entitled: boolean;
  trialUsed: boolean;
  /** 체험 자격자의 만료(구독자는 null) — 체험 넛지의 D-N 과 구독 확인창 단계가 본다. */
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
};

type State =
  | { kind: "loading" }
  | { kind: "need_login" }
  | { kind: "error" }
  | ({ kind: "ready"; today: string } & Ent);

// 캘린더 응답(200·404 공통)의 자격 필드 — 라우트가 404 에도 네 필드를 다 싣는다. 네 곳에서 같은 모양으로
// 읽으니 한 군데로 모은다(필드가 늘 때 한 곳만 빠뜨리는 일이 없게).
function entFrom(j: Partial<Ent> | null): Ent {
  return {
    entitled: !!j?.entitled,
    trialUsed: !!j?.trialUsed,
    trialEndsAt: j?.trialEndsAt ?? null,
    subscriptionExpiresAt: j?.subscriptionExpiresAt ?? null,
  };
}

export default function TarotTodayView({
  initialDate,
  injected,
  reloadEntitlement,
  autoOpenRitual = false,
}: {
  initialDate?: string;
  injected?: { status: number; body: unknown };
  /** 껍데기(DayTabsView)의 캘린더 다시 받기 — 체험·구독 뒤 이 탭을 포함해 열린 탭 전부를 새 자격으로 그린다.
   *  없으면(껍데기 밖) 이 탭만 서버에서 다시 읽는다(refreshFromServer). */
  reloadEntitlement?: () => Promise<void>;
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
        setState({ kind: "ready", ...entFrom(body as Partial<Ent> | null), today: kstNow });
        return;
      }
      // 🔴 404 외 오류(500·네트워크 등)는 "모르는 상태"다 — entitled:false 로 접으면 이미
      //    체험을 쓴 구독자에게 "3일 무료 체험 시작"이 다시 뜬다(위 404 분기와 같은 버그가
      //    트리거만 바뀐 것). error 로 보내 별도 화면을 띄운다.
      if (status < 200 || status >= 300) { setState({ kind: "error" }); return; }
      const j = body as (Partial<Ent> & { today?: string }) | null;
      if (!j) { setState({ kind: "error" }); return; }
      setState({ kind: "ready", ...entFrom(j), today: j.today ?? kstNow });
    } catch {
      setState({ kind: "error" });
    }
  }
  useEffect(() => { void refresh(); }, []);

  // 🔴 구독·체험이 바뀐 뒤의 갱신은 **진입 스냅샷을 다시 읽지 않는다** — 그건 진입 때 한 번 받은 값이라 방금 산
  //    구독이 안 보인다. 껍데기 안이면 껍데기가 다시 받아 열린 탭 전부에 내려주고(reloadEntitlement — 아래
  //    useLayoutEffect 가 받아 그린다), 밖이면 이 탭만 서버를 다시 문다.
  const { startTrial, trialStarting, openSubscribe, subscribeModal } = useByeolmaruSubscribe(
    reloadEntitlement ?? refreshFromServer,
    state.kind === "ready" ? state : null
  );

  // 자격이 바뀐 뒤의 캘린더 응답 → 화면(진입 refresh 와 같은 판단이되 계측은 안 찍는다).
  function applyCalendar(status: number, body: unknown) {
    const kstNow = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    if (status === 401) { setState({ kind: "need_login" }); return; }
    if (status === 404) {
      setState({ kind: "ready", ...entFrom(body as Partial<Ent> | null), today: kstNow });
      return;
    }
    if (status < 200 || status >= 300 || !body) { setState({ kind: "error" }); return; }
    const j = body as Partial<Ent> & { today?: string };
    setState({ kind: "ready", ...entFrom(j), today: j.today ?? kstNow });
  }

  async function refreshFromServer() {
    const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
    applyCalendar(res.status, await res.json().catch(() => null));
  }

  // 🔴 껍데기가 자격 스냅샷을 다시 받아 내려주면(byeolmaru:entitlement-changed) 그걸로 다시 그린다 — 실측(10-11):
  //    사주 탭에서 체험을 시작한 뒤 이 탭에서 카드를 뽑으면 리포트 아래에 "지금은 구독 중이 아니야" + '3일 무료로
  //    열어보기'가 떴다(진입 스냅샷). 첫 주입은 refresh() 몫. layout effect 인 이유는 SajuTodayView 와 같다.
  const appliedInjected = useRef(injected);
  useLayoutEffect(() => {
    if (!injected || injected === appliedInjected.current) return;
    appliedInjected.current = injected;
    applyCalendar(injected.status, injected.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injected]);

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
        trialEndsAt={state.trialEndsAt}
        subscriptionExpiresAt={state.subscriptionExpiresAt}
        onStartTrial={startTrial}
        onSubscribe={openSubscribe}
        trialBusy={trialStarting}
        autoOpenRitual={autoOpenRitual}
      />
      {subscribeModal}
    </div>
  );
}
