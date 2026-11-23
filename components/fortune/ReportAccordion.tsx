"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import CollapsibleSection from "./CollapsibleSection";

export interface AccordionItem {
  key: string;
  heading: string; // 앞에 이모지 권장(아이콘 타일로 분리됨)
  body?: string; // markdown 본문(MarkdownLite + 자동 미리보기)
  children?: ReactNode; // 커스텀 본문(표·칩 등). body 없을 때.
  preview?: string; // 커스텀 섹션 접힘 미리보기(선택)
  group?: string; // 그룹 라벨 — 바뀌는 지점에 구분선(saju_full 처럼 섹션 많을 때)
}

// 리포트 공용 아코디언 — '자세히 보기 · N개' 제목 줄 + 모두 펼치기 + 흰 카드 하나 안의 목차 줄(누르면 그 자리에서 펼침).
// 그룹이 있으면(saju_full) 그룹마다 구분선 + 카드 하나. 디자인 다듬기 운세 결과 ④ A2 운영자 11-16.
// generic·monthly·compat·saju_full 이 동일 UX 로 통일해 쓴다. 상단 히어로·하단 한마디는 각 뷰가 바깥에 둔다.
// groupIcons: 그룹 라벨 → 별콩이 일러스트 경로(구분선에 작은 아바타로 노출).
export default function ReportAccordion({
  items,
  groupIcons,
}: {
  items: AccordionItem[];
  groupIcons?: Record<string, string>;
}) {
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const allOpen = items.length > 0 && openSet.size === items.length;

  const toggle = (k: string) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const toggleAll = () => setOpenSet(allOpen ? new Set() : new Set(items.map((i) => i.key)));

  // 같은 그룹이 이어지는 묶음마다 카드 하나(그룹 없으면 전부 한 묶음)
  const runs: { group?: string; start: number; items: AccordionItem[] }[] = [];
  items.forEach((it, idx) => {
    const last = runs[runs.length - 1];
    if (last && last.group === it.group) last.items.push(it);
    else runs.push({ group: it.group, start: idx, items: [it] });
  });

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between pl-1">
        <h2 className="text-15 font-extrabold text-eye-purple">
          자세히 보기
          <span className="ml-1 text-12 font-semibold text-text-light tabular-nums">{items.length}개</span>
        </h2>
        <button type="button" onClick={toggleAll} className="btn btn-text btn-sm -mr-3.5">
          {allOpen ? "모두 접기" : "모두 펼치기"}
        </button>
      </div>
      {runs.map((run, r) => (
        <div key={run.start} className={`flex flex-col gap-2.5 ${r > 0 ? "mt-2" : ""}`}>
          {run.group && (
            <div className="flex items-center gap-2 pl-1">
              {groupIcons?.[run.group] && (
                <Image
                  src={groupIcons[run.group]}
                  alt=""
                  width={26}
                  height={26}
                  className="w-[26px] h-[26px] rounded-full object-cover border border-lilac-mid/30 bg-lilac-soft/40 shrink-0"
                  aria-hidden
                />
              )}
              <span className="text-13 font-extrabold text-accent shrink-0">{run.group}</span>
              <span className="flex-1 h-px bg-lilac-mid/25" />
            </div>
          )}
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            {run.items.map((it, i) => (
              <CollapsibleSection
                key={it.key}
                heading={it.heading}
                index={run.start + i + 1}
                body={it.body}
                preview={it.preview}
                open={openSet.has(it.key)}
                onToggle={() => toggle(it.key)}
                divided={i > 0}
              >
                {it.children}
              </CollapsibleSection>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
