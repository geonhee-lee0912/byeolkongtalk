"use client";

import { useEffect, useState } from "react";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";

interface PickerProfile {
  id: string;
  displayName: string;
  relationType: "self" | "family" | "friend" | "partner" | "other";
  birthDate: string;
  birthTime: string | null;
  isLunarInput: boolean;
  isPrimary: boolean;
}

const RELATION_LABEL: Record<string, string> = {
  family: "가족",
  friend: "친구",
  partner: "연인",
  other: "기타",
};

function birthShort(p: PickerProfile): string {
  return (
    p.birthDate.replace(/-/g, ". ") +
    (p.isLunarInput ? " · 음력" : " · 양력") +
    (p.birthTime ? "" : " · 시간 모름")
  );
}

export interface DualSajuPickerProps {
  onConfirm: (
    profileA: string,
    profileB: string,
    nameA: string,
    nameB: string
  ) => void;
  confirmLabel?: string;
  loading?: boolean;
  nickname?: string;
  /** 새 사람 입력 시 기본 관계 (연애 궁합=partner, 인간 관계 궁합=friend) */
  newPersonRelation?: "family" | "friend" | "partner" | "other";
}

export default function DualSajuPicker({
  onConfirm,
  confirmLabel,
  loading,
  nickname,
  newPersonRelation = "partner",
}: DualSajuPickerProps) {
  const [profiles, setProfiles] = useState<PickerProfile[]>([]);
  const [ready, setReady] = useState(false);
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [active, setActive] = useState<"A" | "B">("A");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const d = await fetch("/api/profiles", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      const list = (d?.profiles ?? []) as PickerProfile[];
      setProfiles(list);
      const self = list.find((p) => p.isPrimary);
      if (self) {
        setSlotA(self.id);
        setActive("B");
      }
      setReady(true);
    })();
  }, []);

  const displayName = (p: PickerProfile) =>
    p.isPrimary ? nickname ?? "내 사주" : p.displayName;
  const relationBadge = (p: PickerProfile) =>
    p.isPrimary ? "나" : RELATION_LABEL[p.relationType] ?? "지인";

  const assign = (id: string) => {
    setErr(null);
    // 다른 슬롯에 이미 들어간 프로필이면 무시 (중복 방지)
    if (active === "A") {
      if (slotB === id) return;
      setSlotA(id);
      if (!slotB) setActive("B"); // A 채우면 자동으로 B 로 넘어감
    } else {
      if (slotA === id) return;
      setSlotB(id);
    }
  };

  const handleAddSubmit = async (payload: ProfilePayload) => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr("저장을 못 했어. 잠시 후 다시 시도해줄래?");
        setSaving(false);
        return;
      }
      const data = await res.json();
      const created = data.profile as PickerProfile;
      setProfiles((prev) => [...prev, created]);
      // 방금 만든 사람을 현재 슬롯에 배정
      if (active === "A") {
        setSlotA(created.id);
        if (!slotB) setActive("B");
      } else {
        setSlotB(created.id);
      }
      setAdding(false);
    } catch {
      setErr("연결이 잠시 흔들렸어. 다시 시도해줄래?");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return <p className="text-center text-[13px] text-text-light py-6">잠시만…</p>;
  }

  const slotName = (id: string | null) => {
    if (!id) return null;
    const p = profiles.find((x) => x.id === id);
    return p ? displayName(p) : null;
  };

  const canConfirm = !!slotA && !!slotB && slotA !== slotB && !loading;

  return (
    <div className="w-full max-w-md mx-auto px-5">
      {/* 두 슬롯 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {(["A", "B"] as const).map((slot) => {
          const id = slot === "A" ? slotA : slotB;
          const name = slotName(id);
          const isActive = active === slot;
          return (
            <button
              key={slot}
              onClick={() => {
                setActive(slot);
                setAdding(false);
              }}
              className={`rounded-2xl border px-4 py-5 text-center transition ${
                isActive
                  ? "border-lilac-deep bg-lilac-soft/40"
                  : "border-lilac-mid/40 bg-cream-warm"
              }`}
            >
              <p className="text-[11px] text-text-light/70 mb-1">
                {slot === "A" ? "첫 번째 사람" : "두 번째 사람"}
              </p>
              <p className="text-[15px] font-bold text-eye-purple">
                {name ?? "선택 안 됨"}
              </p>
            </button>
          );
        })}
      </div>

      <p className="text-[12px] font-bold text-eye-purple mb-2">
        {active === "A" ? "첫 번째 사람" : "두 번째 사람"} 고르기
      </p>

      {/* 프로필 목록 */}
      <div className="bg-white rounded-2xl border border-lilac-mid/30 overflow-hidden divide-y divide-lilac-mid/20 mb-3">
        {profiles.map((p) => {
          const usedInOther =
            (active === "A" && slotB === p.id) || (active === "B" && slotA === p.id);
          const isPicked =
            (active === "A" && slotA === p.id) || (active === "B" && slotB === p.id);
          return (
            <button
              key={p.id}
              onClick={() => assign(p.id)}
              disabled={usedInOther}
              className={`w-full flex items-center justify-between p-3 text-left transition ${
                isPicked ? "bg-lilac-soft/40" : ""
              } ${usedInOther ? "opacity-40" : ""}`}
            >
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-eye-purple">
                  {displayName(p)}
                  <span className="ml-2 text-[11px] text-text-light/70 font-normal">
                    {relationBadge(p)}
                  </span>
                </div>
                <div className="text-[11px] text-text-light/70 mt-0.5">{birthShort(p)}</div>
              </div>
              {usedInOther && (
                <span className="shrink-0 ml-2 text-[10px] text-text-light/60">
                  반대편 선택됨
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 새 사람 입력 */}
      {adding ? (
        <div className="bg-cream-warm rounded-2xl border border-lilac-mid/30 py-4 mb-3">
          <ProfileForm
            mode="acquaintance"
            initialRelation={newPersonRelation}
            submitLabel="저장하고 선택"
            loading={saving}
            onSubmit={handleAddSubmit}
          />
          <div className="px-5">
            <button
              onClick={() => setAdding(false)}
              className="w-full mt-2 py-2 text-[12px] text-text-light/70"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full py-3 mb-3 rounded-xl border border-dashed border-lilac-deep/40 text-lilac-deep font-bold text-[13px]"
        >
          + 새 사람 입력
        </button>
      )}

      {err && <p className="text-[12px] text-red-500 text-center mb-3">{err}</p>}

      <button
        disabled={!canConfirm}
        onClick={() => {
          if (slotA && slotB)
            onConfirm(
              slotA,
              slotB,
              slotName(slotA) ?? "첫 번째 사람",
              slotName(slotB) ?? "두 번째 사람"
            );
        }}
        className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] disabled:opacity-60"
      >
        {confirmLabel ?? "궁합 보기"}
      </button>
    </div>
  );
}
