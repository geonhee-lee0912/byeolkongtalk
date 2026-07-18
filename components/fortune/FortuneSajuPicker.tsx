"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SajuBoard from "@/components/saju/SajuBoard";
import NewPersonModal from "@/components/fortune/NewPersonModal";
import type { SajuResult } from "@/lib/saju/calc";

interface PickerProfile {
  id: string;
  displayName: string;
  relationType: "self" | "family" | "friend" | "partner" | "other";
  birthDate: string;
  birthTime: string | null;
  isLunarInput: boolean;
  isPrimary: boolean;
  saju: SajuResult;
}

const RELATION_LABEL: Record<string, string> = {
  family: "가족",
  friend: "친구",
  partner: "연인",
  other: "기타",
};

const SIJIN = [
  { name: "자시", range: "23~01" },
  { name: "축시", range: "01~03" },
  { name: "인시", range: "03~05" },
  { name: "묘시", range: "05~07" },
  { name: "진시", range: "07~09" },
  { name: "사시", range: "09~11" },
  { name: "오시", range: "11~13" },
  { name: "미시", range: "13~15" },
  { name: "신시", range: "15~17" },
  { name: "유시", range: "17~19" },
  { name: "술시", range: "19~21" },
  { name: "해시", range: "21~23" },
];

function birthTimeToSijin(t: string | null): string | null {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  const idx = h === 23 ? 0 : Math.floor((h + 1) / 2) % 12;
  const s = SIJIN[idx];
  return `${s.name} (${s.range}시)`;
}

function birthLine(p: PickerProfile): string {
  const sijin = birthTimeToSijin(p.birthTime);
  return (
    p.birthDate.replace(/-/g, ". ") +
    (p.isLunarInput ? " · 음력" : " · 양력") +
    (sijin ? ` · ${sijin}` : " · 시간 모름")
  );
}

export interface FortuneSajuPickerProps {
  onConfirm: (profileId: string, displayName: string) => void;
  confirmLabel?: string;
  loading?: boolean;
  /** 오늘의 운세: 내 사주(primary)만 고정 노출, 목록 숨김 */
  lockPrimary?: boolean;
  nickname?: string;
  /** 사주판 아래 일간/음양 디테일 표시 여부 (기본 true) */
  showBoardDetail?: boolean;
  /** 사주판 아래 생년월일 줄 숨김 (상단 서브타이틀로 옮길 때) */
  hideBirthLine?: boolean;
  /** 선택된 사주의 생년월일 줄 변화 콜백 */
  onSelectedBirthLine?: (line: string | null) => void;
  /** profileId → 기존 이번 달 리딩 id. 선택 프로필이 여기 있으면 CTA 가 '다시보기'로 바뀜. */
  reviewableByProfile?: Record<string, string>;
  /** 다시보기 클릭 핸들러 (reviewable 일 때만 호출) */
  onReview?: (readingId: string) => void;
}

const LIST_PAGE_SIZE = 5;

export default function FortuneSajuPicker({
  onConfirm,
  confirmLabel,
  loading,
  lockPrimary,
  nickname,
  showBoardDetail = true,
  hideBirthLine,
  onSelectedBirthLine,
  reviewableByProfile,
  onReview,
}: FortuneSajuPickerProps) {
  const [profiles, setProfiles] = useState<PickerProfile[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      if (self) setSelectedId(self.id);
      setReady(true);
    })();
  }, []);

  const self = profiles.find((p) => p.isPrimary) ?? null;
  const selected = lockPrimary
    ? self
    : profiles.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    onSelectedBirthLine?.(selected ? birthLine(selected) : null);
  }, [selected, onSelectedBirthLine]);

  if (!ready) {
    return <p className="text-center text-[13px] text-text-light py-6">잠시만…</p>;
  }

  // 내 사주 미등록 안내 (오늘의 운세 + 모든 운세 공통)
  if ((lockPrimary && !self) || profiles.length === 0) {
    return (
      <div className="w-full max-w-md mx-auto px-5">
        <div className="bg-cream-warm rounded-2xl border border-lilac-mid/30 px-4 py-6 text-center">
          <p className="text-[13px] text-text-light/85 leading-relaxed mb-4">
            아직 내 사주를 등록하지 않았어.
            <br />
            내 정보에서 사주를 입력하면 바로 운세를 볼 수 있어.
          </p>
          <Link
            href="/mypage"
            className="inline-block px-5 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
          >
            내 사주 등록하러 가기
          </Link>
        </div>
      </div>
    );
  }

  const relationBadge = (p: PickerProfile) =>
    p.isPrimary ? "나" : RELATION_LABEL[p.relationType] ?? "지인";
  const displayName = (p: PickerProfile) =>
    p.isPrimary ? nickname ?? "내 사주" : p.displayName;

  const totalListPages = Math.max(1, Math.ceil(profiles.length / LIST_PAGE_SIZE));
  const safeListPage = Math.min(listPage, totalListPages - 1);
  const pagedProfiles = profiles.slice(
    safeListPage * LIST_PAGE_SIZE,
    safeListPage * LIST_PAGE_SIZE + LIST_PAGE_SIZE
  );

  return (
    <div className="w-full max-w-md mx-auto px-5">
      {/* 선택된 사주 — 8자판 + 오행 분석 */}
      <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30 mb-5">
        {selected && (
          <>
            <div className="mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-eye-purple">
                  {displayName(selected)}
                </span>
                <span className="text-[11px] text-text-light/70">
                  {relationBadge(selected)}
                </span>
              </div>
              {!hideBirthLine && (
                <p className="text-[11px] text-text-light/60 mt-0.5">
                  {birthLine(selected)}
                </p>
              )}
            </div>
            <div className="-mx-4">
              <SajuBoard saju={selected.saju} showDetail={showBoardDetail} />
            </div>
          </>
        )}
      </div>

      {/* 사주 목록 (선택 전용) — lockPrimary 면 숨김 */}
      {!lockPrimary && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] font-bold text-eye-purple">사주 목록</div>
            <button
              type="button"
              onClick={() => setShowNewPerson(true)}
              className="text-[11px] font-bold text-lilac-deep"
            >
              + 새 사람 입력
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-lilac-mid/30 overflow-hidden divide-y divide-lilac-mid/20">
            {pagedProfiles.map((p) => {
              const isSelected = selectedId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  aria-pressed={isSelected}
                  className={`w-full flex items-center justify-between p-3 text-left transition ${
                    isSelected ? "bg-lilac-soft/40" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-eye-purple">
                      {displayName(p)}
                      <span className="ml-2 text-[11px] text-text-light/70 font-normal">
                        {relationBadge(p)}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-light/70 mt-0.5">
                      {birthLine(p)}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 ml-2 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected
                        ? "border-lilac-deep bg-lilac-deep"
                        : "border-lilac-mid/50"
                    }`}
                    aria-hidden
                  >
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

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
      )}

      <button
        disabled={!selected || loading}
        onClick={() => {
          if (!selected) return;
          const reviewId = reviewableByProfile?.[selected.id];
          if (reviewId && onReview) onReview(reviewId);
          else onConfirm(selected.id, displayName(selected));
        }}
        className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] disabled:opacity-60"
      >
        {selected && reviewableByProfile?.[selected.id]
          ? "이번 달 운세 다시보기"
          : confirmLabel ?? "이 사주로 운세 보기"}
      </button>

      {showNewPerson && (
        <NewPersonModal
          relation="friend"
          onSaved={(profile) => {
            const created = profile as PickerProfile; // saju 포함 (serializeProfile)
            setProfiles((prev) => [...prev, created]);
            setSelectedId(created.id); // 방금 만든 사람 자동 선택
          }}
          onClose={() => setShowNewPerson(false)}
        />
      )}
    </div>
  );
}
