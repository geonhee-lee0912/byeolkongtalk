"use client";

import { useEffect, useState } from "react";
import SajuBoard from "@/components/saju/SajuBoard";
import SajuIdentityRow, { sajuCaption } from "@/components/saju/SajuIdentityRow";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import type { SajuResult } from "@/lib/saju/calc";

interface PickerProfile {
  id: string;
  displayName: string;
  relationType: string;
  isPrimary: boolean;
  birthDate: string;
  birthTime: string | null;
  saju: SajuResult;
}

/** 리딩 헤더 등 표시용 프로필 요약 */
export interface PickerProfileSummary {
  displayName: string;
  relationType: string;
  birthDate: string;
  birthTime: string | null;
}

export type PickerResult =
  | {
      kind: "saved";
      profileId: string;
      saju: SajuResult;
      profile: PickerProfileSummary;
    }
  | { kind: "inline"; payload: ProfilePayload; save: boolean; saju: SajuResult };

export interface ProfilePickerProps {
  // 선택 + 미리보기 확정 시 호출 (부모가 readings/fortune POST 진행)
  onConfirm: (result: PickerResult) => void;
  confirmLabel?: string;
  loading?: boolean;
}

const RELATION_LABEL: Record<string, string> = {
  family: "가족",
  friend: "친구",
  partner: "연인",
  other: "기타",
};

export default function ProfilePicker({
  onConfirm,
  confirmLabel,
  loading,
}: ProfilePickerProps) {
  const [profiles, setProfiles] = useState<PickerProfile[]>([]);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"list" | "new">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveNew, setSaveNew] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const d = await fetch("/api/profiles", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      const list = (d?.profiles ?? []) as PickerProfile[];
      setProfiles(list);
      const self = list.find((p) => p.isPrimary);
      if (self) setSelectedId(self.id);
      else if (list.length === 0) setMode("new");
      setReady(true);
    })();
  }, []);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  const handleInlineSubmit = async (payload: ProfilePayload) => {
    // 미리보기 + 진행을 위해 서버 calc 호출
    setCalcLoading(true);
    try {
      const hasTime = payload.birthTime !== null;
      const res = await fetch("/api/consultations/saju/calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(payload.birthDate.slice(0, 4)),
          month: Number(payload.birthDate.slice(5, 7)),
          day: Number(payload.birthDate.slice(8, 10)),
          hour: hasTime ? Number(payload.birthTime!.slice(0, 2)) : null,
          minute: hasTime ? Number(payload.birthTime!.slice(3, 5)) : null,
          isLunar: payload.isLunarInput,
          isLeapMonth: payload.isLeapMonth,
          gender: payload.gender,
        }),
      });
      if (!res.ok) return;
      const d = await res.json();
      onConfirm({ kind: "inline", payload, save: saveNew, saju: d.saju as SajuResult });
    } finally {
      setCalcLoading(false);
    }
  };

  if (!ready) {
    return <p className="text-center text-[13px] text-text-light py-6">잠시만…</p>;
  }

  if (mode === "new") {
    return (
      <div className="w-full">
        <ProfileForm
          mode="acquaintance"
          submitLabel="이 사주로 보기"
          loading={loading || calcLoading}
          onSubmit={handleInlineSubmit}
        />
        <label className="flex items-center justify-center gap-2 text-[12px] text-text-light mt-3">
          <input
            type="checkbox"
            checked={saveNew}
            onChange={(e) => setSaveNew(e.target.checked)}
            className="w-4 h-4 accent-lilac-deep"
          />
          지인 목록에 저장하기
        </label>
        {profiles.length > 0 && (
          <button
            onClick={() => setMode("list")}
            className="mx-auto mt-3 block text-[12px] text-text-light/60 underline"
          >
            저장된 사주에서 고르기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-5">
      <div className="flex flex-col gap-2 mb-4">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`flex items-center gap-3 rounded-2xl p-3 border transition ${
              selectedId === p.id
                ? "border-lilac-deep bg-lilac-soft/40"
                : "border-lilac-mid/20 bg-white shadow-[0_2px_10px_rgba(159,138,208,0.07)]"
            }`}
          >
            <SajuIdentityRow
              saju={p.saju}
              title={p.isPrimary ? "내 사주" : p.displayName}
              badge={p.isPrimary ? null : (RELATION_LABEL[p.relationType] ?? "지인")}
              caption={sajuCaption(p.saju, p)}
            />
          </button>
        ))}
        <button
          onClick={() => setMode("new")}
          className="rounded-2xl p-3 border border-dashed border-lilac-mid text-[13px] text-lilac-deep font-bold"
        >
          + 새로 입력
        </button>
      </div>

      {selected && <SajuBoard saju={selected.saju} />}

      <button
        disabled={!selected || loading}
        onClick={() =>
          selected &&
          onConfirm({
            kind: "saved",
            profileId: selected.id,
            saju: selected.saju,
            profile: {
              displayName: selected.displayName,
              relationType: selected.relationType,
              birthDate: selected.birthDate,
              birthTime: selected.birthTime,
            },
          })
        }
        className="w-full mt-5 py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] disabled:opacity-60"
      >
        {confirmLabel ?? "이 사주로 보기"}
      </button>
    </div>
  );
}
