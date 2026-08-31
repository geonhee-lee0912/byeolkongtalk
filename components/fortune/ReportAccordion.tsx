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

// 리포트 공용 아코디언 — 접이식 섹션 목록 + "전체 펼치기/접기" 토글 + (선택)그룹 구분선.
// generic·monthly·compat·saju_full 이 동일 UX 로 통일해 쓴다. 상단 히어로·하단 한마디는 각 뷰가 바깥에 둔다.
// groupIcons: 그룹 라벨 → 별콩이 일러스트 경로(구분선에 작은 아바타로 노출, 중간중간 캐릭터 배치).
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end -mb-1">
        <button
          type="button"
          onClick={toggleAll}
          className="text-[12px] font-bold text-lilac-deep px-3 py-1.5 rounded-full bg-lilac-soft/50 hover:bg-lilac-soft transition"
        >
          {allOpen ? "전체 접기" : "전체 펼치기"}
        </button>
      </div>
      {items.map((it, idx) => {
        const showDivider = !!it.group && it.group !== (idx > 0 ? items[idx - 1].group : undefined);
        return (
          <div key={it.key} className="flex flex-col gap-4">
            {showDivider && (
              <div className="flex items-center gap-2 mt-1">
                {it.group && groupIcons?.[it.group] && (
                  <Image
                    src={groupIcons[it.group]}
                    alt=""
                    width={26}
                    height={26}
                    className="w-[26px] h-[26px] rounded-full object-cover border border-lilac-mid/30 bg-lilac-soft/40 shrink-0"
                    aria-hidden
                  />
                )}
                <span className="text-[12.5px] font-extrabold text-lilac-deep shrink-0">{it.group}</span>
                <span className="flex-1 h-px bg-lilac-mid/25" />
              </div>
            )}
            <CollapsibleSection
              heading={it.heading}
              body={it.body}
              preview={it.preview}
              open={openSet.has(it.key)}
              onToggle={() => toggle(it.key)}
            >
              {it.children}
            </CollapsibleSection>
          </div>
        );
      })}
    </div>
  );
}
