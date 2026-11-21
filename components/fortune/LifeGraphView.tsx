"use client";

import { useState } from "react";
import type { LifeGraphReport } from "@/lib/fortune/life-graph-report";
import { MarkdownLite } from "@/lib/markdown-lite";
import Icon from "@/components/common/Icon";

// 디자인 다듬기 운세 결과 ②(운영자 11-21, A): 곡선을 맨 위로(소개 글은 그 아래), 곡선에 시작 나이·최고/최저 점수 + 아래 요약 두 줄,
// '가장 빛나는/웅크리며 준비할 시기'는 한 카드 두 줄 미리보기, 10년 카드 9장은 한 카드 줄 목록(점수 막대 — 색은 곡선과 같게) + 누르면 펼침.
// 예전엔 소개 글 → 곡선 → 노랑·보라 상자 → 10년 카드 9장이 전부 펼쳐져 폰 약 8화면이었다.
const PEAK = "#E8C26A";
const VALLEY = "#7A6BA0";

function extremes(decades: LifeGraphReport["decades"]) {
  const maxI = decades.reduce((m, d, i) => (d.score > decades[m].score ? i : m), 0);
  const minI = decades.reduce((m, d, i) => (d.score < decades[m].score ? i : m), 0);
  return { maxI, minI };
}

/** 펼침 화살표 — 열리면 뒤집힌다 */
function Chevron({ open }: { open: boolean }) {
  return <Icon name="chev_d" size={16} className={`shrink-0 text-lilac-mid transition-transform ${open ? "rotate-180" : ""}`} />;
}

// 인생 곡선 SVG — 대운 구간(x) × 흐름 점수 0~100(y). 반응형 viewBox.
function Curve({ decades }: { decades: LifeGraphReport["decades"] }) {
  const W = 320;
  const H = 150;
  const padX = 14;
  const padY = 18;
  const n = decades.length;
  if (n === 0) return null;
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(1, n - 1);
  const y = (score: number) => padY + (1 - score / 100) * (H - padY * 2);
  const pts = decades.map((d, i) => [x(i), y(d.score)] as const);
  const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = `${padX},${H - padY} ${line} ${W - padX},${H - padY}`;
  const { maxI, minI } = extremes(decades);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="인생 대운 곡선">
      <defs>
        <linearGradient id="lifeArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9F8AD0" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#9F8AD0" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#lifeArea)" />
      <polyline points={line} fill="none" stroke="#9F8AD0" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([px, py], i) => {
        const hot = i === maxI;
        const cold = i === minI;
        return (
          <g key={i}>
            <circle cx={px} cy={py} r={hot || cold ? 4.5 : 3} fill={hot ? PEAK : cold ? VALLEY : "#9F8AD0"} stroke="#fff" strokeWidth="1.5" />
            {(hot || cold) && (
              <text x={px} y={py - 8} textAnchor="middle" fontSize="9" fontWeight="800" fill={hot ? "#B5843F" : VALLEY}>
                {decades[i].score}
              </text>
            )}
            <text x={px} y={H - 4} textAnchor="middle" fontSize="8.5" fill="#7A6BA0">
              {decades[i].ageLabel.split("~")[0]}세
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function LifeGraphView({ report }: { report: LifeGraphReport }) {
  const decades = report.decades;
  const { maxI, minI } = extremes(decades);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const decadeKeys = decades.map((_, i) => `d${i}`);
  const allOpen = decadeKeys.every((k) => open.has(k));
  const toggleAll = () =>
    setOpen((prev) => {
      const next = new Set(prev);
      decadeKeys.forEach((k) => (allOpen ? next.delete(k) : next.add(k)));
      return next;
    });
  const summary = (i: number, dot: string, label: string) => (
    <span className="flex items-center gap-2 min-w-0">
      <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="shrink-0 text-text-light">{label}</span>
      <b className="shrink-0 text-eye-purple">{decades[i].ageLabel}</b>
      <span className="min-w-0 truncate text-text-light">· {decades[i].headline}</span>
    </span>
  );
  const longRow = (key: string, dot: string, title: string, text: string) => {
    const isOpen = open.has(key);
    return (
      <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} className="block w-full py-3 text-left">
        <span className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
          <b className="text-14 text-eye-purple">{title}</b>
          <span className="ml-auto">
            <Chevron open={isOpen} />
          </span>
        </span>
        {isOpen ? (
          <MarkdownLite text={text} className="text-13 text-[#4F4A5E] leading-[1.8]" />
        ) : (
          <span className="block text-13 text-[#4F4A5E] leading-[1.7] line-clamp-2">{text.replace(/\*\*|==/g, "")}</span>
        )}
      </button>
    );
  };

  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      {/* 곡선 차트 — 맨 위 */}
      <div className="card-report">
        <h3 className="text-15 font-extrabold text-accent mb-3">내 인생 곡선 (대운)</h3>
        <Curve decades={decades} />
        <div className="mt-3 flex flex-col gap-1.5 text-12">
          {summary(maxI, PEAK, "가장 빛나는")}
          {summary(minI, VALLEY, "웅크리는")}
        </div>
      </div>

      <div className="card-report">
        <MarkdownLite text={report.intro} className="text-14 leading-[1.9] text-[#4F4A5E]" />
      </div>

      {/* 최고/저점 — 한 카드 두 줄 미리보기 */}
      <div className="card py-1 divide-y divide-lilac-soft/70">
        {longRow("peak", PEAK, "가장 빛나는 시기", report.peak)}
        {longRow("valley", VALLEY, "웅크리며 준비할 시기", report.valley)}
      </div>

      {/* 구간별 — 한 카드 줄 목록, 누르면 펼침 */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between pl-1">
          <h2 className="text-15 font-extrabold text-eye-purple">
            10년씩 자세히 보기
            <span className="ml-1 text-12 font-semibold text-text-light tabular-nums">{decades.length}개</span>
          </h2>
          <button type="button" onClick={toggleAll} className="btn btn-text btn-sm -mr-3.5">
            {allOpen ? "모두 접기" : "모두 펼치기"}
          </button>
        </div>
        <div className="card py-1">
          {decades.map((d, i) => {
            const key = `d${i}`;
            const isOpen = open.has(key);
            const bar = i === maxI ? PEAK : i === minI ? VALLEY : "#C9BBE6";
            return (
              <div key={key} className={i ? "border-t border-lilac-soft/70" : ""}>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="w-[54px] shrink-0 text-13 font-extrabold text-accent">{d.ageLabel}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-14 font-bold text-eye-purple leading-snug">{d.headline}</span>
                    <span className="mt-1.5 block h-1.5 rounded-full bg-lilac-soft/70 overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${d.score}%`, background: bar }} />
                    </span>
                  </span>
                  <span
                    className="w-7 shrink-0 text-right text-13 font-bold tabular-nums"
                    style={{ color: i === maxI ? "#B5843F" : "#5A3E8C" }}
                  >
                    {d.score}
                  </span>
                  <Chevron open={isOpen} />
                </button>
                {isOpen && (
                  <MarkdownLite text={d.body} className="pb-3.5 text-13 text-[#4F4A5E] leading-[1.75] animate-fade-in" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl px-6 py-6 text-white bg-night-card">
        <h3 className="text-14 font-bold text-gold mb-2">별콩이의 한마디</h3>
        <MarkdownLite text={report.note} tone="dark" className="text-14 leading-[1.95] text-white/90" />
      </div>
    </div>
  );
}
