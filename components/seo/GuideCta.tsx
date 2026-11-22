"use client";

import { useRouter } from "next/navigation";
import type { EmotionTag } from "@/lib/emotions";
import { beginConsultation } from "@/lib/consultation-entry";

/** 콘텐츠 페이지 하단 CTA — 홈 태그 클릭과 동일 진입(로그인 가드 포함).
 * 밤 카드·금색 버튼 → 흰 카드·주 버튼(디자인 다듬기 묶음 9 ② A, 운영자 11-22 — 밝은 화면이라 밤 화면 문법을 안 쓴다). */
export default function GuideCta({
  tag,
  label,
  quiet = false,
}: {
  tag: EmotionTag;
  label?: string;
  /** 그 화면에 먼저 누를 주 버튼이 따로 있을 때 — 보조 버튼으로 물러선다 */
  quiet?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="card mt-8 text-center">
      <p className="text-14 font-bold text-eye-purple leading-snug">
        이 고민, 지금 마음에 있다면
      </p>
      <p className="text-12 text-text-light mt-1">
        별콩이가 카드를 펼쳐서 너의 이야기로 읽어줄게
      </p>
      <button
        type="button"
        onClick={() => router.push(beginConsultation(tag))}
        className={`mt-3 btn ${quiet ? "btn-secondary" : "btn-primary"} btn-lg`}
      >
        {label ?? "별콩이에게 물어보기"}
      </button>
    </div>
  );
}
