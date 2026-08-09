"use client";

// 지인 사주 팝업 — 원래 SajuProfileModal 의 "지인 사주" 파트(목록·추가/수정·케밥·삭제확인·
// 페이지네이션)를 분리. 명식(self) 편집은 SelfSajuEditModal 이 담당.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import { ELEMENT_COLORS } from "@/lib/saju/elements";
import {
  type ProfileItem,
  RELATION_LABEL,
  birthTimeToSijin,
  toInitial,
} from "@/components/mypage/sajuShared";

interface AcquaintanceListModalProps {
  profiles: ProfileItem[];
  relationshipProfileIds: string[];
  onReload: () => Promise<void>;
  onClose: () => void;
}

export default function AcquaintanceListModal({
  profiles,
  relationshipProfileIds,
  onReload,
  onClose,
}: AcquaintanceListModalProps) {
  const [savingProfile, setSavingProfile] = useState(false);
  const [showAddAcq, setShowAddAcq] = useState(false);
  const [editAcqId, setEditAcqId] = useState<string | null>(null);
  const [deleteAcqId, setDeleteAcqId] = useState<string | null>(null);
  const [deleteAck, setDeleteAck] = useState(false);
  const [listPage, setListPage] = useState(0);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 배경 스크롤 잠금
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const acquaintances = profiles.filter((p) => !p.isPrimary);

  const LIST_PAGE_SIZE = 3;
  const totalListPages = Math.max(1, Math.ceil(acquaintances.length / LIST_PAGE_SIZE));
  const safeListPage = Math.min(listPage, totalListPages - 1);
  const pagedProfiles = acquaintances.slice(
    safeListPage * LIST_PAGE_SIZE,
    safeListPage * LIST_PAGE_SIZE + LIST_PAGE_SIZE
  );

  const saveAcquaintance = async (payload: ProfilePayload, editId: string | null) => {
    setSavingProfile(true);
    try {
      const url = editId ? `/api/profiles/${editId}` : "/api/profiles";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await onReload();
        setShowAddAcq(false);
        setEditAcqId(null);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const deleteAcquaintance = async (id: string) => {
    const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
    if (res.ok) {
      await onReload();
      setDeleteAcqId(null);
      setDeleteAck(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5"
        onClick={onClose}
      >
        <div
          ref={scrollRef}
          className="bg-cream rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-cream z-10">
            <h2 className="text-[15px] font-bold text-eye-purple">지인 사주</h2>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
            >
              ✕
            </button>
          </div>

          <div className="px-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-bold text-eye-purple">
                전체 <span className="text-text-light/60 font-normal">{acquaintances.length}</span>
              </div>
              {!showAddAcq && !editAcqId && (
                <button
                  onClick={() => setShowAddAcq(true)}
                  className="text-[11px] text-lilac-deep font-bold underline"
                >
                  + 지인 추가
                </button>
              )}
            </div>

            {(showAddAcq || editAcqId) && (
              <div className="bg-white rounded-2xl p-4 border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] mb-3">
                <ProfileForm
                  mode="acquaintance"
                  initial={
                    editAcqId
                      ? toInitial(acquaintances.find((a) => a.id === editAcqId)!)
                      : undefined
                  }
                  initialName={
                    editAcqId
                      ? acquaintances.find((a) => a.id === editAcqId)?.displayName
                      : undefined
                  }
                  initialRelation={
                    editAcqId
                      ? (acquaintances.find((a) => a.id === editAcqId)
                          ?.relationType as Exclude<ProfileItem["relationType"], "self">)
                      : undefined
                  }
                  submitLabel={editAcqId ? "수정하기" : "추가하기"}
                  loading={savingProfile}
                  onSubmit={(payload) => saveAcquaintance(payload, editAcqId)}
                />
                <button
                  onClick={() => {
                    setShowAddAcq(false);
                    setEditAcqId(null);
                  }}
                  className="mx-auto mt-3 block text-[12px] text-text-light/60 underline"
                >
                  취소
                </button>
              </div>
            )}

            {(showAddAcq || editAcqId) && acquaintances.length > 0 && (
              <div className="h-px bg-lilac-mid/20 mb-3" />
            )}

            {acquaintances.length === 0 && !showAddAcq && !editAcqId ? (
              <div className="bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] px-4 py-6">
                <p className="text-[12px] text-text-light/70 text-center mb-3">
                  아직 함께 보는 사주가 없어. 지인 사주를 추가하면 여기에 모아서 함께 풀어볼 수 있어.
                </p>
                <button
                  onClick={() => setShowAddAcq(true)}
                  className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
                >
                  지인 추가하기
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {pagedProfiles.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)] p-3 flex items-center gap-3"
                  >
                    <div
                      className="shrink-0 w-11 h-11 rounded-xl border border-lilac-mid/30 flex items-center justify-center"
                      style={
                        p.saju
                          ? {
                              backgroundColor: ELEMENT_COLORS[p.saju.dayElement].bg,
                              color: ELEMENT_COLORS[p.saju.dayElement].text,
                            }
                          : undefined
                      }
                    >
                      <span className="text-[16px] font-bold leading-none">
                        {p.saju ? p.saju.pillars.day.hanja : "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-bold text-eye-purple truncate">
                        {p.displayName}
                        <span className="ml-1.5 text-[10px] font-bold text-text-light/70 bg-lilac-soft/60 rounded-full px-1.5 py-0.5">
                          {RELATION_LABEL[p.relationType] ?? "지인"}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-light/70 mt-0.5 truncate">
                        {p.saju && p.birthDate ? (
                          <>
                            {p.saju.dayStem}
                            {p.saju.dayElement} 일간 · {p.birthDate.replace(/-/g, ". ")}
                            {birthTimeToSijin(p.birthTime)
                              ? ` · ${birthTimeToSijin(p.birthTime)}`
                              : " · 시간 모름"}
                          </>
                        ) : (
                          "생일 미입력"
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSheetId(p.id)}
                      aria-label="더보기"
                      className="shrink-0 p-1.5 rounded-lg text-text-light/60 hover:bg-lilac-soft/50"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.6" />
                        <circle cx="12" cy="12" r="1.6" />
                        <circle cx="12" cy="19" r="1.6" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {totalListPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-3">
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
          </div>
        </div>
      </div>

      {/* 지인 행 케밥 팝업 */}
      {sheetId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-5"
          onClick={() => setSheetId(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xs p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setEditAcqId(sheetId);
                setShowAddAcq(false);
                setSheetId(null);
                scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="w-full py-3.5 rounded-xl text-[14px] text-eye-purple font-medium hover:bg-lilac-soft/40"
            >
              수정
            </button>
            <button
              onClick={() => {
                setDeleteAcqId(sheetId);
                setDeleteAck(false);
                setSheetId(null);
              }}
              className="w-full py-3.5 rounded-xl text-[14px] text-rose-500 font-medium hover:bg-rose-50"
            >
              삭제
            </button>
            <button
              onClick={() => setSheetId(null)}
              className="w-full py-3.5 rounded-xl text-[14px] text-text-light/70"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 지인 삭제 확인 모달 (연애 상담 사용 중이면 경고 체크 게이트) */}
      {deleteAcqId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-5">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
            <p className="text-[14px] font-bold text-eye-purple mb-2">지인 사주 삭제</p>
            <p className="text-[12px] text-text-light leading-relaxed mb-4">
              이 지인 사주를 삭제할까? 과거 풀이 기록은 그대로 남아.
            </p>
            {relationshipProfileIds.includes(deleteAcqId) && (
              <div className="mb-4 rounded-xl bg-gold-soft/20 border border-gold/50 p-3">
                <p className="text-[12px] text-eye-purple leading-relaxed mb-2">
                  이 프로필은 &apos;연애 상담&apos;에서 사용 중이야 — 삭제하면 궁합을
                  다시 보려면 생년월일을 다시 등록해야 해.
                </p>
                <label className="flex items-center gap-2 text-[11.5px] text-text-light">
                  <input
                    type="checkbox"
                    checked={deleteAck}
                    onChange={(e) => setDeleteAck(e.target.checked)}
                    className="w-4 h-4 accent-rose-500"
                  />
                  확인했어, 그래도 삭제할게
                </label>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setDeleteAcqId(null);
                  setDeleteAck(false);
                }}
                className="flex-1 py-2 rounded-xl border border-lilac-mid text-eye-purple text-[12px]"
              >
                취소
              </button>
              <button
                onClick={() => deleteAcquaintance(deleteAcqId)}
                disabled={relationshipProfileIds.includes(deleteAcqId) && !deleteAck}
                className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
