"use client";

// 관계 정보(호칭/상태/상대 생년월일) 수정 팝업 — 헤더 ✏️ 버튼과
// "상대 생년월일이 없어" 배너가 공용으로 여는 재등록 경로이기도 하다.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import {
  RELATIONSHIP_STATUS_LABELS,
  type RelationshipStatus,
} from "@/lib/relationship/types";

const STATUS_OPTIONS: RelationshipStatus[] = [
  "crush",
  "dating",
  "breakup",
  "onesided",
];

interface RelationshipEditModalProps {
  currentLabel: string;
  currentStatus: RelationshipStatus;
  onClose: () => void;
  /** 저장 성공 — 부모가 모달을 닫고 GET을 다시 불러오도록 알림 */
  onSaved: () => void;
}

export default function RelationshipEditModal({
  currentLabel,
  currentStatus,
  onClose,
  onSaved,
}: RelationshipEditModalProps) {
  const [label, setLabel] = useState(currentLabel);
  const [status, setStatus] = useState<RelationshipStatus>(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 배경 스크롤 잠금 — 마운트 동안 유지
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // ESC 닫기 (저장 진행 중엔 닫기 불가) — saving 최신값을 반영해야 하므로 deps에 포함
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  if (typeof document === "undefined") return null;

  const trimmedLabel = label.trim();
  const labelValid = trimmedLabel.length >= 1 && trimmedLabel.length <= 50;

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/relationship", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("저장이 안 됐어. 잠시 후 다시 시도해줄래?");
        return false;
      }
      return true;
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBasic = async () => {
    if (!labelValid) {
      setError("호칭을 입력해줘");
      return;
    }
    const ok = await patch({ label: trimmedLabel, status });
    if (ok) onSaved();
  };

  const handleSaveWithBirth = async (payload: ProfilePayload) => {
    if (!labelValid) {
      setError("호칭을 입력해줘");
      return;
    }
    const { displayName, birthDate, birthTime, isLunarInput, isLeapMonth, gender } =
      payload;
    const ok = await patch({
      label: trimmedLabel,
      status,
      partnerProfile: { displayName, birthDate, birthTime, isLunarInput, isLeapMonth, gender },
    });
    if (ok) onSaved();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-night/75 backdrop-blur-md animate-fade-in"
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md mx-auto bg-cream rounded-t-3xl sm:rounded-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] sm:shadow-[0_8px_32px_rgba(31,23,53,0.25)] max-h-[88vh] overflow-y-auto scrollbar-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[17px] font-bold text-eye-purple">
              관계 정보 수정
            </h2>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
            >
              ✕
            </button>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-bold text-eye-purple mb-1">
              호칭
            </legend>
            <input
              type="text"
              value={label}
              maxLength={50}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px]"
            />
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-bold text-eye-purple mb-1">
              관계 상태
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`py-2.5 rounded-xl text-[14px] font-bold transition ${
                    status === s
                      ? "bg-lilac-deep text-white"
                      : "bg-cream-warm text-text-light border border-lilac-mid/40"
                  }`}
                >
                  {RELATIONSHIP_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="text-[12px] text-red-500 text-center">{error}</p>
          )}

          <button
            type="button"
            onClick={() => void handleSaveBasic()}
            disabled={saving || !labelValid}
            className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "저장하는 중…" : "저장하기"}
          </button>

          <div className="border-t border-lilac-mid/30 pt-4 mt-1">
            <p className="text-[13px] font-bold text-eye-purple mb-1">
              상대 생년월일 (선택)
            </p>
            <p className="text-[11.5px] text-text-light mb-1 leading-relaxed">
              궁합을 볼 때 필요해 — 입력하고 아래 버튼을 눌러야 저장돼.
            </p>
          </div>
        </div>

        <ProfileForm
          mode="self"
          defaultSelfName={trimmedLabel}
          submitLabel="생년월일 저장하기"
          loading={saving}
          onSubmit={(payload) => void handleSaveWithBirth(payload)}
        />
        <div className="h-5" />
      </div>
    </div>,
    document.body
  );
}
