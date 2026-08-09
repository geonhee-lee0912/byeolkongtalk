"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SURVEY_REWARD_STARS } from "@/lib/constants";

// 리딩·상담 완료 결과화면 하단 진입 카드. 서버가 "로그인 && 미참여"면만 노출.
// 비로그인(공유뷰)·참여자는 eligible:false 라 자동 숨김.
export default function SurveyResultCard() {
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    void fetch("/api/survey", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setEligible(!!d?.eligible))
      .catch(() => {});
  }, []);
  if (!eligible) return null;
  return (
    <div className="w-full max-w-md mx-auto px-5 mt-4">
      <Link
        href="/survey"
        className="block rounded-2xl border border-gold/40 bg-gradient-to-br from-gold-soft/25 to-cream-warm p-4 hover:shadow-md transition"
      >
        <div className="text-[13.5px] font-bold text-eye-purple">별콩이가 너한테 궁금한 게 있어 🌟</div>
        <div className="text-[12px] text-text-light mt-1">
          이야기 들려주면 별 {SURVEY_REWARD_STARS}개를 줄게 · 참여하기 →
        </div>
      </Link>
    </div>
  );
}
