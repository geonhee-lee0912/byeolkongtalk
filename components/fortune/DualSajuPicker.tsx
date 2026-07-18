"use client";

import { useEffect, useState } from "react";
import NewPersonModal from "@/components/fortune/NewPersonModal";

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

const LIST_PAGE_SIZE = 5;

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
  const [listPage, setListPage] = useState(0);
  const [showNewPerson, setShowNewPerson] = useState(false);

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

  // 새 사람 모달 저장 성공 — 목록에 추가하고 현재 활성 슬롯에 배정
  const handleNewPersonSaved = (profile: PickerProfile) => {
    setProfiles((prev) => [...prev, profile]);
    if (active === "A") {
      setSlotA(profile.id);
      if (!slotB) setActive("B");
    } else {
      setSlotB(profile.id);
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

  const totalListPages = Math.max(1, Math.ceil(profiles.length / LIST_PAGE_SIZE));
  const safeListPage = Math.min(listPage, totalListPages - 1);
  const pagedProfiles = profiles.slice(
    safeListPage * LIST_PAGE_SIZE,
    safeListPage * LIST_PAGE_SIZE + LIST_PAGE_SIZE
  );

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
              onClick={() => setActive(slot)}
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

      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-bold text-eye-purple">
          {active === "A" ? "첫 번째 사람" : "두 번째 사람"} 고르기
        </p>
        <button
          type="button"
          onClick={() => setShowNewPerson(true)}
          className="text-[11px] font-bold text-lilac-deep"
        >
          + 새 사람 입력
        </button>
      </div>

      {/* 프로필 목록 */}
      <div className="bg-white rounded-2xl border border-lilac-mid/30 overflow-hidden divide-y divide-lilac-mid/20 mb-3">
        {pagedProfiles.map((p) => {
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

      {totalListPages > 1 && (
        <div className="flex items-center justify-center gap-2 mb-3">
          <button
            onClick={() => setListPage((n) => Math.max(0, n - 1))}
            disabled={safeListPage === 0}
            aria-label="이전"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          {Array.from({ length: totalListPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setListPage(i)}
              aria-label={`${i + 1}페이지`}
              className={`w-7 h-7 rounded-lg text-[12px] font-bold ${
                i === safeListPage
                  ? "bg-lilac-deep text-white"
                  : "text-text-light/70 hover:bg-lilac-soft/50"
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setListPage((n) => Math.min(totalListPages - 1, n + 1))}
            disabled={safeListPage === totalListPages - 1}
            aria-label="다음"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

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

      {showNewPerson && (
        <NewPersonModal
          relation={newPersonRelation}
          onSaved={(profile) => handleNewPersonSaved(profile as PickerProfile)}
          onClose={() => setShowNewPerson(false)}
        />
      )}
    </div>
  );
}
