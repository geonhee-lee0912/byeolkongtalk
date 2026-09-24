"use client";

// components/byeolmaru/DayStrip.tsx — 허브 롤링 7일 스트립.
// 역할: **이번 주 언제가 좋지?**(메인) / 오늘 뭐지?(서브). 비교가 주인공이라 7칸이 같은 문법이고,
// 오늘의 *내용*은 칸 밖(TodayLead)으로 나간다 — 칸 안에서 오늘은 *위치 표시*만 한다.
// 🔴 범위(지난 3 + 오늘 + 앞 3)는 자의적이지 않다 — strip.ts 의 STRIP_LENGTH 가 리포트 생성
//    가능 일수(FUTURE_REPORT_DAYS)에 묶여 있다. 여기서 칸 수를 바꾸지 말 것.
// 🔴 톤 색면을 배경에 쓰지 않는다(2026-09-24) — 실측 normal 64% 라 7칸 중 4~5칸이 같은 색이었고,
//    게다가 톤 색면이 위계를 이겨 '잘 맞는 어제'가 '무난한 오늘'보다 강해 보였다. 비교는 막대가,
//    위계는 오늘 pill 이 맡는다.
import { MARK_COLOR, MARK_TINT, type DayMark } from "@/lib/byeolmaru/day-label";
import { barColor, barHeightPx } from "@/lib/byeolmaru/calendar-visual";
import type { LockedCell } from "@/lib/byeolmaru/calendar";
import type { DayTone } from "@/lib/byeolmaru/day-score";
import { trackUiEvent } from "@/lib/analytics/ui-events";

/** 스트립 한 칸이 그리는 것만 받는다 — 나·우리 두 판정이 이 모양으로 수렴한다. */
export interface StripCell {
  date: string;
  /** 막대 높이·색의 원천. 격자의 셀 틴트와 **같은 값**을 쓴다. */
  score: number;
  /** 계측 축으로만 남는다(배경엔 안 쓴다) — offset×tone 교차를 계속 보기 위해. */
  tone: DayTone;
  /** 하루 이름. 지금은 TodayLead 가 오늘 것만 쓴다 — 칸에는 안 그린다. */
  title: string;
  marks: DayMark[];
  isToday: boolean;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function weekdayOf(date: string): string {
  return WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/** 오늘 pill — 판 안에서 **유일한 어두운 면**이라 톤과 무관하게 명도로 1위가 된다. */
const TODAY_BG = "#5A3E8C";

interface Props {
  cells: StripCell[];
  lockedCells: LockedCell[];
  todayDate: string;
  onSelect: (date: string) => void;
  onLockedSelect: () => void;
  subjectKind: "me" | "pair";
}

export default function DayStrip({ cells, lockedCells, todayDate, onSelect, onLockedSelect, subjectKind }: Props) {
  const slots = [
    ...cells.map((c) => ({ date: c.date, cell: c as StripCell | undefined })),
    ...lockedCells.map((l) => ({ date: l.date, cell: undefined })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (slots.length === 0) return null;

  return (
    // 🔴 7칸 균등이다. 예전엔 오늘이 span 2 라 8트랙이었고 일반 칸이 35px 로 눌렸다 — 오늘의
    //    하루 이름을 칸 안에 넣느라 그랬는데, 그 텍스트가 TodayLead 로 나가면서 이유가 사라졌다.
    <div className="grid grid-cols-7 gap-0.5">
      {slots.map(({ date, cell }) => {
        const today = cell?.isToday ?? false;
        const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayDate}T00:00:00Z`)) / 86400000);
        const dayNum = Number(date.slice(8, 10));

        if (!cell) {
          return (
            <button
              key={date}
              type="button"
              onClick={() => {
                trackUiEvent("byeolmaru_strip_future_tapped", { meta: { offset, subjectKind } });
                onLockedSelect();
              }}
              aria-label={`${date} 아직 안 온 날 — 눌러서 미리 보기`}
              className="flex flex-col items-center justify-end rounded-xl border border-dashed py-1.5"
              style={{ background: "rgba(255,255,255,.28)", borderColor: "rgba(184,168,216,.40)" }}
            >
              {/* 막대 자리는 비운다 — 없는 걸 있는 척하지 않는다. 자리만 남겨 칸 높이를 맞춘다. */}
              <span aria-hidden className="h-7 w-[6px]" />
              <span className="mt-1 text-[10px] leading-none text-text-light/70">{weekdayOf(date)}</span>
              <span className="mt-0.5 text-[15px] font-semibold leading-none text-text-light/70">{dayNum}</span>
              <span aria-hidden className="mt-1 h-[13px]" />
            </button>
          );
        }

        return (
          <button
            key={cell.date}
            type="button"
            onClick={() => {
              trackUiEvent("byeolmaru_day_selected", { meta: { offset, tone: cell.tone, subjectKind, surface: "strip" } });
              onSelect(cell.date);
            }}
            aria-label={`${today ? "오늘 " : ""}${cell.date} ${cell.title}${cell.marks.length ? ` · ${cell.marks.map((m) => m.label).join(", ")}` : ""}`}
            className="flex flex-col items-center justify-end rounded-xl py-1.5"
          >
            {/* ① 막대 — 비교 신호. 높이가 점수, 색은 good 만 금색. */}
            <span aria-hidden className="flex h-7 items-end">
              <span
                className="block w-[6px] rounded-full"
                style={{ height: barHeightPx(cell.score), background: barColor(cell.score) }}
              />
            </span>
            {/* ②③ 요일 + 날짜. 오늘이면 둘을 pill 하나가 함께 감싼다. */}
            <span
              className="mt-1 flex flex-col items-center rounded-lg px-1.5 py-0.5"
              style={today ? { background: TODAY_BG } : undefined}
            >
              <span className={`text-[10px] leading-none ${today ? "text-white/80" : "text-text-light"}`}>
                {weekdayOf(cell.date)}
              </span>
              <span className={`mt-0.5 text-[15px] font-semibold leading-none ${today ? "text-white" : "text-eye-purple"}`}>
                {dayNum}
              </span>
            </span>
            {/* ④ 마크 칩 — 없어도 자리를 비워 칸 높이를 맞춘다(grid 는 최고 높이에 맞춘다). */}
            {cell.marks.length ? (
              <span
                // 🔴 MARK_COLOR 는 배경 틴트로만 — 글자로 쓰면 이 옅은 판 위에서 전 조합 AA 미달이다.
                className="mt-1 rounded-full px-1 text-[9px] font-bold leading-[13px] text-night-deep"
                style={{ background: `${MARK_COLOR[cell.marks[0].glyph]}${MARK_TINT[cell.marks[0].strength]}` }}
              >
                {cell.marks[0].label}
              </span>
            ) : (
              <span aria-hidden className="mt-1 h-[13px]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
