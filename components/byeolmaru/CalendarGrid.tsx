"use client";

import type { DayTone } from "@/lib/byeolmaru/day-score";
import type { LockedCell } from "@/lib/byeolmaru/calendar";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { cellTint, isGoodScore, scoreDisplay } from "@/lib/byeolmaru/calendar-visual";
import type { DayMark } from "@/lib/byeolmaru/day-label";

// 나(DayCell)·우리(PairDayCell) 어느 쪽도 아닌 정규화 셀 — 두 판정 엔진의 톤 3단(good/normal/
// caution)이 같은 union(DayTone===PairTone)이라 호출부가 이 모양으로만 매핑해 넘기면 그리드는
// 어느 쪽 캘린더든 그대로 그린다.
export interface GridCell {
  date: string;
  /** 셀 배경 채도의 원천. 스트립과 **같은 값**을 쓴다. */
  score: number;
  /** aria-label 과 계측에만 쓴다 — 배경엔 안 쓴다(아래 TONE_STYLE 제거 주석). */
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
// 🔴 이 세 값은 **허브의 달력 판도 쓴다**(ByeolmaruHub 가 import). 바꿀 땐 세 지면을 같이 볼 것
//    (허브 판 · 우리 탭 격자 · 게스트 구경 그리드).
// 🔴 **판과 칸은 한 쌍이다.** 판이 흰색이므로 셀 배경에는 알파 바닥이 필요하다 — 같은 색이면
//    칸이 통째로 사라진다. 그 바닥(0.11)은 calendar-visual.ts 의 cellTint 가 지키고 계약
//    테스트가 고정한다. 판을 다시 칠할 거면 그 바닥도 같이 옮겨야 한다.
//    (크림 그라데이션 판 + 순백 칸 조합을 거쳐 왔다 — 판을 흰색으로 올리면서 칸을 내렸다.)
export const PANEL_BG = "#ffffff";
export const PANEL_BORDER = "1px solid rgba(184,168,216,.35)";
export const PANEL_SHADOW = "0 4px 18px rgba(159,138,208,0.10)";

// 🔴 TONE_STYLE(등급 3단 색면)은 2026-09-24 에 제거됐다 — 실측 5,400칸에서 normal 이 64% 라
//    한 달 서른 칸 중 스무 칸이 같은 색이었다. 배경은 이제 calendar-visual.ts 의 cellTint 가
//    점수로 직접 만든다(양방향 채도). 등급 3단은 aria-label·상세 카드가 계속 쓴다.
//    되살리지 말 것 — 되살리면 "칸 2/3 이 같은 색"이 그대로 돌아온다.

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
  /** 자체 판(배경·보더·그림자·패딩)을 그릴지. 기본 true.
   *  🔴 false 는 **호출부가 이미 판을 갖고 있을 때**만 쓴다 — 허브는 칩·스트립·격자를 크림 카드
   *     하나로 묶었는데(스펙 §2), 그 안에 이 판을 또 그리면 같은 역할의 상자가 3중으로 겹쳐
   *     "한 덩어리"라는 인상이 깨진다. 우리 탭·게스트 구경 그리드는 감싸는 판이 없어 true 그대로다. */
  panel?: boolean;
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
  panel = true,
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

  return (
    <div
      className={panel ? "rounded-2xl p-3" : undefined}
      style={panel ? { background: PANEL_BG, border: PANEL_BORDER, boxShadow: PANEL_SHADOW } : undefined}
    >
      <div className="mb-2 grid grid-cols-7 gap-0.5 text-center text-xs">
        {WEEKDAYS.map((w, i) => (
          // 주말을 진하게 — 7열이 전부 같은 회색이면 주가 어디서 끊기는지 안 보인다.
          // 팔레트에 빨강이 없으므로 lilac-deep 으로 구분한다.
          <div key={w} className={i === 0 || i === 6 ? "font-medium text-lilac-deep" : "text-text-light"}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
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
                <span className="text-[10px] leading-[11px] text-text-light/60">{Number(date.slice(8, 10))}</span>
                {/* 점수 자리는 비운다 — 없는 걸 있는 척하지 않는다. */}
                <span aria-hidden className="h-[19px]" />
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
                //    바뀐 순간 "1일로부터의 거리"가 되어 관문(offset≠0 비율 = 오늘 말고 다른 날을
                //    보는가)이 조용히 다른 지표가 된다. 과거는 음수다.
                const offset = Math.round(
                  (Date.parse(`${c.date}T00:00:00Z`) - Date.parse(`${todayDate}T00:00:00Z`)) / 86400000
                );
                trackUiEvent("byeolmaru_day_selected", { meta: { offset, tone: c.tone, subjectKind, surface: "grid" } });
                onSelect(c.date);
              }}
              aria-label={`${c.date} ${c.label} ${scoreDisplay(c.score)}점${c.marks.length ? ` · ${c.marks.map((m) => m.label).join(", ")}` : ""}`}
              aria-pressed={selected}
              className="relative flex aspect-square flex-col items-center justify-center rounded-xl"
              style={{
                // 🔴 오늘은 톤 문법 밖이다 — 판 안에서 유일한 어두운 면이라 점수와 무관하게
                //    명도로 1위가 된다. 예전 ring+scale 조합은 caution 톤에서 링을 잃거나
                //    grid 틈으로 삐져나왔다.
                background: c.isToday ? "#5A3E8C" : cellTint(c.score),
                ...(selected && !c.isToday ? { boxShadow: "0 0 0 2px rgba(159,138,208,.75)" } : {}),
              }}
            >
              {/* 🔴 ✦ 별 글리프는 2차 설계(2026-09-24)에서 제거됐다 — 숫자가 88 이면 이미
                  "좋은 날"이라고 말하고 있어서 중복이다. 마크 칩도 같은 이유로 격자엔 없다
                  (44px 에 3층이면 숫자가 죽고, 숫자 색으로 마크를 인코딩하면 진한 면에서
                  대비가 깨진다 — 스펙 §3·§6). 마크는 칸이 두 배 넓은 스트립이 진다. */}
              <span className="text-[10px] leading-[11px]" style={{ color: c.isToday ? "rgba(255,255,255,.55)" : "rgba(122,107,160,.6)" }}>
                {Number(c.date.slice(8, 10))}
              </span>
              <span
                className="text-[16px] font-semibold leading-[19px]"
                style={{ color: c.isToday ? "#ffffff" : isGoodScore(c.score) ? "#412402" : "#5A3E8C" }}
              >
                {scoreDisplay(c.score)}
              </span>
            </button>
          );
        })}
      </div>
      {/* 🔴 마크 범례는 2026-09-24 에 제거됐다 — 어휘를 "상대 없이 성립하는 말"로 갈면서
          (설렘·척척·삐걱·채움) 뜻 설명이 필요 없어졌다. 옛 범례는 셀 칩과 같은 모양·같은
          글자라 반복일 뿐이었고, 격자가 접힘 기본이라 스트립만 보는 사람에겐 닿지도 않았다. */}
      {lockedHint && lockedCells.length > 0 && (
        <p className="mt-2 text-[10px] leading-relaxed text-text-light">점선 칸은 아직 안 온 날이야 — 그날이 오면 열려.</p>
      )}
    </div>
  );
}
