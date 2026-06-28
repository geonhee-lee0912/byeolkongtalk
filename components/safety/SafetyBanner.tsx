"use client";

import type { SensitiveCategory } from "@/lib/sensitive";

interface Hotline {
  name: string;
  number: string;
  note?: string;
}

const HOTLINES: Record<SensitiveCategory, Hotline[]> = {
  suicide: [
    { name: "자살예방상담전화", number: "109", note: "24시간 익명·무료" },
    { name: "정신건강위기상담", number: "1577-0199" },
    { name: "보건복지상담센터", number: "129" },
  ],
  school_violence: [
    { name: "학교폭력신고센터", number: "117", note: "24시간 익명" },
    { name: "청소년상담전화", number: "1388", note: "24시간 익명" },
  ],
  domestic_violence: [
    { name: "여성긴급전화", number: "1366", note: "24시간 익명·무료" },
    { name: "경찰 (긴급)", number: "112" },
  ],
  sexual_violence: [
    { name: "여성긴급전화", number: "1366", note: "24시간 익명" },
    { name: "해바라기센터", number: "지역별 운영", note: "의료·법률·심리 지원" },
  ],
  substance_abuse: [
    { name: "한국마약퇴치운동본부", number: "1342", note: "익명 상담" },
    { name: "보건복지상담센터", number: "129" },
  ],
  other: [
    { name: "정신건강위기상담", number: "1577-0199", note: "24시간 익명" },
    { name: "자살예방상담전화", number: "109", note: "24시간 익명·무료" },
  ],
};

const CATEGORY_LABEL: Record<SensitiveCategory, string> = {
  suicide: "잠시 멈춰 깊게 숨 한 번 쉬어볼래?",
  school_violence: "혼자 견디지 않아도 돼",
  domestic_violence: "안전이 가장 먼저야",
  sexual_violence: "너의 잘못이 아니야",
  substance_abuse: "의지의 문제가 아니야",
  other: "도움받을 수 있는 곳이 있어",
};

export interface SafetyBannerProps {
  category: SensitiveCategory;
  severity: number;
  onClose?: () => void;
}

export default function SafetyBanner({
  category,
  severity,
  onClose,
}: SafetyBannerProps) {
  const hotlines = HOTLINES[category] ?? HOTLINES.other;
  const isUrgent = severity >= 3;

  return (
    <div
      className={`rounded-2xl p-4 my-3 border-2 ${
        isUrgent
          ? "bg-rose-50 border-rose-300"
          : "bg-cream-warm border-gold-soft"
      }`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            🤍
          </span>
          <p className="text-[14px] font-bold text-eye-purple leading-tight">
            {CATEGORY_LABEL[category]}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-text-light/70 text-[18px] leading-none px-1"
            aria-label="닫기"
          >
            ×
          </button>
        )}
      </div>

      <p className="text-[12px] text-text-light leading-relaxed mb-3">
        별콩이는 사주를 봐주는 친구라서 이 이야기는 더 잘 들어줄 수 있는 곳을
        알려줄게. 모두 익명으로 연결 가능해.
      </p>

      <div className="flex flex-col gap-1.5">
        {hotlines.map((h, i) => (
          <div
            key={i}
            className="flex items-baseline gap-2 text-[13px] bg-white/60 rounded-lg px-3 py-2"
          >
            <span className="font-bold text-eye-purple">{h.name}</span>
            <span className="font-mono text-lilac-deep font-bold">
              {h.number}
            </span>
            {h.note && (
              <span className="text-[11px] text-text-light/80 ml-auto">
                {h.note}
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-text-light/60 mt-3 leading-relaxed">
        별콩이의 풀이는 정신건강 전문 상담을 대체하지 않아.
      </p>
    </div>
  );
}
