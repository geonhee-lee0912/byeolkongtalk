"use client";

// components/byeolmaru/DayStrip.tsx — 허브 롤링 7일 스트립(스펙 §2-1).
// 지난 3일 + 오늘(2배 폭) + 앞으로 3일. 가려지는 게 **미래**라 "안 준다"가 아니라 "아직 안 온 날"로
// 읽힌다 — 자물쇠를 쓰지 않는다는 P5 §2 원칙과 맞는 유일한 블러 형태다.
// 🔴 흐린 칸 수를 세지 않는다 — lockedCells 가 곧 그 집합이다(서버 무료선의 산물).
import Image from "next/image";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";
import { MARK_COLOR, type DayMark } from "@/lib/byeolmaru/day-label";
import type { LockedCell } from "@/lib/byeolmaru/calendar";
import type { DayTone } from "@/lib/byeolmaru/day-score";
import { trackUiEvent } from "@/lib/analytics/ui-events";

/** 스트립 한 칸이 그리는 것만 받는다 — 나·우리 두 판정이 이 모양으로 수렴한다(GridCell 과 같은 패턴). */
export interface StripCell {
  date: string;
  ganji: string;
  tone: DayTone;
  /** 하루 이름(나 탭) 또는 톤 라벨(우리 탭). 오늘 칸에만 보인다. */
  title: string;
  marks: DayMark[];
  isToday: boolean;
}

const TONE_BG: Record<DayTone, string> = {
  good: "linear-gradient(160deg,#F7DFA4,#E8C26A)",
  normal: "#ffffff",
  caution: "linear-gradient(160deg,#EFE7F8,#DCCFF0)",
};

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function weekdayOf(date: string): string {
  return WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

interface Props {
  cells: StripCell[];
  lockedCells: LockedCell[];
  todayDate: string;
  /** 열린 칸 탭 — 그날 상세로 보낸다. */
  onSelect: (date: string) => void;
  /** 흐린(미래) 칸 탭 — 비자격자에게 구독 안내. */
  onLockedSelect: () => void;
  subjectKind: "me" | "pair";
}

export default function DayStrip({ cells, lockedCells, todayDate, onSelect, onLockedSelect, subjectKind }: Props) {
  const slots = [
    ...cells.map((c) => ({ date: c.date, ganji: c.ganji, cell: c as StripCell | undefined })),
    ...lockedCells.map((l) => ({ date: l.date, ganji: l.ganji, cell: undefined })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (slots.length === 0) return null;

  return (
    <div
      // 오늘 칸이 2배 폭이라 트랙은 7이 아니라 8칸이다. 오늘이 span 2 를 먹는다.
      className="grid gap-1"
      style={{ gridTemplateColumns: "repeat(8, minmax(0,1fr))" }}
    >
      {slots.map(({ date, ganji, cell }) => {
        const today = cell?.isToday ?? false;
        const animal = branchAnimal(ganji);
        const common = "flex flex-col items-center justify-center rounded-xl py-1.5";
        const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayDate}T00:00:00Z`)) / 86400000);

        if (!cell) {
          return (
            <button
              key={date}
              type="button"
              onClick={() => {
                trackUiEvent("byeolmaru_strip_future_tapped", { meta: { offset, subjectKind } });
                onLockedSelect();
              }}
              aria-label={`${date} 아직 안 온 날`}
              className={`${common} border border-dashed`}
              style={{ background: "rgba(255,255,255,.28)", borderColor: "rgba(184,168,216,.40)" }}
            >
              <span className="text-[10px] leading-none text-text-light/70">{weekdayOf(date)}</span>
              <span className="mt-0.5 text-[12px] font-semibold leading-none text-text-light/70">{Number(date.slice(8, 10))}</span>
              {/* 날짜·동물은 선명하다 — 만세력이라 비밀이 아니다(스펙 §3). 가리는 건 판정뿐. */}
              {animal ? <Image src={animal.assetSrc} alt="" width={18} height={18} className="mt-0.5 h-[18px] w-[18px] object-contain opacity-70" /> : null}
              <span aria-hidden className="mt-1 h-[10px] w-5 rounded-full bg-lilac-mid/30" />
            </button>
          );
        }

        return (
          <button
            key={date}
            type="button"
            onClick={() => {
              trackUiEvent("byeolmaru_day_selected", { meta: { offset, tone: cell.tone, subjectKind, surface: "strip" } });
              onSelect(date);
            }}
            aria-label={`${date} ${cell.title}${cell.marks.length ? ` · ${cell.marks.map((m) => m.label).join(", ")}` : ""}`}
            className={common}
            style={{
              background: TONE_BG[cell.tone],
              gridColumn: today ? "span 2" : undefined,
              ...(today ? { boxShadow: "0 0 0 2px #5A3E8C" } : {}),
            }}
          >
            <span className="text-[10px] leading-none text-text-light">{today ? "오늘" : weekdayOf(date)}</span>
            <span className="mt-0.5 text-[12px] font-semibold leading-none text-eye-purple">{Number(date.slice(8, 10))}</span>
            {animal ? (
              <Image
                src={animal.assetSrc}
                alt=""
                width={today ? 26 : 18}
                height={today ? 26 : 18}
                className="mt-0.5 object-contain"
                style={{ width: today ? 26 : 18, height: today ? 26 : 18 }}
              />
            ) : null}
            {/* 정보는 오늘 칸에 몰린다 — 나머지 6칸이 조용해야 "번잡 vs 허전" 딜레마가 풀린다. */}
            {today && (
              <span className="mt-0.5 line-clamp-2 px-1 text-center text-[10px] leading-tight text-eye-purple">{cell.title}</span>
            )}
            {cell.marks.length ? (
              <span
                className="mt-0.5 rounded-full px-1 text-[9px] font-bold leading-[13px] text-night-deep"
                style={{ background: `${MARK_COLOR[cell.marks[0].glyph]}${cell.marks[0].strength === "full" ? "59" : "26"}` }}
              >
                {cell.marks[0].label}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
