"use client";

// 새 사람 사주 입력 모달 — FortuneSajuPicker/DualSajuPicker 공용 팝업.
// 포털/백드롭/ESC 패턴은 PassConfirmModal 과 동일.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";

export interface NewPersonModalProps {
  /** 새 사람 기본 관계 (지인 폼 initialRelation) */
  relation?: "family" | "friend" | "partner" | "other";
  /** 저장 성공 — /api/profiles 응답의 profile 객체(saju 포함)를 그대로 전달 */
  onSaved: (profile: any) => void;
  onClose: () => void;
}

export default function NewPersonModal({
  relation,
  onSaved,
  onClose,
}: NewPersonModalProps) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 배경 스크롤 잠금 — 마운트 동안 유지
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // ESC 닫기 (저장 중엔 닫기 불가) — saving 최신값을 반영해야 하므로 deps에 포함
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  if (typeof document === "undefined") return null;

  const handleSubmit = async (payload: ProfilePayload) => {
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
      onSaved(data.profile);
      onClose();
    } catch {
      setErr("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-night/75 backdrop-blur-md animate-fade-in"
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md mx-auto bg-cream rounded-t-3xl sm:rounded-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] sm:shadow-[0_8px_32px_rgba(31,23,53,0.25)] max-h-[85vh] overflow-y-auto p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <p className="font-display text-[17px] font-bold text-eye-purple">
            새 사람 사주 입력
          </p>
        </div>

        <ProfileForm
          mode="acquaintance"
          initialRelation={relation}
          submitLabel="저장하고 선택"
          loading={saving}
          onSubmit={handleSubmit}
        />

        {err && (
          <p className="text-[12px] text-red-500 text-center mt-3">{err}</p>
        )}

        <button
          type="button"
          onClick={() => !saving && onClose()}
          disabled={saving}
          className="w-full mt-3 py-3 rounded-xl border border-lilac-mid/40 text-text-light font-bold text-[14px] hover:bg-lilac-soft/30 active:scale-[0.98] transition disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>,
    document.body
  );
}
