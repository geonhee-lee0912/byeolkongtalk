"use client";

import type { DayTone } from "@/lib/byeolmaru/day-score";
import type { LockedCell } from "@/lib/byeolmaru/calendar";
import { trackUiEvent } from "@/lib/analytics/ui-events";
// 🔴 MARK_COLOR·MARK_TINT 는 한 쌍이다 — 색은 배경 틴트로만 쓰고 글자는 어두운 색 고정.
//    MARK_COLOR 를 글자 색으로 쓰면 이 판의 옅은 배경 위에서 WCAG AA 에 전 조합 미달한다(실측).
import { MARK_COLOR, MARK_TINT, type DayMark } from "@/lib/byeolmaru/day-label";

// 나(DayCell)·우리(PairDayCell) 어느 쪽도 아닌 정규화 셀 — 두 판정 엔진의 톤 3단(good/normal/
// caution)이 같은 union(DayTone===PairTone)이라 호출부가 이 모양으로만 매핑해 넘기면 그리드는
// 어느 쪽 캘린더든 그대로 그린다.
export interface GridCell {
  date: string;
  ganji: string;
  tone: DayTone;
  label: string;
  isToday: boolean;
  /** 원인 마크(P5-1). 셀은 첫 마크만 그린다(겹침 실측). 나 탭은 dayFactors() 특성상 육합과 충이
   *  같은 지지 짝이라 동시에 참이 될 수 없지만, 우리 탭은 두 사람을 각각 보므로(한쪽은 육합·다른
   *  쪽은 충) 셋이 동시에 참일 수 있다 — 그래서 개수에 기대는 코드를 두지 않는다.
   *  🔴 옵셔널이 아니다 — 옵셔널이면 호출부에서 marks 전달을 빼도 타입체크·테스트가 다 통과한 채
   *     글리프만 조용히 사라진다. 나·우리 두 판정이 각자 마크를 만들어 넘긴다(나=dayMarks, 우리=pairMarks). */
  marks: DayMark[];
}

// 🔴 라이트 B 팔레트(스펙 §4) — @theme 토큰에 없는 값은 여기 상수로 둔다. 새 토큰을 만들지
//    않는 이유: 이 색들은 "달력 판 안에서만" 쓰는 국소 팔레트라 전역 토큰으로 올리면 다른 지면이
//    실수로 집어 쓴다(ELEMENT_COLORS 가 SajuBoard 안에 사는 것과 같은 이유).
// 판 안에 명암을 만드는 게 핵심이다 — 무난한 날이 순백이라 좋은 날(금색)이 떠 보인다.
const PANEL_BG = "linear-gradient(160deg, #FFFBF2 0%, #EFE6FA 100%)";
const PANEL_BORDER = "1px solid rgba(184,168,216,.35)";
const PANEL_SHADOW = "0 4px 18px rgba(159,138,208,0.10)";


const TONE_STYLE: Record<DayTone, { background: string; border?: string; boxShadow?: string }> = {
  // 챙길 날이 rgba(255,255,255,.45) 라 무난한 날(순백)과 거의 같은 색이었다 — 실물에서 구분 불가.
  good: { background: "linear-gradient(160deg,#F7DFA4,#E8C26A)", boxShadow: "0 2px 6px rgba(232,194,106,0.45)" },
  normal: { background: "#ffffff" },
  caution: { background: "linear-gradient(160deg,#EFE7F8,#DCCFF0)", border: "1px solid rgba(184,168,216,.30)" },
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface Props {
  cells: GridCell[];
  /** 아직 안 온 날(P5-2 무료선). 판정 없이 날짜·간지만 온다 — 서버가 내용을 안 실어 보낸다. */
  lockedCells: LockedCell[];
  /** KST 오늘. 계측 offset 의 기준이자 "안 온 날" 문구의 기준. */
  todayDate: string;
  selectedDate: string;
  onSelect: (date: string) => void;
  /** 잠긴 칸 하단 안내("그날이 오면 열려") 노출 여부. 기본 true — 로그인 유저의 실제 달력에선
   *  잠긴 날 = 아직 안 온 미래 날짜라 이 문구가 맞다. 반면 비로그인·생일 미입력(EmptyMonthShell)의
   *  "안 칠해진 이번 달"은 지난 날짜까지 이번 달 전부가 잠기므로 — "안 온 날"이 아니라 "로그인/생일이
   *  없어서 못 보는 날"이다. 그 호출부는 false 로 꺼서 바로 아래 "네 생일만 있으면…" 문구와의
   *  모순을 없앤다(P5-3 리뷰). */
  lockedHint?: boolean;
  /** 계측 축(스펙 §13) — 이 격자가 나/우리 어느 판인지. offset≠0 비율 관문(§7 재검토 트리거)이
   *  나·우리를 구분 못 하면 사후 필터링이 불가능해진다(P5-3 리뷰). 기본 "me". */
  subjectKind?: "me" | "pair";
}

export default function CalendarGrid({
  cells,
  lockedCells,
  todayDate,
  selectedDate,
  onSelect,
  lockedHint = true,
  subjectKind = "me",
}: Props) {
  // 열린 칸 + 안 온 칸을 날짜순으로 합친다. cell 이 없는 슬롯 = 아직 안 온 날.
  const slots: { date: string; cell?: GridCell }[] = [
    ...cells.map((c) => ({ date: c.date, cell: c })),
    ...lockedCells.map((l) => ({ date: l.date })),
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
                {/* 마크 띠 자리를 **빈 채로** 남긴다 — 가짜 내용을 흐려 보여주지 않는다(없는 걸 있는 척
                    하지 않는다). 자리만 비어 있어 "여기 뭔가 들어온다"가 레이아웃으로 읽힌다. */}
                <span aria-hidden className="mt-1 h-[13px] w-6 rounded-full bg-lilac-mid/25" />
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
                trackUiEvent("byeolmaru_day_selected", { meta: { offset, tone: c.tone, subjectKind, surface: "grid" } });
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
              {/* 날짜 + 마크 띠. 간지 텍스트와 일지 캐릭터는 셀에서 뺐다(스펙 §2-2) — 42px 칸에 4겹이
                  들어가 제일 큰 요소(동물)가 의미를 안 담고 진짜 내용(톤)이 제일 약했다.
                  동물은 스트립이, 간지는 상세 카드가 담당한다. */}
              <span className="text-[13px] font-semibold leading-none text-eye-purple">
                {Number(c.date.slice(8, 10))}
              </span>
              {c.marks.length ? (
                <span
                  // 🔴 셀에는 최우선 마크 1개만. 2개부터 42px 칸에서 날짜와 겹친다(실측).
                  //    전체 목록은 aria-label 과 상세 카드의 마크 칩이 받는다.
                  className="mt-1 rounded-full px-1 text-[9px] font-bold leading-[13px] text-night-deep"
                  style={{ background: `${MARK_COLOR[c.marks[0].glyph]}${MARK_TINT[c.marks[0].strength]}` }}
                >
                  {c.marks[0].label}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {(legend.length > 0 || (lockedHint && lockedCells.length > 0)) && (
        <div className="mt-2 space-y-0.5 text-[10px] leading-relaxed text-text-light">
          {legend.length > 0 && (
            <p>
              {/* 범례도 셀과 **같은 옷**을 입는다 — 색을 글자에 쓰면 이 판 위에서 2.2~3.1:1 로 떨어진다
                  (셀 마크와 같은 이유). 같은 모양이라 "저 띠가 이거구나"가 바로 붙는 이점도 있다. */}
              {legend.map((m) => (
                <span
                  key={m.glyph}
                  className="mr-1.5 rounded-full px-1 font-bold text-night-deep"
                  style={{ background: `${MARK_COLOR[m.glyph]}${MARK_TINT.full}` }}
                >
                  {m.label}
                </span>
              ))}
              {/* 연한 라벨의 뜻을 한 번만 설명한다 — 우리 탭에서만 나온다. */}
              {subjectKind === "pair" && <span className="text-text-light">연한 건 한 명만 걸린 날이야</span>}
            </p>
          )}
          {/* 비로그인·생일 미입력 빈 달력(EmptyMonthShell)에선 lockedHint=false 로 끈다 — 거긴
              "아직 안 온 날"이 아니라 "생일이 없어 못 보는 날"이라 이 문구가 틀린 설명이 된다. */}
          {lockedHint && lockedCells.length > 0 && <p>점선 칸은 아직 안 온 날이야 — 그날이 오면 열려.</p>}
        </div>
      )}
    </div>
  );
}
