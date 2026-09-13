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

// 🔴 라이트 B 팔레트(스펙 §4) — @theme 토큰에 없는 값은 여기 상수로 둔다. 새 토큰을 만들지
//    않는 이유: 이 색들은 "달력 판 안에서만" 쓰는 국소 팔레트라 전역 토큰으로 올리면 다른 지면이
//    실수로 집어 쓴다(ELEMENT_COLORS 가 SajuBoard 안에 사는 것과 같은 이유).
// 판 안에 명암을 만드는 게 핵심이다 — 무난한 날이 순백이라 좋은 날(골드 솔리드)이 떠 보인다.
const PANEL_BG = "linear-gradient(160deg, #FFFBF2 0%, #EFE6FA 100%)";
const PANEL_BORDER = "1px solid rgba(184,168,216,.35)";
const PANEL_SHADOW = "0 4px 18px rgba(159,138,208,0.10)";

const TONE_STYLE: Record<DayTone, { background: string; border?: string; boxShadow?: string }> = {
  good: { background: "#E8C26A", boxShadow: "0 2px 6px rgba(232,194,106,0.45)" },
  normal: { background: "#ffffff" },
  caution: { background: "rgba(255,255,255,.45)", border: "1px solid rgba(184,168,216,.30)" },
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
    <div
      className="rounded-2xl p-3"
      style={{ background: PANEL_BG, border: PANEL_BORDER, boxShadow: PANEL_SHADOW }}
    >
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
                // role 없는 div 는 암묵 role 이 generic 이라 aria-label 이 무시될 수 있다 — 날짜
                // 하나를 나타내는 정적 표시이므로 role="img" 로 accessible name 계산을 허용한다.
                role="img"
                aria-label={`${date} 아직 안 온 날`}
                className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed"
                style={{ background: "rgba(255,255,255,.28)", borderColor: "rgba(184,168,216,.40)" }}
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
              className="relative flex aspect-square flex-col items-center justify-center rounded-xl transition-transform"
              style={{
                ...TONE_STYLE[c.tone],
                // 🔴 오늘/선택 링을 **하나의 boxShadow 문자열**로 합친다. 클래스 ring 을 겹쳐 쓰면
                //    승자가 스타일시트 순서로 갈려 caution 톤의 오늘 칸이 링을 잃던 버그가 있었다
                //    (P5-1 주석). 인라인 스타일이면 우선순위가 코드 순서로 결정돼 그 문제가 없다.
                ...(c.isToday
                  ? { boxShadow: `0 0 0 2px #5A3E8C${TONE_STYLE[c.tone].boxShadow ? `, ${TONE_STYLE[c.tone].boxShadow}` : ""}`, transform: "scale(1.07)", zIndex: 1 }
                  : selected
                    ? { boxShadow: `0 0 0 2px rgba(159,138,208,.75)` }
                    : {}),
              }}
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
              {/* a11y: 골드 배경(좋은 날 #E8C26A)에서 text-text-light 대비가 2.78:1로 WCAG AA(4.5:1)
                  미달이었다 — 배경(스펙 §4 고정값)이 아니라 텍스트 색을 올려 해결한다. 날짜 숫자와
                  색이 같아지지만 크기(13px↔9px)·두께(semibold↔regular)로 위계는 유지된다. */}
              <span className="text-[9px] leading-none text-eye-purple">{c.ganji}</span>
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
