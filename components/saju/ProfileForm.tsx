"use client";

import { useState } from "react";
import SajuInputForm, {
  type SajuInputFormInitial,
} from "@/components/saju/SajuInputForm";
import type { SajuInput } from "@/lib/saju/calc";
import type { RelationType } from "@/lib/saju/profile-input";

// SajuInput → readings/profiles API가 받는 birth 필드 페이로드
export interface ProfilePayload {
  displayName: string;
  relationType: RelationType;
  birthDate: string;
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: SajuInput["gender"];
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
}: ProfileFormProps) {
  const [name, setName] = useState<string>(initialName ?? "");
  const [relation, setRelation] = useState<RelationType>(initialRelation ?? "friend");

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

      <SajuInputForm
        onSubmit={handleSajuSubmit}
        loading={loading}
        initial={initial}
        submitLabel={submitLabel ?? "저장하기"}
      />
    </div>
  );
}
