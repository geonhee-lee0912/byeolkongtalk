"use client";

// 내 명식 편집 모달 — 원래 SajuProfileModal 의 "내 명식 편집" 파트를 분리.
// 명식 표시는 마이페이지 인라인(SajuBoard)이 담당하고, 이 모달은 편집만 담당한다.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import { type ProfileItem, toInitial } from "@/components/mypage/sajuShared";

interface SelfSajuEditModalProps {
  self: ProfileItem | null;
  /** self 프로필 신규 생성 시 이름 기본값(계정 닉네임) — ProfileForm mode="self" 용 */
  selfDisplayName: string;
  onReload: () => Promise<void>;
  onClose: () => void;
}

export default function SelfSajuEditModal({
  self,
  selfDisplayName,
  onReload,
  onClose,
}: SelfSajuEditModalProps) {
  const [saving, setSaving] = useState(false);

  // 배경 스크롤 잠금 — 마운트 동안 유지
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const saveSelf = async (payload: ProfilePayload) => {
    setSaving(true);
    try {
      const url = self ? `/api/profiles/${self.id}` : "/api/profiles";
      const method = self ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await onReload();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-cream z-10">
          <h2 className="text-[15px] font-bold text-eye-purple">
            {self?.saju ? "내 사주 수정" : "내 사주 입력"}
          </h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
          >
            ✕
          </button>
        </div>
        <div className="pb-5">
          <ProfileForm
            mode="self"
            initial={self ? toInitial(self) : undefined}
            defaultSelfName={selfDisplayName}
            submitLabel="저장하기"
            loading={saving}
            onSubmit={saveSelf}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
