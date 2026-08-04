"use client";

import { useState } from "react";
import SajuInputForm, {
  type SajuInputFormInitial,
} from "@/components/saju/SajuInputForm";
import type { SajuInput } from "@/lib/saju/calc";
import type { RelationType } from "@/lib/saju/profile-input";
import { MBTI_OPTIONS } from "@/lib/relationship/types";

// SajuInput → readings/profiles API가 받는 birth 필드 페이로드
export interface ProfilePayload {
  displayName: string;
  relationType: RelationType;
  birthDate: string | null; // P2: extended 모드 "생일 몰라요" 선택 시 null
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: SajuInput["gender"];
  mbti: string | null;
  personality: string | null;
}

const RELATION_OPTIONS: { value: RelationType; label: string }[] = [
  { value: "friend", label: "친구" },
  { value: "family", label: "가족" },
  { value: "partner", label: "연인" },
  { value: "other", label: "기타" },
];

export interface ProfileFormProps {
  // self면 이름·관계 입력 숨김, display_name은 기본값(닉네임) 사용
  mode: "self" | "acquaintance";
  initial?: SajuInputFormInitial;
  initialName?: string;
  initialRelation?: RelationType;
  defaultSelfName?: string; // self 모드에서 display_name 기본값 (계정 닉네임)
  submitLabel?: string;
  loading?: boolean;
  onSubmit: (payload: ProfilePayload) => void;
  /** P2 파일 허브 전용 — MBTI·성격·"생일 몰라요" UI 노출. 기본 false(기존 폼 그대로,
   *  mbti/personality는 항상 null, birthDate는 항상 값 있음 — 기존 소비처 동작 무변경). */
  extended?: boolean;
}

export default function ProfileForm({
  mode,
  initial,
  initialName,
  initialRelation,
  defaultSelfName,
  submitLabel,
  loading,
  onSubmit,
  extended = false,
}: ProfileFormProps) {
  const [name, setName] = useState<string>(initialName ?? "");
  const [relation, setRelation] = useState<RelationType>(initialRelation ?? "friend");
  const [mbti, setMbti] = useState<string | null>(null);
  const [personality, setPersonality] = useState<string>("");
  const [birthUnknown, setBirthUnknown] = useState(false);

  const handleSajuSubmit = (input: SajuInput) => {
    const displayName =
      mode === "self"
        ? (defaultSelfName?.trim() || "나")
        : name.trim();
    if (mode === "acquaintance" && displayName.length < 1) return;

    onSubmit({
      displayName: displayName.slice(0, 50),
      relationType: mode === "self" ? "self" : relation,
      birthDate: `${input.year}-${String(input.month).padStart(2, "0")}-${String(input.day).padStart(2, "0")}`,
      birthTime:
        input.hour !== null && input.hour !== undefined
          ? `${String(input.hour).padStart(2, "0")}:${String(input.minute ?? 0).padStart(2, "0")}`
          : null,
      isLunarInput: input.isLunar === true,
      isLeapMonth: input.isLeapMonth === true,
      gender: input.gender,
      mbti: extended ? mbti : null,
      personality: extended && personality.trim() ? personality.trim().slice(0, 500) : null,
    });
  };

  // extended 모드 전용 — "생일 몰라요" 체크 시 SajuInputForm을 건너뛰고 birthDate:null로 제출.
  // gender/lunar 값은 사주 계산이 스킵되므로 의미 없는 자리값.
  const handleNoBirthSubmit = () => {
    const displayName =
      mode === "self"
        ? (defaultSelfName?.trim() || "나")
        : name.trim();
    if (mode === "acquaintance" && displayName.length < 1) return;

    onSubmit({
      displayName: displayName.slice(0, 50),
      relationType: mode === "self" ? "self" : relation,
      birthDate: null,
      birthTime: null,
      isLunarInput: false,
      isLeapMonth: false,
      gender: "other",
      mbti,
      personality: personality.trim() ? personality.trim().slice(0, 500) : null,
    });
  };

  return (
    <div className="w-full">
      {mode === "acquaintance" && (
        <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-5 mb-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-bold text-eye-purple mb-1">이름</legend>
            <input
              type="text"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              placeholder="누구 사주야?"
              className="px-3 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px]"
            />
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-bold text-eye-purple mb-1">관계</legend>
            <div className="grid grid-cols-4 gap-2">
              {RELATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRelation(opt.value)}
                  className={`py-2.5 rounded-xl text-[13px] font-bold transition ${
                    relation === opt.value
                      ? "bg-lilac-deep text-white"
                      : "bg-cream-warm text-text-light border border-lilac-mid/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {extended && (
        <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-5 mb-5">
          <div>
            <p className="text-[13px] font-bold text-eye-purple mb-1">더 정확하게 (선택)</p>
            <p className="text-[11.5px] text-text-light leading-relaxed">
              몰라도 괜찮아 — 알려주면 별콩이가 더 잘 짚어볼게.
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-bold text-eye-purple mb-1">MBTI</legend>
            <select
              value={mbti ?? ""}
              onChange={(e) => setMbti(e.target.value || null)}
              className="w-full px-3 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px]"
            >
              <option value="">모름</option>
              {MBTI_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-bold text-eye-purple mb-1">성격</legend>
            <textarea
              value={personality}
              maxLength={500}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="어떤 성격인지 알려줄래? (예: 다정한데 무뚝뚝한 척해)"
              rows={3}
              className="px-3 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] resize-none"
            />
          </fieldset>

          <label className="flex items-center gap-2 text-[12px] text-text-light">
            <input
              type="checkbox"
              checked={birthUnknown}
              onChange={(e) => setBirthUnknown(e.target.checked)}
              className="w-4 h-4 accent-lilac-deep"
            />
            생일 몰라요
          </label>
        </div>
      )}

      {extended && birthUnknown ? (
        <div className="w-full max-w-md mx-auto px-5">
          <button
            type="button"
            onClick={handleNoBirthSubmit}
            disabled={loading}
            className="mt-2 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "저장하는 중…" : (submitLabel ?? "저장하기")}
          </button>
        </div>
      ) : (
        <SajuInputForm
          onSubmit={handleSajuSubmit}
          loading={loading}
          initial={initial}
          submitLabel={submitLabel ?? "저장하기"}
        />
      )}
    </div>
  );
}
