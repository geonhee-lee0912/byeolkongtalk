"use client";

// components/byeolmaru/DayStrip.tsx — 허브 롤링 7일 스트립.
// 역할: 오늘 뭐지? / 앞뒤 며칠은? **주 신호는 점수 숫자**이고 면 색·마크 칩·동물은 보조다.
// 🔴 1차 설계의 막대 높이는 기각됐다(2026-09-24) — "높다=좋다"를 학습해야 읽히고, 실데이터가
//    몰린 구간에서 7칸이 5px 안에 겹쳤다. 숫자는 학습이 필요 없다.
// 🔴 범위(지난 3 + 오늘 + 앞 3)는 자의적이지 않다 — strip.ts 의 STRIP_LENGTH 가 리포트 생성
//    가능 일수(FUTURE_REPORT_DAYS)에 묶여 있다. 여기서 칸 수를 바꾸지 말 것.
// 🔴 **오늘은 폭과 배경만 다르다. 내부 구성품 크기는 7칸 전부 동일하다** — 오늘만 키우면
//    다섯 줄이 가로로 안 맞아 판이 어긋나 보인다(사용자 지적).
import Image from "next/image";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";
import { MARK_CHIP, type DayMark } from "@/lib/byeolmaru/day-label";
import { cellTint, scoreDisplay, isGoodScore } from "@/lib/byeolmaru/calendar-visual";
import type { LockedCell } from "@/lib/byeolmaru/calendar";
import type { DayTone } from "@/lib/byeolmaru/day-score";
import { trackUiEvent } from "@/lib/analytics/ui-events";

/** 스트립 한 칸이 그리는 것만 받는다 — 나·우리 두 판정이 이 모양으로 수렴한다. */
export interface StripCell {
  date: string;
  /** 동물(지지) 일러스트용. */
  ganji: string;
  /** 점수 숫자·면 색의 원천. 격자와 **같은 값**을 쓴다. */
  score: number;
  /** 계측 축으로만 남는다(배경엔 안 쓴다) — offset×tone 교차를 계속 보기 위해. */
  tone: DayTone;
  /** 하루 이름. TodayLead 가 오늘 것만 쓴다 — 칸에는 안 그린다. */
  title: string;
  /** 등급 라벨("잘 맞는 날") — aria-label 전용. 숫자만으로는 스크린리더가 등급을 못 읽는다. */
  label: string;
  marks: DayMark[];
  isToday: boolean;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function weekdayOf(date: string): string {
  return WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/** 오늘 pill — 판 안에서 **유일한 어두운 면**이라 점수와 무관하게 명도로 1위가 된다. */
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
    ...cells.map((c) => ({ date: c.date, ganji: c.ganji, cell: c as StripCell | undefined })),
    ...lockedCells.map((l) => ({ date: l.date, ganji: l.ganji, cell: undefined })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (slots.length === 0) return null;

  // 🔴 트랙 수는 오늘 칸의 유무에 달려 있다 — 오늘이 span 2 를 먹으므로 있으면 8칸, 없으면 7칸.
  //    8 로 고정하면 오늘이 없는 집합(calendar.test.ts 가 덮는 상태)에서 빈 칸이 조용히 생긴다.
  const hasToday = slots.some((s) => s.cell?.isToday);

  return (
    <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${hasToday ? 8 : 7}, minmax(0,1fr))` }}>
      {slots.map(({ date, ganji, cell }) => {
        const today = cell?.isToday ?? false;
        const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayDate}T00:00:00Z`)) / 86400000);
        const dayNum = Number(date.slice(8, 10));
        const animal = branchAnimal(ganji);
        // 🔴 내부 구성품 크기는 오늘/보통이 같다. 다른 건 폭(span)과 배경뿐이다.
        const common = "flex flex-col items-center gap-1 rounded-xl pb-2 pt-2.5";

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
              className={`${common} border border-dashed`}
              style={{ background: "rgba(255,255,255,.28)", borderColor: "rgba(184,168,216,.40)" }}
            >
              <span className="text-[10px] leading-[12px] text-text-light/70">{weekdayOf(date)}</span>
              <span className="text-[12px] leading-[15px] text-text-light/70">{dayNum}</span>
              {/* 날짜·동물은 선명하다 — 만세력이라 비밀이 아니다. 가리는 건 판정(점수·마크)뿐. */}
              {animal ? (
                <Image src={animal.assetSrc} alt="" width={18} height={18} className="object-contain opacity-70" style={{ width: 18, height: 18 }} />
              ) : (
                <span aria-hidden style={{ width: 18, height: 18 }} />
              )}
              {/* 점수·칩 자리는 비운다 — 없는 걸 있는 척하지 않는다. 자리만 남겨 높이를 맞춘다. */}
              <span aria-hidden className="h-5" />
              <span aria-hidden className="h-[15px]" />
            </button>
          );
        }

        const display = scoreDisplay(cell.score);
        const numberColor = today ? "#ffffff" : isGoodScore(cell.score) ? "#412402" : "#5A3E8C";
        const chip = cell.marks.length ? MARK_CHIP[cell.marks[0].glyph] : null;

        return (
          <button
            key={cell.date}
            type="button"
            onClick={() => {
              trackUiEvent("byeolmaru_day_selected", { meta: { offset, tone: cell.tone, subjectKind, surface: "strip" } });
              onSelect(cell.date);
            }}
            aria-label={`${today ? "오늘 " : ""}${cell.date} ${cell.label} ${display}점 · ${cell.title}${cell.marks.length ? ` · ${cell.marks.map((m) => m.label).join(", ")}` : ""}`}
            className={common}
            style={{
              background: today ? TODAY_BG : cellTint(cell.score),
              gridColumn: today ? "span 2" : undefined,
            }}
          >
            <span className="text-[10px] leading-[12px]" style={{ color: today ? "rgba(255,255,255,.72)" : "#7A6BA0" }}>
              {weekdayOf(cell.date)}
            </span>
            <span className="text-[12px] leading-[15px]" style={{ color: today ? "rgba(255,255,255,.85)" : "#7A6BA0" }}>
              {dayNum}
            </span>
            {animal ? (
              <Image src={animal.assetSrc} alt="" width={18} height={18} className="object-contain" style={{ width: 18, height: 18 }} />
            ) : (
              <span aria-hidden style={{ width: 18, height: 18 }} />
            )}
            <span className="text-[17px] font-semibold leading-5" style={{ color: numberColor }}>
              {display}
            </span>
            {/* 🔴 마크가 없는 날도 자리를 비워둔다 — 없으면 칸마다 높이가 달라지고, grid 가 최고
                높이에 맞추므로 결국 위아래 여백으로 흩어진다. */}
            {chip ? (
              <span
                className="rounded-lg text-[9px] font-semibold leading-3"
                style={{ background: chip.bg, color: chip.fg, padding: "2px 5px 1px" }}
              >
                {cell.marks[0].label}
              </span>
            ) : (
              <span aria-hidden className="h-[15px]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
