"use client";

// 나·상대 공통 프로필 편집 모달(P2 파일 허브) — 기존 RelationshipEditModal(상대 전용,
// 바텀시트)의 일반화. target="me"면 self 프로필을, 관계 객체면 호칭·상태+상대
// 프로필을 편집한다. 항상 중앙 모달(바텀시트 ❌ — 피커 겹침 회피, spec §P2).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import type { SajuInputFormInitial } from "@/components/saju/SajuInputForm";
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

interface ProfileEditModalProps {
  target: "me" | { relationshipId: string; label: string; status: RelationshipStatus };
  initial?: Partial<ProfilePayload> & { label?: string; status?: RelationshipStatus };
  onClose: () => void;
  /** 저장 성공 — 부모가 모달을 닫고 다시 불러오도록 알림 */
  onSaved: () => void;
}

// HH:MM → HOUR_BRANCHES 시작 hour (프리필용). null/undefined면 null(시간 모름).
// app/mypage/page.tsx 의 동명 로컬 함수와 동일 로직 — export 안 돼 있어 최소 복제.
function birthTimeToBranchHour(t: string | null | undefined): number | null {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  if (h === 23) return 0; // 자시 23-01 → 0
  return h - (h % 2);
}

// initial(ProfilePayload 일부) → SajuInputForm 프리필 변환. birthDate 없으면
// undefined(= "생일 몰라요" 경로 — 호출부에서 initialBirthUnknown과 짝지어 쓴다).
function toSajuInitial(
  initial: Partial<ProfilePayload> | undefined
): SajuInputFormInitial | undefined {
  const birthDate = initial?.birthDate;
  if (!birthDate) return undefined;
  return {
    year: Number(birthDate.slice(0, 4)),
    month: Number(birthDate.slice(5, 7)),
    day: Number(birthDate.slice(8, 10)),
    hour: birthTimeToBranchHour(initial?.birthTime),
    isLunar: initial?.isLunarInput === true,
    isLeapMonth: initial?.isLeapMonth === true,
    gender: initial?.gender ?? "other",
  };
}

export default function ProfileEditModal({
  target,
  initial,
  onClose,
  onSaved,
}: ProfileEditModalProps) {
  const isMe = target === "me";
  const rel = target !== "me" ? target : null;

  const [label, setLabel] = useState<string>(rel?.label ?? initial?.label ?? "");
  const [status, setStatus] = useState<RelationshipStatus>(
    rel?.status ?? initial?.status ?? "dating"
  );
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

  const handleProfileSubmit = async (payload: ProfilePayload) => {
    const { displayName, birthDate, birthTime, isLunarInput, isLeapMonth, gender, mbti, personality } =
      payload;

    if (isMe) {
      const ok = await patch({
        target: "me",
        selfProfile: {
          displayName,
          birthDate,
          birthTime,
          isLunarInput,
          isLeapMonth,
          gender,
          mbti,
          personality,
        },
      });
      if (ok) onSaved();
      return;
    }

    if (!rel) return; // isMe가 false면 항상 존재 — 타입 가드
    if (!labelValid) {
      setError("호칭을 입력해줘");
      return;
    }
    const ok = await patch({
      relationshipId: rel.relationshipId,
      label: trimmedLabel,
      status,
      partnerProfile: {
        displayName,
        birthDate,
        birthTime,
        isLunarInput,
        isLeapMonth,
        gender,
        mbti,
        personality,
      },
    });
    if (ok) onSaved();
  };

  const sajuInitial = toSajuInitial(initial);
  const initialBirthUnknown = !initial?.birthDate;
  const defaultSelfName = isMe ? initial?.displayName : trimmedLabel;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-night/75 backdrop-blur-md animate-fade-in px-5"
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md mx-auto bg-cream rounded-3xl border border-lilac-mid/30 shadow-[0_8px_32px_rgba(31,23,53,0.25)] max-h-[88vh] overflow-y-auto scrollbar-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[17px] font-bold text-eye-purple">
              {isMe ? "내 프로필 수정" : "관계 정보 수정"}
            </h2>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
            >
              ✕
            </button>
          </div>

          {rel && (
            <>
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
            </>
          )}

          {error && (
            <p className="text-[12px] text-red-500 text-center">{error}</p>
          )}
        </div>

        <ProfileForm
          mode="self"
          extended
          initial={sajuInitial}
          initialMbti={initial?.mbti ?? null}
          initialPersonality={initial?.personality ?? null}
          initialBirthUnknown={initialBirthUnknown}
          defaultSelfName={defaultSelfName}
          submitLabel="저장하기"
          loading={saving}
          onSubmit={(payload) => void handleProfileSubmit(payload)}
        />
        <div className="h-5" />
      </div>
    </div>,
    document.body
  );
}
