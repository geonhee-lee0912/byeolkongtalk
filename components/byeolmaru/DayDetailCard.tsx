"use client";

import Image from "next/image";
import type { DayCell } from "@/lib/byeolmaru/calendar";
import { getSajuTaste } from "@/lib/byeolmaru/static-lines";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";
import { DAY_NAME } from "@/lib/byeolmaru/day-label";

const AXIS_LABEL: { key: "love" | "money" | "work"; label: string }[] = [
  { key: "love", label: "연애" },
  { key: "money", label: "돈" },
  { key: "work", label: "일" },
];

export default function DayDetailCard({ cell }: { cell: DayCell }) {
  return (
    // 그리드에서 다른 날짜를 고르면 이 카드 내용만 바뀌고 포커스는 그대로 그리드 버튼에 남는다 —
    // aria-live 없이는 스크린리더 사용자에게 "선택이 바뀌었다"는 신호가 전혀 안 갔다.
    <section className="rounded-2xl bg-cream-warm p-4" aria-live="polite">
      <header className="mb-3 flex items-center gap-3">
        {/* ⑦ 일지 캐릭터 — 선택한 날의 지지 동물(크게). */}
        {(() => {
          const a = branchAnimal(cell.ganji);
          return a ? (
            <Image src={a.assetSrc} alt={a.animal} width={56} height={56} className="h-14 w-14 shrink-0 object-contain" />
          ) : null;
        })()}
        <div className="flex flex-1 items-baseline justify-between">
          <h2 className="font-display text-lg text-eye-purple">
            {cell.isToday ? "오늘" : `${Number(cell.date.slice(5, 7))}월 ${Number(cell.date.slice(8, 10))}일`}
          </h2>
          <span className="text-sm text-text-light">
            {cell.ganji} · {cell.element}
          </span>
        </div>
      </header>

      {/* P5-1 — 제목은 십신 하루 이름, 등급(잘 맞는 날/무난한 날/…)은 옆에 작게 남긴다.
          등급은 색·요약 집계의 기준이라 없애지 않고 위계만 내린다.
          마크는 달력 셀이 첫 개만 보여주므로(겹침 실측) 전체 목록은 여기가 유일한 시각 노출 지점이다.
          🔴 DAY_LINE 은 여기 두지 않는다 — 아래 getSajuTaste 의 overall 문장과 결·문형이 겹친다
             (정재 "있는 걸 단단히 하는 날이야" vs overall.caution "지금 있는 걸 단단히 여미는 게 어울려").
             한 줄은 허브 히어로가 쓴다(taste 블록이 없는 자리). 뱅크마다 집은 하나씩. */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-display text-2xl text-eye-purple">{DAY_NAME[cell.tenGod]}</p>
        <span className="text-sm text-text-light">{cell.grade.label}</span>
        {cell.marks.map((m) => (
          <span
            key={m.glyph}
            className="rounded-full bg-lilac-soft/70 px-2 py-0.5 text-[11px] font-bold text-lilac-deep"
          >
            {m.glyph} {m.label}
          </span>
        ))}
      </div>

      {/* ⑥/1C 무료 오늘 사주 taste — 전반+연애+일·돈+조언 구조 정적(날짜별 variant 로테이션). 슬롯별 뱅크 미스면 그 조각만 생략. */}
      {(() => {
        const t = getSajuTaste(cell.grade.tone, cell.axes, cell.relation, cell.date);
        return (
          <div className="mb-4 space-y-2 text-sm leading-relaxed text-eye-purple">
            {t.overall ? <p>{t.overall}</p> : null}
            {t.love ? <p><span className="font-bold">연애</span> — {t.love}</p> : null}
            {(t.work || t.money) ? <p><span className="font-bold">일·돈</span> — {[t.work, t.money].filter(Boolean).join(" ")}</p> : null}
            {t.advice ? <p className="text-text-light">{t.advice}</p> : null}
          </div>
        );
      })()}

      <ul className="space-y-2">
        {AXIS_LABEL.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-3">
            <span className="w-8 text-sm text-text-light">{label}</span>
            {/* 축 값은 막대 너비로만 표현돼 스크린리더엔 안 보였다 — progressbar ARIA 로 값을 노출 */}
            <div
              role="progressbar"
              aria-valuenow={cell.axes[key]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={label}
              className="h-2 flex-1 overflow-hidden rounded-full bg-lilac-soft"
            >
              <div
                className="h-full rounded-full bg-lilac-deep"
                style={{ width: `${cell.axes[key]}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
