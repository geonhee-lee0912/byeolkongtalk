"use client";

import { useRouter } from "next/navigation";
import type { EmotionTag } from "@/lib/emotions";
import { beginConsultation } from "@/lib/consultation-entry";

/** 콘텐츠 페이지 하단 CTA — 홈 태그 클릭과 동일 진입(로그인 가드 포함). */
export default function GuideCta({
  tag,
  label,
}: {
  tag: EmotionTag;
  label?: string;
}) {
  const router = useRouter();
  return (
    <div className="mt-8 rounded-2xl border border-lilac-mid/40 bg-gradient-to-br from-lilac-soft/60 to-cream-warm p-4 text-center">
      <p className="text-[13.5px] font-bold text-eye-purple leading-snug">
        이 고민, 지금 마음에 있다면
      </p>
      <p className="text-[11.5px] text-text-light mt-1">
        별콩이가 카드를 펼쳐서 너의 이야기로 읽어줄게
      </p>
      <button
        type="button"
        onClick={() => router.push(beginConsultation(tag))}
        className="mt-3 w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
      >
        {label ?? "별콩이에게 물어보기"}
      </button>
    </div>
  );
}
