"use client";

// 결과 화면 맨 위 '나의 고민' — 칸 없이 가운데 따옴표, 3줄을 넘으면 '더보기'로 펼친다(E안).
// 고민 적기는 200자까지라 길면 가운데 맞춤 8줄이 되어 읽기 힘들고 카드가 첫 화면에서 밀려났다 — 디자인 다듬기 /tarot/result ② 운영자 11-14
import { useLayoutEffect, useRef, useState } from "react";

export default function ConcernQuote({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);

  return (
    <div className="text-center px-2">
      <p
        ref={ref}
        className={`text-15 text-eye-purple leading-relaxed break-keep whitespace-pre-wrap ${open ? "" : "line-clamp-3"}`}
      >
        “{text}”
      </p>
      {overflow && !open && (
        <button type="button" onClick={() => setOpen(true)} className="mt-1 text-13 font-bold text-text-light">
          더보기
        </button>
      )}
    </div>
  );
}
