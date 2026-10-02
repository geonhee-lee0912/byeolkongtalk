"use client";

// 새 사람 사주 입력 모달 — FortuneSajuPicker/DualSajuPicker 공용 팝업.
// 포털/백드롭/ESC 패턴은 PassConfirmModal 과 동일.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import { profileSaveErrorMessage } from "@/components/saju/profile-save-error";

export interface NewPersonModalProps {
  /** 새 사람 기본 관계 (지인 폼 initialRelation) */
  relation?: "family" | "friend" | "partner" | "other";
  /** 저장 성공 — /api/profiles 응답의 profile 객체(saju 포함)를 그대로 전달 */
  onSaved: (profile: any) => void;
  onClose: () => void;
  /** 저장이 401 일 때 로그인 후 돌아올 곳. 상품 href 를 넘긴다(없으면 지금 화면). */
  loginNext?: string;
}

export default function NewPersonModal({
  relation,
  onSaved,
  onClose,
  loginNext,
}: NewPersonModalProps) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 🔴 401 은 "잠시 후 다시"로 안 풀린다 — 예전엔 비로그인이 궁합 구매 칸에서 폼을 다 채우고도 계속 실패했다.
  //    오류 줄에 로그인 링크를 단다(specs/2026-10-02-궁합-비로그인-막다른길-design.md §3-3).
  const [needLogin, setNeedLogin] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  // 오류 줄은 저장 버튼 아래라 짧은 화면에선 가려진다(SelfSajuEditModal 과 같은 문제) — 뜰 때 보이는 곳으로 당긴다.
  useEffect(() => {
    if (err) errRef.current?.scrollIntoView({ block: "nearest" });
  }, [err]);

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
    setNeedLogin(false);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr(profileSaveErrorMessage(res.status));
        setNeedLogin(res.status === 401);
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

  // 위 typeof document 가드 뒤라 window 접근이 SSR 에 닿지 않는다.
  const next = loginNext ?? window.location.pathname + window.location.search;

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
          <div ref={errRef} role="alert" className="text-center mt-3">
            <p className="text-[12px] text-red-500">{err}</p>
            {needLogin && (
              <Link
                href={`/login?next=${encodeURIComponent(next)}`}
                className="mt-1 inline-block text-[12px] text-lilac-deep underline"
              >
                다시 로그인하기
              </Link>
            )}
          </div>
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
