import DailyCardDraw from "@/components/seo/DailyCardDraw";
import { contentMetadata } from "@/lib/seo/metadata";

export const metadata = contentMetadata({
  title: "오늘의 타로 카드 한 장 — 무료·가입 없음",
  description:
    "회원가입 없이 바로 뽑는 오늘의 타로 카드. 별콩이가 오늘 너에게 온 카드 한 장의 결을 읽어줄게.",
  path: "/free/daily-card",
});

export default function DailyCardPage() {
  return (
    <div>
      <h1 className="font-display text-22 text-eye-purple text-center">
        오늘의 타로 카드
      </h1>
      <p className="text-13 text-text-light mt-1.5 mb-6 text-center leading-relaxed">
        가입 없이, 하루 한 장 — 오늘 너에게 온 카드의 결을 봐줄게.
      </p>
      <DailyCardDraw />
    </div>
  );
}
