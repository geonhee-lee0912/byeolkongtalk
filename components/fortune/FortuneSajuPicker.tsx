"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SajuBoard from "@/components/saju/SajuBoard";
import NewPersonModal from "@/components/fortune/NewPersonModal";
import BirthPromptButton from "@/components/saju/BirthPromptButton";
import { BIRTH_PROMPT_SURFACE } from "@/lib/analytics/birth-prompt-surface";
import type { SajuResult } from "@/lib/saju/calc";
import { pickerGate } from "./picker-gate";

interface PickerProfile {
  id: string;
  displayName: string;
  relationType: "self" | "family" | "friend" | "partner" | "other";
  birthDate: string | null; // P2: 생일 없는 프로필 가능
  birthTime: string | null;
  isLunarInput: boolean;
  isPrimary: boolean;
  saju: SajuResult | null; // 생일 없음, 또는 계산 불가(없는 음력 날짜 등 — GET /api/profiles 가 행 단위로 null)면 null
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
  if (!p.birthDate) return "생일 미입력";
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
  /** 비로그인 카카오 CTA 가 로그인 후 돌아올 곳. 상품 href 를 넘긴다(없으면 지금 경로). */
  loginNext?: string;
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
  loginNext,
}: FortuneSajuPickerProps) {
  const [profiles, setProfiles] = useState<PickerProfile[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listPage, setListPage] = useState(0);
  const [showNewPerson, setShowNewPerson] = useState(false);
  const [authed, setAuthed] = useState(true);

  // 마운트와 생일 저장 뒤(onSaved) 둘 다 이걸 부른다 — 저장 뒤엔 isPrimary 자동 선택이 그대로 돈다.
  async function loadProfiles() {
    const d = await fetch("/api/profiles", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    // 조회가 실패하면 지금 목록을 그대로 둔다(마이페이지 reloadProfiles 와 같은 방식) — 목록 안 버튼(생일 없는
    // 내 사주)으로 저장한 직후 재조회가 실패해도 목록이 비어 벽으로 떨어지지 않는다. 벽 상태(목록 [])에서
    // 저장했는데 재조회가 실패하면 알 길이 없어 벽이 그대로 남는다 — 다시 누르면 재조회해 "내 사주 수정"으로 열린다.
    // 첫 마운트 땐 지금 목록이 [] 다.
    const list = Array.isArray(d?.profiles) ? (d.profiles as PickerProfile[]) : profiles;
    // 🔴 GET /api/profiles 는 비로그인에게도 200 {profiles:[]} 를 준다 — 목록이 "내 사주 필요"일
    //    때만 로그인 여부를 따로 묻는다(프로필 있는 유저는 요청이 늘지 않는다).
    let isAuthed = true;
    if (pickerGate({ profiles: list, lockPrimary: !!lockPrimary, authenticated: true }) !== "list") {
      const me = await fetch("/api/auth/me", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      // 🔴 확인 자체가 실패하면(me === null) 로그인한 것으로 본다 → "birth" 가 뜨고, 버튼을 누를 때
      //    BirthPromptButton 이 다시 확인해 비로그인이면 로그인으로 보낸다. 버튼과 같은 정책이다
      //    (=== true 로 두면 일시 장애 때 로그인한 유저에게 카카오 버튼이 뜬다 — Task 2 품질 리뷰).
      isAuthed = me?.isAuthenticated !== false;
    }
    setProfiles(list);
    setAuthed(isAuthed);
    const self = list.find((p) => p.isPrimary);
    if (self) setSelectedId(self.id);
    setReady(true);
  }

  useEffect(() => {
    void loadProfiles();
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

  // 내 사주 필요 — 로그인 전이면 카카오, 로그인했으면 그 자리 생일 입력(2026-10-02, /mypage 이탈 제거).
  // 🔴 예전엔 비로그인에게도 "아직 내 사주를 등록하지 않았어" 를 보였다 — 광고로 처음 온 사람은
  //    전원 로그인 전이라 이 문구를 먼저 봤고, /mypage 는 저장 뒤 이 상품으로 돌려보내지 않았다.
  const gate = pickerGate({ profiles, lockPrimary: !!lockPrimary, authenticated: authed });
  if (gate === "login") {
    // ready 이후에만 오므로(마운트 이펙트) window 접근이 SSR 에 닿지 않는다.
    const next = loginNext ?? window.location.pathname;
    return (
      <div className="w-full max-w-md mx-auto px-5">
        <div className="bg-cream-warm rounded-2xl border border-lilac-mid/30 px-4 py-6 text-center">
          <p className="text-[13px] text-text-light/85 leading-relaxed mb-4">
            로그인하면 바로 내 사주로 볼 수 있어.
          </p>
          {/* 카카오 버튼은 저장소 공통 컨벤션(ByeolmaruHub 와 같은 마크업). */}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 py-3.5 text-[15px] font-bold text-[#3C1E1E] transition hover:brightness-95 active:scale-[0.98]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.8L5.4 22l4.6-2.5c.7.1 1.4.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
            </svg>
            카카오로 시작하기
          </Link>
        </div>
      </div>
    );
  }
  if (gate === "birth") {
    return (
      <div className="w-full max-w-md mx-auto px-5">
        <div className="bg-cream-warm rounded-2xl border border-lilac-mid/30 px-4 py-6 text-center">
          <p className="text-[13px] text-text-light/85 leading-relaxed mb-4">
            생년월일만 알려주면 바로 볼 수 있어.
          </p>
          {/* 🔴 저장 뒤 결제 확인을 자동으로 띄우지 않는다 — 내 사주를 골라 두기까지만(스펙 §3). */}
          <BirthPromptButton
            surface={BIRTH_PROMPT_SURFACE.fortunePicker}
            loginNext={loginNext}
            onSaved={loadProfiles}
            className="inline-block px-5 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] disabled:opacity-60"
          >
            생년월일 입력하기
          </BirthPromptButton>
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
              {selected.saju ? (
                <SajuBoard saju={selected.saju} showDetail={showBoardDetail} />
              ) : selected.isPrimary ? (
                // 🔴 내 사주는 있는데 생일이 없는 경우 — 예전엔 이 문구만 뜨고 확인 버튼이 꺼져 막다른
                //    길이었다. 버튼은 내 사주를 PATCH 하므로 **내 사주일 때만** 단다(지인 프로필에 달면
                //    엉뚱한 사람이 고쳐진다 — 지인은 아래 문구만 그대로).
                <div className="py-4 text-center">
                  <p className="text-[12px] text-text-light/70 mb-3">생일을 알려주면 사주도 보여줄게</p>
                  <BirthPromptButton
                    surface={BIRTH_PROMPT_SURFACE.fortunePicker}
                    loginNext={loginNext}
                    onSaved={loadProfiles}
                    className="inline-block px-4 py-2 rounded-xl bg-lilac-deep text-white font-bold text-[13px] disabled:opacity-60"
                  >
                    생년월일 입력하기
                  </BirthPromptButton>
                </div>
              ) : (
                <p className="text-[12px] text-text-light/70 text-center py-4">
                  생일을 알려주면 사주도 보여줄게
                </p>
              )}
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
        disabled={!selected || !selected.saju || !selected.birthDate || loading}
        onClick={() => {
          if (!selected || !selected.saju || !selected.birthDate) return;
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
          loginNext={loginNext}
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
