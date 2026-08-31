"use client";

import { MarkdownLite } from "@/lib/markdown-lite";
import { splitHeadingEmoji, sectionPreview } from "@/lib/fortune/heading";

// 접이식 섹션 카드 — 긴 리포트의 스크롤 완화용. 열림 상태는 부모가 제어(전체 펼치기/접기 지원).
// 접힘: 아이콘 + 제목 + 첫 문장 미리보기 한 줄. 펼침: 제목 + 본문(MarkdownLite).
export default function CollapsibleSection({
  heading,
  body,
  open,
  onToggle,
}: {
  heading: string;
  body: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { emoji, title } = splitHeadingEmoji(heading);
  const preview = open ? "" : sectionPreview(body);

  return (
    <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-[22px] py-5 text-left"
      >
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[19px] shrink-0"
          style={{ background: "linear-gradient(135deg, #F3E9DF, #EADFF2)" }}
          aria-hidden
        >
          {emoji}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-extrabold text-eye-purple">{title}</span>
          {!open && preview && (
            <span className="block text-[12px] text-text-light/70 mt-0.5 truncate">{preview}</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 shrink-0 text-lilac-deep transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="px-[22px] pb-6 -mt-1">
          <MarkdownLite text={body} className="text-[13.5px] leading-[1.9] text-[#4F4A5E]" />
        </div>
      )}
    </div>
  );
}
