// components/relationship/ProfileDetails.tsx — 프로필 상세(사주 명식 → MBTI → 성격).
// 나 카드 아래(항상)와 상대 카드 아래(펼쳤을 때) 공용 — 순서·형태를 한 곳에서 통일.
import SajuBoard from "@/components/saju/SajuBoard";
import type { SajuResult } from "@/lib/saju/calc";

export interface ProfileDetailsProps {
  saju: SajuResult | null;
  mbti: string | null;
  personality: string | null;
  /** true면 "내 ~" 라벨(나 카드), false면 "~"(상대 카드). */
  mine?: boolean;
}

export default function ProfileDetails({ saju, mbti, personality, mine }: ProfileDetailsProps) {
  return (
    <div className="mt-3 rounded-2xl bg-white shadow-card py-4">
      {/* 1. 사주 명식 */}
      <div className="px-5 text-11 font-bold text-accent mb-2">
        {mine ? "내 사주 명식" : "사주 명식"}
      </div>
      {saju ? (
        <SajuBoard saju={saju} showDetail={false} />
      ) : (
        <p className="px-5 text-13 text-text-light leading-relaxed">
          아직 생일을 안 알려줬어 — 수정에서 추가하면 명식이 보여.
        </p>
      )}

      <div className="h-px bg-lilac-mid/15 mx-5 my-4" />

      {/* 2. MBTI (칩) */}
      <div className="px-5 mb-4">
        <div className="text-11 font-bold text-accent mb-1.5">MBTI</div>
        {mbti ? (
          <span className="inline-block rounded-lg bg-lilac-soft text-accent text-12 font-bold px-2.5 py-1">
            {mbti}
          </span>
        ) : (
          <p className="text-13 text-text-light">미입력</p>
        )}
      </div>

      {/* 3. 성격 */}
      <div className="px-5">
        <div className="text-11 font-bold text-accent mb-1">
          {mine ? "내 성격" : "성격"}
        </div>
        {personality ? (
          <p className="text-13 text-eye-purple leading-relaxed whitespace-pre-wrap">
            {personality}
          </p>
        ) : (
          <p className="text-13 text-text-light">미입력</p>
        )}
      </div>
    </div>
  );
}
