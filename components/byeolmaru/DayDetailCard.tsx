"use client";

import type { DayCell } from "@/lib/byeolmaru/calendar";

const AXIS_LABEL: { key: "love" | "money" | "work"; label: string }[] = [
  { key: "love", label: "연애" },
  { key: "money", label: "돈" },
  { key: "work", label: "일" },
];

export default function DayDetailCard({ cell }: { cell: DayCell }) {
  return (
    <section className="rounded-2xl bg-cream-warm p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg text-eye-purple">
          {cell.isToday ? "오늘" : `${Number(cell.date.slice(5, 7))}월 ${Number(cell.date.slice(8, 10))}일`}
        </h2>
        <span className="text-sm text-text-light">
          {cell.ganji} · {cell.element}
        </span>
      </header>

      <p className="mb-4 font-display text-2xl text-eye-purple">{cell.grade.label}</p>

      <ul className="space-y-2">
        {AXIS_LABEL.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-3">
            <span className="w-8 text-sm text-text-light">{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-lilac-soft">
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
