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
    <div className="mt-3 rounded-2xl border border-lilac-mid/20 bg-white shadow-[0_2px_10px_rgba(159,138,208,0.08)] py-4">
      {/* 1. 사주 명식 */}
      <div className="px-5 text-[11px] font-bold text-lilac-deep mb-2">
        {mine ? "내 사주 명식" : "사주 명식"}
      </div>
      {saju ? (
        <SajuBoard saju={saju} showDetail={false} />
      ) : (
        <p className="px-5 text-[12.5px] text-text-light/80 leading-relaxed">
          아직 생일을 안 알려줬어 — 수정에서 추가하면 명식이 보여.
        </p>
      )}

      <div className="h-px bg-lilac-mid/15 mx-5 my-4" />

      {/* 2. MBTI (칩) */}
      <div className="px-5 mb-4">
        <div className="text-[11px] font-bold text-lilac-deep mb-1.5">MBTI</div>
        {mbti ? (
          <span className="inline-block rounded-lg bg-lilac-soft text-lilac-deep text-[12px] font-bold px-2.5 py-1">
            {mbti}
          </span>
        ) : (
          <p className="text-[13px] text-text-light/50">미입력</p>
        )}
      </div>

      {/* 3. 성격 */}
      <div className="px-5">
        <div className="text-[11px] font-bold text-lilac-deep mb-1">
          {mine ? "내 성격" : "성격"}
        </div>
        {personality ? (
          <p className="text-[13px] text-eye-purple leading-relaxed whitespace-pre-wrap">
            {personality}
          </p>
        ) : (
          // 🔸 임시(데모): 빈 성격 칸 예시 텍스트 — 실데이터 연동/확인 후 제거할 것.
          <p className="text-[13px] text-eye-purple/85 leading-relaxed">
            평소엔 무뚝뚝한데 좋아하는 사람한텐 은근히 다정한 편이야. 먼저 연락은 잘 안
            하지만 챙길 건 다 챙기고, 서운한 걸 속으로 삭이다가 뒤늦게 툭 털어놓곤 해.
          </p>
        )}
      </div>
    </div>
  );
}
