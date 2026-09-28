"use client";

// 리포트 목차 칩 — 길면 접는다. 토글 때문에만 클라다.
//
// 🔴 접힌 칩을 slice 로 잘라내지 말 것. 이 지면은 색인 대상이라 잘라내면 본문이 통째로
// 줄어든다. 전부 렌더하고 CSS(hidden)로만 감춘다 — 크롤러는 다 읽고 사람만 접혀 보인다.
import { useState } from "react";

/** 이 개수를 넘으면 접는다. 7섹션짜리 대부분은 안 접히고 긴 종목(13·15·22·38)만 걸린다. */
const COLLAPSE_AFTER = 12;

export default function OutlineChips({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const hiddenCount = items.length - COLLAPSE_AFTER;
  const collapsible = hiddenCount > 0;

  return (
    <>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((h, i) => (
          <li
            key={h}
            className={[
              "text-[11.5px] text-eye-purple bg-lilac-soft/60 px-2.5 py-1.5 rounded-full",
              collapsible && !open && i >= COLLAPSE_AFTER ? "hidden" : "",
            ].join(" ")}
          >
            {h}
          </li>
        ))}
      </ul>

      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-2.5 w-full py-2 rounded-xl border border-lilac-mid/30 text-[12px] font-bold text-lilac-deep hover:bg-lilac-soft/40 active:scale-[0.99] transition"
        >
          {open ? "접기" : `+ ${hiddenCount}개 더 보기`}
        </button>
      )}
    </>
  );
}
