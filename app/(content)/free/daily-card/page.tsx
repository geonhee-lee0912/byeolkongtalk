import type { Metadata } from "next";
import DailyCardDraw from "@/components/seo/DailyCardDraw";
import GuideCta from "@/components/seo/GuideCta";

export const metadata: Metadata = {
  title: "오늘의 타로 카드 한 장 — 무료·가입 없음",
  description:
    "회원가입 없이 바로 뽑는 오늘의 타로 카드. 별콩이가 오늘 너에게 온 카드 한 장의 결을 읽어줄게.",
  alternates: { canonical: "/free/daily-card" },
};

export default function DailyCardPage() {
  return (
    <div>
      <h1 className="font-display text-[22px] text-eye-purple text-center">
        오늘의 타로 카드
      </h1>
      <p className="text-[12.5px] text-text-light mt-1.5 mb-6 text-center leading-relaxed">
        가입 없이, 하루 한 장 — 오늘 너에게 온 카드의 결을 봐줄게.
      </p>
      <DailyCardDraw />
      <GuideCta
        tag="그냥 별콩이한테 털어놓고 싶어"
        label="별콩이랑 더 깊게 보기"
      />
    </div>
  );
}
