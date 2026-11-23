"use client";

// components/byeolmaru/HubTodayRow.tsx — 별마루 첫 화면 맨 위 '오늘 나' 칸(디자인 다듬기 별마루 ①H3, 운영자 11-21).
// 사주 운세 탭의 '내 사주' 칸(MySajuRow)과 같은 흰 카드 문법이다:
//   윗줄 = 오늘 점수 칸 · '오늘 N점 · 하루 이름' / 날짜 · 연속 · '오늘 사주 ›'
//          (옛 달력 판 첫 줄 TodayLead 를 올렸다 — 판 안엔 이제 요일·날짜 칸만 있다)
//   아랫줄 = 허브의 **유일한** 구독 자리(옛 HubBanner 버튼을 옮김 — 2026-09-24 원칙 그대로, 미끼 카드 되살리지 말 것).
//          버튼은 옛 배너 버튼과 같은 은은한 테두리 칩 — 판매 CTA 가 아니라 탐색 어포던스다.
// 🔴 계측 축은 옛 배너 그대로다: 구독 선택지 노출 surface="banner"(SubscribeOfferShown) — 집계가 이어진다.
//    윗줄을 누르면 달력 오늘 칸과 같은 byeolmaru_day_selected(offset 0)를 surface="today_row" 로 찍는다.
import { hubSubscribeLine, hubTodayLines } from "@/lib/byeolmaru/hub-today";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import type { DayTone } from "@/lib/byeolmaru/day-score";
import SubscribeOfferShown from "./SubscribeOfferShown";
import ButtonDots from "@/components/common/ButtonDots";
import Icon from "@/components/common/Icon";

interface Props {
  today: string;
  todayName: string | null;
  todayScore: number | null;
  todayTone: DayTone | null;
  streak: number | null;
  entitled: boolean;
  trialUsed: boolean;
  subscriptionExpiresAt: string | null;
  trialEndsAt: string | null;
  onOpenToday: () => void;
  /** 비자격자가 아랫줄 버튼을 눌렀을 때 — 허브가 체험/구독 중 맞는 쪽을 고른다. */
  onSubscribe: () => void;
  /** 체험 시작 처리 중 */
  busy: boolean;
}

export default function HubTodayRow(p: Props) {
  const lines = hubTodayLines({ today: p.today, todayName: p.todayName, todayScore: p.todayScore, streak: p.streak });
  // 렌더 중 Date.now() — 허브가 달력을 받은 뒤(클라 전용 상태)에만 그려져 SSR 결과가 없다(옛 HubBanner 와 같은 이유).
  const sub = hubSubscribeLine({
    entitled: p.entitled,
    trialUsed: p.trialUsed,
    subscriptionExpiresAt: p.subscriptionExpiresAt,
    trialEndsAt: p.trialEndsAt,
    now: Date.now(),
  });
  const chipClass =
    "shrink-0 inline-flex items-center gap-0.5 rounded-xl border border-lilac-mid/60 bg-white/50 px-3 py-1 text-12 font-semibold text-accent";

  return (
    <section className="card px-4 py-3.5">
      <button
        type="button"
        onClick={() => {
          trackUiEvent("byeolmaru_day_selected", { meta: { offset: 0, tone: p.todayTone, subjectKind: "me", surface: "today_row" } });
          p.onOpenToday();
        }}
        className="flex w-full items-center gap-3 text-left transition active:scale-[0.99]"
      >
        {/* 달력 오늘 칸과 같은 색(CalendarGrid 의 오늘 = #5A3E8C 바탕 · 흰 글자) — 위 칸과 판의 오늘이 한 물건으로 읽힌다 */}
        <span
          className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none"
          style={{ background: "#5A3E8C", color: "#ffffff" }} // design-allow: 달력 오늘 칸과 같은 색
        >
          <span className="text-11" style={{ color: "rgba(255,255,255,.72)" }}>오늘</span>
          <span className="mt-0.5 text-17 font-extrabold">{p.todayScore ?? Number(p.today.slice(8, 10))}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-keep text-14 font-bold leading-snug text-eye-purple">{lines.title}</span>
          <span className="mt-0.5 block break-keep text-12 leading-snug text-text-light">{lines.sub}</span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-13 font-bold text-accent">
          오늘 사주
          <Icon name="chev_r" size={14} />
        </span>
      </button>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-lilac-mid/30 pt-2.5">
        <p className="min-w-0 break-keep text-12 leading-snug text-text-light">{sub.text}</p>
        {sub.action === null ? (
          // 정보 칩 — 누를 게 아니라서 button 이 아니다
          <span className={chipClass}>{sub.chip}</span>
        ) : (
          <>
            {/* 구독 선택지 노출 — 체험 후일 때만(체험 전은 체험 버튼이라 구독 선택지가 아니다) */}
            {sub.action === "subscribe" && <SubscribeOfferShown surface="banner" phase="post_trial" />}
            <button type="button" onClick={p.onSubscribe} disabled={p.busy} className={`${chipClass} transition active:scale-95 disabled:opacity-60`}>
              {p.busy ? <ButtonDots /> : sub.chip}
              {!p.busy && <Icon name="chev_r" size={14} />}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
