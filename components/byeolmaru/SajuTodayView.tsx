"use client";

import { useEffect, useState } from "react";
import type { DayCell, WeekBucket } from "@/lib/byeolmaru/calendar";
import type { DailyReport } from "@/lib/fortune/daily-report";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { shareToKakao, isKakaoReady } from "@/lib/kakao-share";
import { DAY_NAME } from "@/lib/byeolmaru/day-label";
import { dayWordFor, reportDatePolicy } from "@/lib/byeolmaru/report-date";
import { getSajuTaste } from "@/lib/byeolmaru/static-lines";
import { SAJU_PAID_CHARS, SAJU_PAID_SECTIONS } from "@/lib/byeolmaru/paywall-sections";
import { BYEOLMARU_SUBSCRIPTION } from "@/lib/byeolmaru/constants";
import DailyReportCard from "@/components/fortune/DailyReportCard";
import DayDetailCard from "./DayDetailCard";
import GuestLoginWall from "./GuestLoginWall";
import BirthPromptButton, { reloadAfterSave } from "@/components/saju/BirthPromptButton";
import { BIRTH_PROMPT_SURFACE } from "@/lib/analytics/birth-prompt-surface";
import PaywallCut from "./PaywallCut";
import { useByeolmaruSubscribe } from "./useByeolmaruSubscribe";

interface CalendarResponse {
  today: string;
  todayGanji: string;
  cells: DayCell[];
  weeks: WeekBucket[];
  entitled: boolean;
  trialUsed: boolean;
  subscriptionExpiresAt: string | null;
  monthStart: string;
  monthEnd: string;
}

type State =
  | { kind: "loading" }
  | { kind: "need_login" }
  | { kind: "no_profile" }
  | { kind: "error" }
  | { kind: "ready"; data: CalendarResponse };


export default function SajuTodayView({
  initialDate,
  injected,
}: {
  initialDate?: string;
  injected?: { status: number; body: unknown };
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  // 지난 날인데 그때 받은 리포트가 없는 경우 — 생성 실패와 구분해야 안내 문구가 맞는다.
  const [notGenerated, setNotGenerated] = useState(false);
  // 🔴 "오늘 + 캐시 미스 + 비자격"이 **확정**됐다는 신호(daily-report 의 403) — report===null 이
  //    "아직 로딩"인지 "네트워크 blip"인지 "정말 잠김"인지를 가른다. PaywallCut 은 이 값이
  //    true 일 때만 마운트한다(스펙 §4-4, 2026-09-26 — gate_shown 계측 계약 유지).
  const [locked, setLocked] = useState(false);

  async function refresh() {
    try {
      // 🔴 껍데기(DayTabsView)가 이미 캘린더를 불렀으면 그걸 쓴다 — 탭을 오갈 때마다 다시
      //    부르면 "오가기"라는 목적이 깨진다. 옵셔널이라 주입이 없으면 지금처럼 스스로 부른다.
      const { status, body } =
        injected ??
        (await (async () => {
          const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
          return { status: res.status, body: await res.json().catch(() => null) };
        })());
      if (status === 401) { trackUiEvent("byeolmaru_need_login"); setState({ kind: "need_login" }); return; }
      if (status === 404) { trackUiEvent("byeolmaru_no_profile"); setState({ kind: "no_profile" }); return; }
      if (status < 200 || status >= 300) { setState({ kind: "error" }); return; }
      const data = body as CalendarResponse;
      if (!data || data.cells.length === 0) { setState({ kind: "error" }); return; }
      setState({ kind: "ready", data });
      // 허브 격자에서 넘어온 ?date= 가 있으면 그 날로 연다(스펙 §7 "요약은 허브, 전문은 밖").
      // 🔴 응답에 없는 날짜(무료 유저가 손으로 미래 날짜를 친 경우)면 무시하고 오늘로 — 서버가
      //    안 내려준 날을 선택 상태로 두면 cell 폴백이 타서 엉뚱한 날 상세가 열린다.
      // 🔴 앞뒤 달 채움은 2026-09-27 에 폐지됐다 — 격자가 이번 달만 그리므로 조회 대상도
      //    data.cells 하나다. 채움이 있던 동안엔 합집합이 필요했다(안 더하면 채움 칸이 "응답에
      //    없는 날짜"로 오판돼 조용히 오늘로 폴백했다).
      const wanted = initialDate && data.cells.some((c) => c.date === initialDate) ? initialDate : data.today;
      setSelected((prev) => prev ?? wanted);

      setReport(null); setReportLoading(false);
    } catch { setState({ kind: "error" }); return; }
  }

  useEffect(() => { void refresh(); }, []);

  // 리포트는 선택 날짜 기준으로 따로 받아온다 — refresh() 안에 두면 날짜를 바꿔도 오늘 것만 계속 붙는다.
  const entitled = state.kind === "ready" && state.data.entitled;
  const todayKst = state.kind === "ready" ? state.data.today : null;
  useEffect(() => {
    if (!selected || !todayKst) { setReport(null); setReportLoading(false); setNotGenerated(false); setLocked(false); return; }
    const p = reportDatePolicy(selected, todayKst);
    // 🔴 범위 밖 미래는 서버에 묻지 않는다 — 달력이 전면 무료라 **누구나** 이번 달 모든 날짜를
    //    클릭할 수 있는데, 내일부터는 라우트가 400 date_out_of_range 를 준다. 화면 안내 문구는
    //    이제 아래 렌더의 policy 분기가 자격과 무관하게 책임지므로(2026-09-26), 여기 남은 이유는
    //    오직 어차피 400 이 될 요청을 막는 것뿐이다.
    if (p === "out_of_range") {
      setReport(null); setNotGenerated(false); setReportLoading(false); setLocked(false);
      return;
    }
    // 🔴 "오늘 + 비자격이면 부르지 않는다"는 가드를 뺐다(2026-09-26) — 라우트가 캐시 조회를
    //    자격 게이트보다 먼저 하도록 바뀌어서, 이 조합이 403 확정이 아니라 **캐시 히트일 수
    //    있다**(당일 낮 만료 유저가 그날 아침에 받아둔 글). 미래만 여전히 안 부른다.
    let cancelled = false;
    setReport(null);
    setNotGenerated(false);
    setLocked(false);
    setReportLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/daily-report?date=${selected}`, { cache: "no-store" });
        // 🔴 403 은 "오늘 + 캐시 미스 + 비자격"에서만 온다(daily-report 라우트 계약) — 캐시가
        //    없음이 **확정**된 유일한 신호다. reportLoading=false·report=null 만으로 잠금을
        //    단정하지 않는다 — 그러면 네트워크 blip 도 PaywallCut 으로 보인다(요구사항 2).
        if (res.status === 403) {
          if (!cancelled) { setReport(null); setNotGenerated(false); setLocked(true); }
          return;
        }
        const j = await res.json();
        if (!cancelled) {
          setReport(j.report ?? null);
          setNotGenerated(j.reason === "not_generated");
        }
      } catch {
        if (!cancelled) { setReport(null); setNotGenerated(false); }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // 🔴 entitled 를 deps 에 남긴다 — 본문은 더 이상 안 읽지만, 구독/체험이 막 성공해 값이
    //    바뀌면 직전에 잠겼던(locked) 요청을 다시 불러야 한다(락은 그 순간의 자격을 반영할
    //    뿐이라 자격이 바뀌면 다시 확인해야 참이 된다).
  }, [entitled, selected, todayKst]);

  // 🔴 구독·체험이 바뀐 뒤의 갱신은 **주입을 무시하고 서버를 다시 문다** — 주입값은 껍데기가
  //    진입 시 한 번 받은 스냅샷이라, 그걸 다시 읽으면 방금 산 구독이 화면에 반영되지 않는다.
  const { startTrial, openSubscribe, subscribeModal } = useByeolmaruSubscribe(() => void refreshFromServer());

  async function refreshFromServer() {
    const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (res.status === 401) { setState({ kind: "need_login" }); return; }
    if (res.status === 404) { setState({ kind: "no_profile" }); return; }
    if (!res.ok || !body) { setState({ kind: "error" }); return; }
    setState({ kind: "ready", data: body as CalendarResponse });
  }

  if (state.kind === "loading") return <p className="text-center text-text-light">펼치는 중…</p>;
  // 🔴 벽은 세 탭이 공유한다(GuestLoginWall) — 문구·레이아웃을 여기서 다시 쓰지 말 것.
  if (state.kind === "need_login") return <GuestLoginWall next="/byeolmaru/day" />;
  if (state.kind === "no_profile") return (
    <div className="text-center">
      <p className="mb-4 text-eye-purple">생년월일을 알려주면 네 달력을 그려줄게.</p>
      {/* 🔴 저장 뒤 새로 불러온다 — 세 탭이 껍데기의 캘린더 응답을 나눠 쓰므로 이 탭만 갱신하면
          옆 탭이 낡은 404 로 남는다(스펙 §3). */}
      <BirthPromptButton
        surface={BIRTH_PROMPT_SURFACE.byeolmaruDaySaju}
        onSaved={reloadAfterSave}
        className="rounded-xl bg-lilac-deep px-4 py-2 text-cream disabled:opacity-60"
      >
        생년월일 입력하기
      </BirthPromptButton>
    </div>
  );
  if (state.kind === "error") return <p className="text-center text-text-light">지금은 못 펼쳤어. 잠시 뒤에 다시 와줄래?</p>;

  const { data } = state;
  // 폴백은 cells[0](= 이번 달 1일)이 아니라 **오늘**이다 — 달력이 이번 달로 바뀌며 1일이 되면
  // 첫 진입에서 엉뚱한 날짜의 상세가 열린다.
  const todayCell = data.cells.find((c) => c.isToday) ?? data.cells[data.cells.length - 1];
  const cell = data.cells.find((c) => c.date === selected) ?? todayCell;
  const dayWord = dayWordFor(cell.date, data.today);
  const policy = reportDatePolicy(cell.date, data.today);
  // 절단선 칩의 숫자는 실제로 그린 글자 수다 — DayDetailCard 가 쓰는 것과 같은 뱅크(같은 인자 → 같은 문장).
  const taste = getSajuTaste(cell.grade.tone, cell.axes, cell.relation, cell.date);
  const tasteText = [taste.overall, taste.love, taste.work, taste.money, taste.advice].filter(Boolean).join(" ");
  return (
    <div className="space-y-4">
      {/* 한 장(§5-1) — 무료 구간(일진 히어로·taste·축·그날 카드)은 DayDetailCard 가 그리고,
          그 아래 children 으로 유료 리포트·절단선·미래 날짜 안내 문구 중 하나가 붙는다.
          🔴 PaywallCut 은 마운트만으로 gate_shown 을 찍는다 — 반드시 **비자격 분기에서만** 넘긴다
             (자격자에게 넘기면 그 계측의 분모가 구독자로 오염된다). */}
      <DayDetailCard cell={cell} dayWord={dayWord}>
        {policy === "out_of_range" ? (
          /* 🔴 날짜 판정이 자격 판정보다 **바깥**이다(2026-09-26). 안쪽에 두면 비자격자가
             미래 날짜에서 PaywallCut 을 보는데, 그 글은 결제해도 존재하지 않는다
             (daily-report 가 400 date_out_of_range). 파는 자리는 "더 보고 싶다"가 생기는
             자리여야 하고, 미래 날짜는 읽을 게 없어 그 감정이 생길 수 없는 자리다.
             🔴 덤으로 gate_shown 계측 분모에서 "팔 수 없는 날"이 빠져 정확해진다 —
                PaywallCut 은 마운트만으로 그 이벤트를 찍는다. */
          /* 🔴 "그날 이야기는 그날 아침에 들려줄게."에서 줄였다(실물 검수) — 바로 위 카드
             블록이 "카드는 그날 뽑는 거야."를 말해서, 둘이 연달아 붙으면 **같은 말을 두 번**
             하는 것처럼 읽혔다(둘 다 "그날"로 시작하고 어조가 같다). 가리키는 대상은
             다르므로(카드 / 리포트) 카드 줄을 지우지 않고 이쪽을 짧게 만들어 결을 벌린다. */
          <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
            그날 아침에 열려.
          </p>
        ) : reportLoading ? (
          /* 🔴 로딩 문구가 report/notGenerated/locked 세 분기보다 **먼저** 온다(2026-09-26) —
             오늘 + 비자격도 이제 fetch 가 실제로 돈다. locked 는 fetch 가 끝나야만 true 가 될 수
             있어 이 순서가 없어도 PaywallCut 이 로딩 중에 뜰 길은 없지만, "PaywallCut 이 잠깐
             떴다가 글로 바뀌면 안 된다"(요구사항 1)를 코드 구조로도 분명히 해 둔다. */
          <div className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
            {dayWord} 리포트를 펼치는 중…
          </div>
        ) : report ? (
          /* 🔴 report 유무만 본다 — policy·자격은 안 본다(2026-09-26, 스펙 §4-4). 과거든 오늘이든
             캐시가 있으면 받았던 글이니 그대로 보여준다. 다만 **지금** 비자격이면 그 사실을
             조용히 알리고 재구독을 권한다(사용자 결정 — 이 글을 뺏지 않는다). */
          <div className="mt-4 border-t border-lilac-mid/20 pt-4">
            {/* dateLabel={null} — 날짜는 한 장의 헤더가 이미 말했다. embedded 는 상단 바 자체를
                안 그려 넘겨도 안 보이지만, 계약을 분명히 하려고 null 을 준다. */}
            <DailyReportCard report={report} dateLabel={null} dayWord={dayWord} variant="embedded" />
            {!data.entitled && (
              /* 🔴 PaywallCut 재사용 금지 — 이 글은 이미 다 나와 있어 "여기부터 더 있어"가
                 거짓말이 된다(그 컴포넌트는 마운트만으로 gate_shown 도 찍어 분모를 오염시킨다).
                 계측 없음(확신이 안 서 스킵 — 보고 참고). */
              <div className="mt-4 border-t border-lilac-mid/20 pt-3 text-center">
                <p className="text-xs text-text-light">
                  지금은 구독 중이 아니야. {dayWord} 받은 글은 계속 볼 수 있어 — 새 글은 구독해야 볼 수 있어.
                </p>
                {data.trialUsed ? (
                  <button
                    onClick={() => openSubscribe("saju_report")}
                    className="mt-2 w-full rounded-xl bg-gold py-2 text-xs font-bold text-night"
                  >
                    구독하고 매일 보기 · {BYEOLMARU_SUBSCRIPTION.cost}별 / {BYEOLMARU_SUBSCRIPTION.days}일
                  </button>
                ) : (
                  <button
                    onClick={() => startTrial("saju_report")}
                    className="mt-2 w-full rounded-xl bg-gold py-2 text-xs font-bold text-night"
                  >
                    3일 무료로 열어보기
                  </button>
                )}
              </div>
            )}
          </div>
        ) : notGenerated ? (
          <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
            그날은 리포트를 안 받았어.
            <br />
            지난 날은 그때 받은 것만 보여줄 수 있어.
          </p>
        ) : locked ? (
          /* 🔴 여기만 border-t 래퍼가 없다(의도) — PaywallCut 이 자체 금색 절단선을 갖고 있어
                감싸면 선이 두 개가 된다. 위 분기들과 "통일"하지 말 것.
             🔴 locked(403 확정)일 때만 그린다 — "캐시된 글이 없음이 확정된 뒤"에만 마운트한다는
                요구사항 2가 이 한 조건으로 지켜진다(추측이 아니라 실제 서버 응답 신호). */
          <PaywallCut
            freeChars={tasteText.length}
            paidChars={SAJU_PAID_CHARS}
            sections={SAJU_PAID_SECTIONS}
            blurText={tasteText}
            trialUsed={data.trialUsed}
            onStartTrial={startTrial}
            onSubscribe={openSubscribe}
            slot="saju_report"
          />
        ) : (
          <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
            별콩이가 잠깐 숨 고르는 중이야. 조금 뒤에 다시 와줄래?
          </p>
        )}
      </DayDetailCard>
      {/* 오늘 공유 — 선택 셀이 오늘일 때만(미래 날 보다 공유하면 "오늘 사주" 라벨로 다른 날이 나가는 오노출 방지). */}
      {cell.isToday ? (
        <button
          onClick={() => {
            const ok = shareToKakao({
              title: `오늘 사주 · ${DAY_NAME[cell.tenGod]}`,
              description: "오늘 네 하루 흐름, 별마루에서 무료로 매일 확인해봐.",
              imageUrl: `${window.location.origin}/api/og/byeolmaru/saju?grade=${cell.grade.tone}&ganji=${encodeURIComponent(cell.ganji)}&tg=${encodeURIComponent(cell.tenGod)}`,
              // 🔴 착지는 **허브**다(`/byeolmaru`). 공유 링크를 받는 사람은 대부분 비사용자인데,
              //    `/byeolmaru/saju` 는 비로그인에게 로그인 벽 한 줄뿐이라 utm 으로 재려는 바로 그
              //    전환을 깎는다. 허브는 게스트 미리보기(EmptyMonthShell)가 있어 받아낼 화면이 있다.
              link: `${window.location.origin}/byeolmaru?utm_source=byeolmaru_saju&utm_medium=share`,
              buttonTitle: "나도 보러가기",
            });
            trackUiEvent("byeolmaru_share_clicked", { meta: { kind: "saju", ok } });
          }}
          disabled={!isKakaoReady()}
          // 🔴 `py-2.5 text-sm` 은 바로 위 구독 CTA(PaywallCut 의 금색 버튼)와 **같은 상자**다
          //    (2026-09-27, 사용자 요청). 예전 `py-2 text-xs` 는 34px 로 41px 짜리 CTA 아래에
          //    혼자 납작해 보였다. 둘 중 하나를 바꿀 땐 같이 볼 것.
          className="w-full rounded-xl border border-lilac-mid/40 bg-white py-2.5 text-sm font-medium text-lilac-deep disabled:opacity-40"
        >
          오늘 사주 공유하기
        </button>
      ) : null}
      {subscribeModal}
    </div>
  );
}
