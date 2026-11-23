"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/common/Icon";
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
  // 추천 카드(흰 카드)와 같은 모양이면 세 번째 상품처럼 읽혀서, 묶음에서 조금 떼고 연보라 한 줄 칸으로 —
  // 선물 그림 · 제목 · 보상 한 줄 · ›. 디자인 다듬기 운세 결과 ⑧ R1 운영자 11-20(타로·사주 결과도 같은 부품)
  return (
    <div className="w-full max-w-md mx-auto px-5 mt-6">
      <Link
        href="/survey"
        className="flex items-center gap-3 rounded-2xl bg-lilac-soft/60 px-4 py-3.5 transition"
      >
        <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-accent shrink-0">
          <Icon name="gift" size={20} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-13 font-bold text-eye-purple">별콩이가 너한테 궁금한 게 있어</span>
          <span className="block text-12 text-text-light mt-0.5">
            이야기 들려주면 별 {SURVEY_REWARD_STARS}개를 줄게
          </span>
        </span>
        <Icon name="chev_r" size={16} className="text-lilac-mid" />
      </Link>
    </div>
  );
}
