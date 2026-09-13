"use client";

import Image from "next/image";
import type { DayTone } from "@/lib/byeolmaru/day-score";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import type { DayMark } from "@/lib/byeolmaru/day-label";

// 나(DayCell)·우리(PairDayCell) 어느 쪽도 아닌 정규화 셀 — 두 판정 엔진의 톤 3단(good/normal/
// caution)이 같은 union(DayTone===PairTone)이라 호출부가 이 모양으로만 매핑해 넘기면 그리드는
// 어느 쪽 캘린더든 그대로 그린다.
export interface GridCell {
  date: string;
  ganji: string;
  tone: DayTone;
  label: string;
  isToday: boolean;
  /** 원인 마크(P5-1). 셀은 첫 마크만 그린다(겹침 실측). 개수 상한은 dayFactors() 가 정한다 —
   *  육합과 충은 같은 지지 짝에서 나와 동시에 참이 될 수 없다.
   *  🔴 옵셔널이 아니다 — 옵셔널이면 호출부에서 marks 전달을 빼도 타입체크·테스트가 다 통과한 채
   *     글리프만 조용히 사라진다. 마크가 없는 호출부(우리 오늘)는 빈 배열을 명시한다. */
  marks: DayMark[];
}

// 등급 색 — 오행 색(SajuBoard ELEMENT_COLORS)과 섞이지 않게 별콩이 톤 3단계만 쓴다.
const TONE_BG: Record<DayTone, string> = {
  good: "bg-gold-soft",
  normal: "bg-lilac-soft",
  caution: "bg-cream-warm",
};
const TONE_RING: Record<DayTone, string> = {
  good: "ring-gold",
  normal: "ring-lilac",
  caution: "ring-lilac-mid",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface Props {
  cells: GridCell[];
  /** 아직 안 온 날(P5-2 무료선). 판정이 없는 날짜 문자열만 온다 — 서버가 내용을 안 실어 보낸다. */
  lockedDates: string[];
  /** KST 오늘. 계측 offset 의 기준이자 "안 온 날" 문구의 기준. */
  todayDate: string;
  selectedDate: string;
  onSelect: (date: string) => void;
}

export default function CalendarGrid({ cells, lockedDates, todayDate, selectedDate, onSelect }: Props) {
  // 열린 칸 + 안 온 칸을 날짜순으로 합친다. cell 이 없는 슬롯 = 아직 안 온 날.
  const slots: { date: string; cell?: GridCell }[] = [
    ...cells.map((c) => ({ date: c.date, cell: c })),
    ...lockedDates.map((d) => ({ date: d })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (slots.length === 0) return null;

  // 첫 슬롯(=이번 달 1일)의 요일만큼 앞을 비워 요일 열을 맞춘다.
  const firstWeekday = new Date(`${slots[0].date}T00:00:00`).getDay();
  const blanks = Array.from({ length: firstWeekday }, (_, i) => i);

  // 범례는 **이 달에 실제로 뜬 마크만** 보여준다 — 안 나온 글리프까지 나열하면 잡음이 된다.
  const legend = Array.from(new Map(cells.flatMap((c) => c.marks).map((m) => [m.glyph, m])).values());

  return (
    <div className="rounded-2xl bg-cream-warm p-3">
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-text-light">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {blanks.map((i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}
        {slots.map(({ date, cell: c }) => {
          if (!c) {
            // 아직 안 온 날 — 자물쇠를 쓰지 않는다(스펙 §2). 버튼이 아니라 div 라 탭도 안 먹는다.
            return (
              <div
                key={date}
                aria-label={`${date} 아직 안 온 날`}
                className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-lilac-mid/40 bg-white/30"
              >
                <span className="text-[13px] font-semibold leading-none text-text-light/60">
                  {Number(date.slice(8, 10))}
                </span>
                <span aria-hidden className="mt-1.5 h-1 w-1 rounded-full bg-lilac-mid/60" />
              </div>
            );
          }
          const selected = c.date === selectedDate;
          return (
            <button
              key={c.date}
              type="button"
              onClick={() => {
                // 🔴 offset 은 **오늘로부터의 일수 차이**다. 배열 인덱스를 쓰면 달력이 이번 달로
                //    바뀐 순간 "1일로부터의 거리"가 되어 스펙 §13 의 관문(offset≠0 비율 = 오늘
                //    말고 다른 날을 보는가)이 조용히 다른 지표가 된다. 과거는 음수다.
                const offset = Math.round(
                  (Date.parse(`${c.date}T00:00:00Z`) - Date.parse(`${todayDate}T00:00:00Z`)) / 86400000
                );
                trackUiEvent("byeolmaru_day_selected", { meta: { offset, tone: c.tone } });
                onSelect(c.date);
              }}
              aria-label={`${c.date} ${c.label}${c.marks.length ? ` · ${c.marks.map((m) => m.label).join(", ")}` : ""}`}
              aria-pressed={selected}
              // 오늘/선택 링을 겹치지 않게 — ring-2 는 폭만 정하고 색은 스타일시트 순서로
              // 갈려서, 겹치면 톤에 따라 "오늘" 표시가 사라졌다(예: ring-lilac-deep 이
              // ring-lilac-mid 보다 먼저 정의되면 caution 톤의 오늘 셀이 오늘 링을 잃음).
              // 우선순위를 삼항으로 코드에 고정해 매번 정확히 하나의 ring-{색} 만 나가게 한다.
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl ${TONE_BG[c.tone]} ${
                c.isToday
                  ? "ring-2 ring-lilac-deep"
                  : selected
                    ? `ring-2 ${TONE_RING[c.tone]}`
                    : ""
              }`}
            >
              {/* D(배치 B): 날짜 / 일지 캐릭터 / 간지 세로 스택. 캐릭터는 지지 시각화, 간지 텍스트는
                  천간까지 담아 둘이 서로 보완(중복 아닌 강화). 캐릭터 없으면 날짜+간지만. */}
              {c.marks.length ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-[3px] top-[2px] text-[8px] font-bold leading-none text-eye-purple"
                >
                  {/* 🔴 셀에는 최우선 마크 1개만. 실측(375px 폰 ≈ 42px 셀): 2개부터 두 자리 날짜와
                      겹친다(48px 셀에서 2개 여유 0.8px, 3개 겹침 6.3px). 전체 목록은 aria-label 과
                      DayDetailCard 의 마크 칩이 받는다. dayMarks() 순서가 곧 우선순위다. */}
                  {c.marks[0].glyph}
                </span>
              ) : null}
              <span className="text-[13px] font-semibold leading-none text-eye-purple">
                {Number(c.date.slice(8, 10))}
              </span>
              {(() => {
                const a = branchAnimal(c.ganji);
                return a ? (
                  <Image
                    src={a.assetSrc}
                    alt={a.animal}
                    width={22}
                    height={22}
                    className="my-0.5 h-[22px] w-[22px] object-contain"
                  />
                ) : null;
              })()}
              <span className="text-[9px] leading-none text-text-light">{c.ganji}</span>
            </button>
          );
        })}
      </div>
      {(legend.length > 0 || lockedDates.length > 0) && (
        <div className="mt-2 space-y-0.5 text-[10px] leading-relaxed text-text-light">
          {legend.length > 0 && (
            <p>
              {legend.map((m) => (
                <span key={m.glyph} className="mr-2">
                  <span aria-hidden className="font-bold text-eye-purple">{m.glyph}</span> {m.label}
                </span>
              ))}
            </p>
          )}
          {lockedDates.length > 0 && <p>점선 칸은 아직 안 온 날이야 — 그날이 오면 열려.</p>}
        </div>
      )}
    </div>
  );
}
