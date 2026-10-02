"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NewPersonModal from "@/components/fortune/NewPersonModal";
import BirthPromptButton from "@/components/saju/BirthPromptButton";
import type { BirthPromptSurface } from "@/lib/analytics/birth-prompt-surface";
import type { SajuResult } from "@/lib/saju/calc";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { pickerGate, type PickerGate } from "./picker-gate";
import { autoSlotSelf, noOneToPick } from "./dual-picker";

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

function birthShort(p: PickerProfile): string {
  if (!p.birthDate) return "생일 미입력";
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
  /** 비로그인 카카오 CTA·새 사람 저장 401 이 로그인 후 돌아올 곳. 상품 href 를 넘긴다(없으면 지금 경로).
   *  🔴 cfg.type 으로 조립하지 말 것 — compat_social 의 href 는 하이픈(/fortune/compat-social). */
  loginNext?: string;
  /** 내 사주 생일 입력 버튼의 계측 자리. ui_events 는 경로를 남기지 않아 상품마다 값이 다르다. */
  birthSurface: BirthPromptSurface;
}

export default function DualSajuPicker({
  onConfirm,
  confirmLabel,
  loading,
  nickname,
  newPersonRelation = "partner",
  loginNext,
  birthSurface,
}: DualSajuPickerProps) {
  const [profiles, setProfiles] = useState<PickerProfile[]>([]);
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [active, setActive] = useState<"A" | "B">("A");
  const [listPage, setListPage] = useState(0);
  const [showNewPerson, setShowNewPerson] = useState(false);
  // 벽 노출 계측은 gate 값이 바뀔 때만 — 재조회(생일 저장 뒤)·StrictMode 이중 마운트로 중복되지 않게.
  const shownGateRef = useRef<PickerGate | null>(null);

  // 마운트와 생일 저장 뒤(BirthPromptButton.onSaved) 둘 다 이걸 부른다 — FortuneSajuPicker.loadProfiles 와 같은 모양.
  // 정본: docs/superpowers/specs/2026-10-02-궁합-비로그인-막다른길-design.md
  async function loadProfiles() {
    const d = await fetch("/api/profiles", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    // 조회가 실패하면 지금 목록을 그대로 둔다(첫 마운트 땐 지금 목록이 [] 다).
    const list = Array.isArray(d?.profiles) ? (d.profiles as PickerProfile[]) : profiles;
    // 🔴 GET /api/profiles 는 비로그인에게도 200 {profiles:[]} 를 준다 — 목록이 비었을 때만 로그인 여부를
    //    따로 묻는다(프로필 있는 유저는 요청이 늘지 않는다).
    let isAuthed = true;
    if (pickerGate({ profiles: list, lockPrimary: false, authenticated: true }) !== "list") {
      const me = await fetch("/api/auth/me", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      // 🔴 확인 자체가 실패하면(me === null) 로그인한 것으로 본다 — 버튼을 누를 때 BirthPromptButton 이
      //    다시 확인한다(FortuneSajuPicker 와 같은 정책).
      isAuthed = me?.isAuthenticated !== false;
    }
    const gate = pickerGate({ profiles: list, lockPrimary: false, authenticated: isAuthed });
    if (gate !== "list" && gate !== shownGateRef.current) {
      trackUiEvent("picker_gate_shown", { meta: { surface: birthSurface, gate } });
    }
    shownGateRef.current = gate;
    setProfiles(list);
    setAuthed(isAuthed);
    // 🔴 무조건 첫 칸에 넣으면, 생일 없는 내 사주를 둘째 칸에 둔 채 생일을 저장했을 때 같은 사람이 두 칸이 된다.
    const selfId = list.find((p) => p.isPrimary)?.id ?? null;
    if (autoSlotSelf({ selfId, slotA, slotB })) {
      setSlotA(selfId);
      if (!slotB) setActive("B"); // A 채우면 자동으로 B 로 넘어감
    }
    setReady(true);
  }

  useEffect(() => {
    void loadProfiles();
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

  // 내 사주 필요 — 로그인 전이면 카카오, 로그인했으면 그 자리 생일 입력(사주 단일 상품 구매 칸과 같은 3분기).
  // 🔴 예전엔 비로그인에게 빈 피커를 보였다 — "+ 새 사람 입력" 은 저장이 401 로 계속 실패했고, 로그인 확인이 있는
  //    "궁합 보기"는 두 칸이 차지 않아 꺼져 있었다. lockPrimary:false 라 지인만 있는 유저는 지금처럼 목록이다(스펙 §5).
  const gate = pickerGate({ profiles, lockPrimary: false, authenticated: authed });
  if (gate === "login") {
    // ready 이후에만 오므로(마운트 이펙트) window 접근이 SSR 에 닿지 않는다.
    const next = loginNext ?? window.location.pathname;
    return (
      <div className="w-full max-w-md mx-auto px-5">
        <div className="bg-cream-warm rounded-2xl border border-lilac-mid/30 px-4 py-6 text-center">
          <p className="text-[13px] text-text-light/85 leading-relaxed mb-4">
            로그인하면 바로 두 사람 궁합을 볼 수 있어.
          </p>
          {/* 카카오 버튼은 저장소 공통 컨벤션(FortuneSajuPicker·ByeolmaruHub 와 같은 마크업). */}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            onClick={() => trackUiEvent("picker_login_clicked", { meta: { surface: birthSurface } })}
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
            내 생년월일부터 알려줘. 그다음에 상대를 고르면 돼.
          </p>
          {/* 🔴 저장 뒤 상대 입력·결제 확인을 자동으로 띄우지 않는다 — 나를 첫 칸에 넣어 두기까지만(스펙 §2). */}
          <BirthPromptButton
            surface={birthSurface}
            loginNext={loginNext}
            onSaved={loadProfiles}
            className="inline-block px-5 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] disabled:opacity-60"
          >
            내 생년월일 입력하기
          </BirthPromptButton>
        </div>
      </div>
    );
  }

  const slotName = (id: string | null) => {
    if (!id) return null;
    const p = profiles.find((x) => x.id === id);
    return p ? displayName(p) : null;
  };

  // 궁합은 두 사람의 사주가 필요 — 생일 없는 프로필(P2 nullable)이나 계산 못 하는 행(GET 이 saju:null 로 내려준다)이
  // 슬롯에 들어오면 확정 차단. 🔴 birthDate 만 보면 깨진 행이 통과해 /api/fortune/create 가 500 이 된다(saju 가 있으면 생일도 있다).
  const profA = slotA ? profiles.find((p) => p.id === slotA) : null;
  const profB = slotB ? profiles.find((p) => p.id === slotB) : null;
  const canConfirm =
    !!slotA && !!slotB && slotA !== slotB && !loading && !!profA?.saju && !!profB?.saju;
  // 🔴 칸에 사주가 없는 내 사주(생일 없음, 또는 계산 못 하는 생일)가 있으면 위 차단에 걸려 "궁합 보기"가 꺼진다 —
  //    그 자리에서 생일을 (다시) 받는다(BirthPromptButton 은 내 사주를 PATCH). 위 확정 게이트와 같은 saju 기준이어야
  //    "버튼은 꺼졌는데 안내는 없는" 칸이 안 생긴다(FortuneSajuPicker 의 내 사주 자리도 saju 로 가른다).
  //    지인에게 사주가 없을 땐 달지 않는다 — 버튼이 지인이 아니라 내 사주를 고친다(스펙 §5).
  const selfNeedsBirth = [profA, profB].some((p) => p?.isPrimary && !p.saju);
  // 활성 칸에 고를 사람이 없으면(내 생년월일을 막 저장한 신규 유저) 목록 자리에 큰 "+ 새 사람 입력"을 둔다.
  const nothingToPick = noOneToPick({ profiles, active, slotA, slotB });

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

      {selfNeedsBirth && (
        // 칸 버튼(<button onClick>) 밖에 둔다 — BirthPromptButton 팝업의 이벤트가 React 조상으로 버블된다.
        <div className="bg-cream-warm rounded-2xl border border-lilac-mid/30 px-4 py-4 text-center mb-5">
          <p className="text-[12px] text-text-light/80 mb-3">내 생일을 알려주면 궁합을 볼 수 있어.</p>
          <BirthPromptButton
            surface={birthSurface}
            loginNext={loginNext}
            onSaved={loadProfiles}
            className="inline-block px-4 py-2 rounded-xl bg-lilac-deep text-white font-bold text-[13px] disabled:opacity-60"
          >
            생년월일 입력하기
          </BirthPromptButton>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-bold text-eye-purple">
          {active === "A" ? "첫 번째 사람" : "두 번째 사람"} 고르기
        </p>
        {/* 고를 사람이 없을 땐 아래 큰 버튼이 같은 일을 한다 — 같은 버튼을 두 번 보이지 않는다. */}
        {!nothingToPick && (
          <button
            type="button"
            onClick={() => setShowNewPerson(true)}
            className="text-[11px] font-bold text-lilac-deep"
          >
            + 새 사람 입력
          </button>
        )}
      </div>

      {/* 프로필 목록 — 활성 칸에 고를 사람이 없으면 그 자리에 큰 "+ 새 사람 입력"(자동으로 열지는 않는다) */}
      {nothingToPick ? (
        <div className="bg-white rounded-2xl border border-dashed border-lilac-mid/50 px-4 py-5 text-center mb-3">
          <p className="text-[12px] text-text-light/80 mb-3">궁합 볼 사람을 새로 넣어줘.</p>
          <button
            type="button"
            onClick={() => setShowNewPerson(true)}
            className="inline-block px-5 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
          >
            + 새 사람 입력
          </button>
        </div>
      ) : (
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
      )}

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
          loginNext={loginNext}
          onSaved={(profile) => handleNewPersonSaved(profile as PickerProfile)}
          onClose={() => setShowNewPerson(false)}
        />
      )}
    </div>
  );
}
