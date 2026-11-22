"use client";

import { useState } from "react";
import type { ReportCardReport } from "@/lib/fortune/report-card-report";
import { MarkdownLite } from "@/lib/markdown-lite";
import Icon from "@/components/common/Icon";

/** 접힌 과목 한 줄 미리보기 — 마크다운 기호(**·==·- ·> )를 걷고 첫 줄만 */
function firstLine(text: string): string {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "";
  return line.replace(/^[->]\s*/, "").replace(/\*\*|==/g, "");
}

// 성적표 학점 색 — 앞글자 기준(A 초록 / B 파랑 / C 골드 / D·F 로즈).
function gradeColor(grade: string): { bg: string; fg: string } {
  const g = grade.trim().toUpperCase()[0];
  if (g === "S" || g === "A") return { bg: "#E4F3E9", fg: "#3F8C66" };
  if (g === "B") return { bg: "#E6EFFA", fg: "#4A78B8" };
  if (g === "C") return { bg: "#FBF1DA", fg: "#B5843F" };
  return { bg: "#FBE9EC", fg: "#C25A6E" };
}

export default function ReportCardView({ report }: { report: ReportCardReport }) {
  const total = gradeColor(report.totalGrade);
  // 과목 글은 접어 두고 학점·과목·첫 줄만(디자인 다듬기 운세 결과 ③ B, 운영자 11-21) — 예전엔 5과목 글이 전부 펼쳐져 폰 약 5화면.
  // 순서(소개 글 → 성적표)는 그대로: 소개 글이 '이번 성적표의 주인공은…'으로 여는 도입부라서
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      {/* 도입 */}
      <div className="card-report">
        <MarkdownLite text={report.intro} className="text-14 leading-[1.9] text-[#4F4A5E]" />
      </div>

      {/* 성적표 카드 (공유용) */}
      <div className="card-report">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-15 font-extrabold text-eye-purple">사주 성적표</h3>
          <div className="flex items-center gap-2">
            <span className="text-11 text-text-light">종합</span>
            <span
              className="text-17 font-black px-3 py-0.5 rounded-xl tabular-nums"
              style={{ background: total.bg, color: total.fg }}
            >
              {report.totalGrade}
            </span>
          </div>
        </div>
        <div className="flex flex-col divide-y divide-[#F0EEF4]">
          {report.scores.map((s, i) => {
            const c = gradeColor(s.grade);
            const isOpen = open.has(i);
            return (
              <div key={i} className="py-3">
                <button type="button" onClick={() => toggle(i)} aria-expanded={isOpen} className="flex w-full items-center gap-3 text-left">
                  <span
                    className="text-15 font-black w-11 text-center py-1 rounded-lg shrink-0 tabular-nums"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {s.grade}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-14 font-bold text-eye-purple">{s.domain}</span>
                    {!isOpen && <span className="block truncate text-12 text-text-light mt-0.5">{firstLine(s.comment)}</span>}
                  </span>
                  <Icon name="chev_d" size={16} className={`shrink-0 text-lilac-mid transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <MarkdownLite text={s.comment} className="mt-2 pl-14 text-13 text-[#4F4A5E] leading-[1.7] animate-fade-in" />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-[#F0EEF4]">
          <div className="text-12 font-bold text-accent mb-1">담임 총평</div>
          <MarkdownLite text={report.totalComment} className="text-13 text-[#4F4A5E] leading-[1.85]" />
        </div>
      </div>

      {/* 별콩이 한마디 */}
      <div className="rounded-2xl px-6 py-6 text-white bg-night-card">
        <h3 className="text-14 font-bold text-gold mb-2">별콩이의 한마디</h3>
        <MarkdownLite text={report.note} tone="dark" className="text-14 leading-[1.95] text-white/90" />
      </div>
    </div>
  );
}
