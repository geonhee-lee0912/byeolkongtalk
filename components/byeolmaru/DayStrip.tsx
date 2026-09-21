"use client";

// components/byeolmaru/DayStrip.tsx — 허브 롤링 7일 스트립(스펙 §2-1).
// 지난 3일 + 오늘(2배 폭) + 앞으로 3일. 가려지는 게 **미래**라 "안 준다"가 아니라 "아직 안 온 날"로
// 읽힌다 — 자물쇠를 쓰지 않는다는 P5 §2 원칙과 맞는 유일한 블러 형태다.
// 🔴 흐린 칸 수를 세지 않는다 — lockedCells 가 곧 그 집합이다(서버 무료선의 산물).
import Image from "next/image";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";
import { MARK_COLOR, MARK_TINT, type DayMark } from "@/lib/byeolmaru/day-label";
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
  // 🔴 CalendarGrid.TONE_STYLE.normal 과 **같은 값**을 쓴다 — 스트립과 격자가 한 판 위에 나란히
  //    있어 "무난한 날"이 두 색이면 같은 판정이 다른 날처럼 보인다. 순백이 아닌 이유는 그쪽 주석 참조.
  normal: "#F4F2F7",
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

  // 🔴 트랙 수는 오늘 칸의 유무에 달려 있다. 오늘이 span 2 를 먹으므로 있으면 8칸, 없으면 7칸이다.
  //    8칸으로 고정하면 오늘이 없는 집합(달력 계약상 가능 — calendar.test.ts 가 그 상태를 덮는다)에서
  //    7개가 8트랙에 들어가 **빈 칸 하나가 조용히 생긴다**. 이 컴포넌트는 레이아웃 자체가 "정확히 하나가
  //    2칸을 먹는다"에 기대므로, 그 전제를 상수로 박지 않고 데이터에서 읽는다.
  const hasToday = slots.some((s) => s.cell?.isToday);

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${hasToday ? 8 : 7}, minmax(0,1fr))` }}
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
              aria-label={`${date} 아직 안 온 날 — 눌러서 미리 보기`}
              className={`${common} border border-dashed`}
              style={{ background: "rgba(255,255,255,.28)", borderColor: "rgba(184,168,216,.40)" }}
            >
              <span className="text-[10px] leading-none text-text-light/70">{weekdayOf(date)}</span>
              <span className="mt-0.5 text-[15px] font-semibold leading-none text-text-light/70">{Number(date.slice(8, 10))}</span>
              {/* 날짜·동물은 선명하다 — 만세력이라 비밀이 아니다(스펙 §3). 가리는 건 판정뿐. */}
              {animal ? <Image src={animal.assetSrc} alt="" width={20} height={20} className="mt-1 h-5 w-5 object-contain opacity-70" /> : null}
              {/* 열린 칸의 마크 띠와 **같은 자리·같은 크기**다 — 잠긴 칸에서만 띠가 사라지면 칸 높이가
                  들쭉날쭉해진다(grid 는 가장 높은 칸에 맞추므로 결국 여백으로 남는다). 색만 흐리다. */}
              <span aria-hidden className="mt-1.5 h-[3px] w-[60%] rounded-full bg-lilac-mid/30" />
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
            aria-label={`${today ? "오늘 " : ""}${date} ${cell.title}${cell.marks.length ? ` · ${cell.marks.map((m) => m.label).join(", ")}` : ""}`}
            className={common}
            style={{
              background: TONE_BG[cell.tone],
              gridColumn: today ? "span 2" : undefined,
              ...(today ? { boxShadow: "0 0 0 2px #5A3E8C" } : {}),
            }}
          >
            {/* 🔴 오늘 칸에도 "오늘" 글자를 쓰지 않는다 — **2배 폭 + 2px 보라 테두리 + 톤 색면**이
                이미 어느 칸이 오늘인지 말한다. 글자까지 얹으면 그 칸만 요소가 하나 더 많아지고,
                스트립 높이는 가장 높은 칸이 정하므로 **나머지 6칸에 빈 여백이 생긴다**(실측 29px).
                스크린리더에는 aria-label 이 "오늘"을 그대로 싣는다 — 시각만 색·형태로 옮긴 것이다. */}
            <span className="text-[10px] leading-none text-text-light">{weekdayOf(date)}</span>
            <span className="mt-0.5 text-[15px] font-semibold leading-none text-eye-purple">{Number(date.slice(8, 10))}</span>
            {animal ? (
              <Image
                src={animal.assetSrc}
                alt=""
                width={today ? 22 : 20}
                height={today ? 22 : 20}
                className="mt-1 object-contain"
                style={{ width: today ? 22 : 20, height: today ? 22 : 20 }}
              />
            ) : null}
            {/* 정보는 오늘 칸에 몰린다 — 나머지 6칸이 조용해야 "번잡 vs 허전" 딜레마가 풀린다. */}
            {today && (
              <span className="mt-0.5 line-clamp-2 px-1 text-center text-[10px] leading-tight text-eye-purple">{cell.title}</span>
            )}
            {/* 🔴 마크 표기가 오늘과 나머지에서 갈린다 — **의도된 비대칭**이다.
                · 오늘(74px): 2글자 라벨. 폭이 넉넉하고, 정보가 여기 몰려야 나머지가 조용해진다(§2-1).
                · 일반 칸(35px): 라벨이 칸 폭의 71%를 먹어 빽빽했다 → **하단 색 띠**로 내린다.
                  스펙 §3 이 격자에 쓴 "셀 하단 띠"와 같은 문법이고, 띠의 뜻은 월간 격자 하단 범례가
                  잇는다(그쪽은 폭이 41px 라 라벨이 들어간다 — 그래서 격자는 안 건드렸다).
                🔴 색은 MARK_COLOR 를 **면으로만** 쓴다(글자 아님) — day-label.ts 규율. */}
            {cell.marks.length ? (
              today ? (
                <span
                  className="mt-0.5 rounded-full px-1 text-[9px] font-bold leading-[13px] text-night-deep"
                  style={{ background: `${MARK_COLOR[cell.marks[0].glyph]}${MARK_TINT[cell.marks[0].strength]}` }}
                >
                  {cell.marks[0].label}
                </span>
              ) : (
                <span
                  aria-hidden
                  className="mt-1.5 h-[3px] w-[60%] rounded-full"
                  style={{
                    background: MARK_COLOR[cell.marks[0].glyph],
                    // 🔴 흰 외곽선이 필수다 — 띠를 순색으로만 두면 **"잘 맞는 날"(금색 칸) + "끌림"
                    //    (금색 마크)** 조합에서 대비가 1.52:1 로 떨어져 띠가 사라진다(비-텍스트 기준
                    //    3:1 미달). 지금 데이터에 그 조합이 없어도 판정상 언제든 나온다. 1px 테두리면
                    //    어떤 톤 배경에서도 띠의 경계가 남는다.
                    boxShadow: "0 0 0 1px rgba(255,255,255,.85)",
                  }}
                />
              )
            ) : (
              // 마크가 없는 날도 띠 자리를 비워둔다 — 없으면 칸마다 높이가 달라지고, grid 가 최고
              // 높이에 맞추므로 결국 위아래 여백으로 흩어진다(그게 "비어 보인다"의 원인이었다).
              <span aria-hidden className="mt-1.5 h-[3px] w-[60%]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
