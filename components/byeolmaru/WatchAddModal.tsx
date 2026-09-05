"use client";

// components/byeolmaru/WatchAddModal.tsx — "우리 오늘"에 지켜볼 상대를 담는 모달(③-a Task8).
// 두 경로: ①이미 등록된 비-self 프로필 고르기 ②새로 등록(ProfileForm 재사용). 무료 2명(WATCH_FREE_SLOTS)
// 초과분은 5별(WATCH_EXTRA_COST) 확인이 필요 — StarConfirmModal 재사용(ByeolmaruView 잔액조회 패턴 동일).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import { trackUiEvent } from "@/lib/analytics/ui-events";

interface WatchCandidate {
  id: string;
  name: string;
}

interface WatchGetResponse {
  suggestions: WatchCandidate[];
  state: { nextCost: number };
}

type Tab = "pick" | "register";
type LoadState = "loading" | "ready" | "error";

export interface WatchAddModalProps {
  onClose: () => void;
  /** 담기 성공 — 부모가 모달을 닫고 목록을 새로고침하도록 알림. */
  onAdded: (profileId: string) => void;
}

export default function WatchAddModal({ onClose, onAdded }: WatchAddModalProps) {
  const [tab, setTab] = useState<Tab>("pick");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [suggestions, setSuggestions] = useState<WatchCandidate[]>([]);
  // 다음 1명 담을 때 비용(0=무료) — GET 마운트 스냅샷. add flow 성공 시 onAdded 직후 onClose로
  // 모달이 곧장 닫혀 세션당 add는 최대 1건이라, 스냅샷을 재사용해도 staleness 문제가 없다.
  const [nextCost, setNextCost] = useState(0);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 새 등록 성공 후 상태 — 폼을 "등록 완료" 카드로 바꿔, StarConfirmModal 취소/실패 후 재제출이
  // /api/profiles 를 다시 쳐서 같은 사람을 중복 생성하는 걸 막는다(리뷰 Important). 재시도는 watch-add 만.
  const [registered, setRegistered] = useState<{ id: string; name: string } | null>(null);

  // StarConfirmModal — profileId 가 있으면 확인 팝업이 뜬다(무료 슬롯 소진 후).
  const [confirmProfileId, setConfirmProfileId] = useState<string | null>(null);
  const [confirmBalance, setConfirmBalance] = useState<number | null>(null);
  const [confirmBalanceLoading, setConfirmBalanceLoading] = useState(false);

  const busy = submitting || confirmProfileId !== null;

  // 마운트 시 후보 목록 + 다음 비용 로드
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/byeolmaru/watch", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setLoadState("error");
          return;
        }
        const data: WatchGetResponse = await res.json();
        if (cancelled) return;
        setSuggestions(data.suggestions ?? []);
        setNextCost(data.state?.nextCost ?? 0);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 배경 스크롤 잠금 — ProfileEditModal과 동일 패턴
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // ESC 닫기(제출 중엔 닫기 불가) — ProfileEditModal과 동일 패턴
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  if (typeof document === "undefined") return null;

  // 공유 담기 플로우 — 무료면 곧장 POST, 유료면 잔액을 조회해 StarConfirmModal을 띄운다.
  // 🔴 balance=null 로 넘기면 확인 버튼이 영구 disabled — ByeolmaruView handleSubscribeClick과
  // 동일하게 /api/stars/balance 로 실 잔액을 조회한다(항상 200, 비로그인/에러는 0).
  function startAddFlow(profileId: string) {
    if (busy) return;
    setError(null);
    if (nextCost > 0) {
      trackUiEvent("byeolmaru_watch_limit", { meta: { cost: nextCost } });
      setConfirmProfileId(profileId);
      setConfirmBalance(null);
      setConfirmBalanceLoading(true);
      void (async () => {
        try {
          const r = await fetch("/api/stars/balance", { cache: "no-store" });
          const d = r.ok ? await r.json() : null;
          setConfirmBalance(typeof d?.balance === "number" ? d.balance : 0);
        } catch {
          setConfirmBalance(0);
        } finally {
          setConfirmBalanceLoading(false);
        }
      })();
      return;
    }
    void submitWatch(profileId);
  }

  async function submitWatch(profileId: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/byeolmaru/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (res.status === 402) {
        window.location.href = "/shop";
        return;
      }
      if (!res.ok) {
        setError("담지 못했어. 잠시 후 다시 시도해줄래?");
        setSubmitting(false);
        setConfirmProfileId(null);
        return;
      }
      const body = await res.json().catch(() => ({} as { charged?: number }));
      trackUiEvent("byeolmaru_watch_add", { meta: { via: registered ? "register" : "pick" } });
      if (typeof body.charged === "number" && body.charged > 0) {
        trackUiEvent("byeolmaru_watch_purchase", { meta: { stars: body.charged } });
      }
      onAdded(profileId);
      onClose();
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      setSubmitting(false);
      setConfirmProfileId(null);
    }
  }

  const trimmedNewName = newName.trim();
  const newNameValid = trimmedNewName.length >= 1 && trimmedNewName.length <= 50;

  // 새로 등록 — displayName 유효성은 payload가 아니라 이 컴포넌트의 newName으로 직접 검사한다
  // (ProfileForm mode="self"는 defaultSelfName이 비어 있으면 "나"로 조용히 대체하므로
  // payload.displayName만 보면 빈 입력을 걸러낼 수 없다 — ProfileEditModal의 labelValid와 동일 이유).
  async function handleRegisterSubmit(payload: ProfilePayload) {
    if (busy) return;
    // 이미 이 세션에서 등록을 마쳤으면 재-POST 금지 — watch-add 만 재시도(중복 프로필 방지).
    if (registered) { startAddFlow(registered.id); return; }
    if (!newNameValid) {
      setError("이름을 입력해줄래?");
      return;
    }
    // /api/profiles는 optionalBirth 없이 strict 검증(생일 필수) — "생일 몰라요"로 제출하면
    // 항상 400(invalid_birth_date)이라 재시도로 해결되지 않는다. 미리 걸러 정확한 안내를 준다.
    if (!payload.birthDate) {
      setError("생일을 알아야 담을 수 있어 — 아래에서 입력해줄래?");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationType: "partner",
          displayName: payload.displayName,
          birthDate: payload.birthDate,
          birthTime: payload.birthTime,
          isLunarInput: payload.isLunarInput,
          isLeapMonth: payload.isLeapMonth,
          gender: payload.gender,
        }),
      });
      if (!res.ok) {
        setError("등록이 안 됐어. 잠시 후 다시 시도해줄래?");
        setSubmitting(false);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { profile?: { id?: string } };
      const profileId = data.profile?.id;
      if (typeof profileId !== "string") {
        setError("등록이 안 됐어. 잠시 후 다시 시도해줄래?");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      setRegistered({ id: profileId, name: trimmedNewName });
      startAddFlow(profileId);
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      setSubmitting(false);
    }
  }

  const pid = confirmProfileId; // narrowed local — StarConfirmModal 콜백 클로저용

  return createPortal(
    <div
      // z-[75] — 공용 StarConfirmModal(z-80)이 이 위에 떠야 확인 버튼을 누를 수 있다
      // (ThreadDrawModal과 동일 이유·동일 값. z-100으로 올리면 결제 확인이 이 모달 아래 깔려 클릭 불가해진다)
      className="fixed inset-0 z-[75] flex items-center justify-center bg-night/75 backdrop-blur-md animate-fade-in px-5"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md mx-auto bg-cream rounded-3xl border border-lilac-mid/30 shadow-[0_8px_32px_rgba(31,23,53,0.25)] max-h-[88vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[17px] font-bold text-eye-purple">
              누구를 담아볼까?
            </h2>
            <button
              onClick={() => !busy && onClose()}
              aria-label="닫기"
              disabled={busy}
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50 disabled:opacity-40"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTab("pick")}
              disabled={busy}
              className={`py-2.5 rounded-xl text-[14px] font-bold transition disabled:opacity-60 ${
                tab === "pick"
                  ? "bg-lilac-deep text-white"
                  : "bg-cream-warm text-text-light border border-lilac-mid/40"
              }`}
            >
              이미 아는 사람
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              disabled={busy}
              className={`py-2.5 rounded-xl text-[14px] font-bold transition disabled:opacity-60 ${
                tab === "register"
                  ? "bg-lilac-deep text-white"
                  : "bg-cream-warm text-text-light border border-lilac-mid/40"
              }`}
            >
              새로 등록
            </button>
          </div>

          {error && <p className="text-[12px] text-red-500 text-center">{error}</p>}
        </div>

        {tab === "pick" ? (
          <div className="px-5 pb-5 flex flex-col gap-2">
            {loadState === "loading" && (
              <p className="text-[13px] text-text-light text-center py-4">불러오는 중…</p>
            )}
            {loadState === "error" && (
              <p className="text-[13px] text-text-light text-center py-4">
                지금은 목록을 못 가져왔어. 잠시 후 다시 열어줄래?
              </p>
            )}
            {loadState === "ready" && suggestions.length === 0 && (
              <p className="text-[13px] text-text-light text-center py-4">
                아직 등록해둔 사람이 없어 — 새로 등록해볼까?
              </p>
            )}
            {loadState === "ready" &&
              suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => startAddFlow(s.id)}
                  disabled={busy}
                  className="w-full px-4 py-3 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] font-bold text-left hover:bg-lilac-soft/40 active:scale-[0.98] transition disabled:opacity-50"
                >
                  {s.name}
                </button>
              ))}
          </div>
        ) : registered ? (
          <div className="px-5 pb-5 flex flex-col gap-3">
            <p className="text-[14px] text-eye-purple text-center py-2">
              <span className="font-bold">{registered.name}</span> 등록 완료
            </p>
            <button
              type="button"
              onClick={() => startAddFlow(registered.id)}
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-lilac-deep text-white text-[14px] font-bold disabled:opacity-50"
            >
              우리 오늘에 담기
            </button>
            <button
              type="button"
              onClick={() => {
                setRegistered(null);
                setNewName("");
              }}
              disabled={busy}
              className="w-full py-2 text-[13px] text-text-light disabled:opacity-50"
            >
              다른 사람 등록하기
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 flex flex-col gap-2 mb-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[13px] font-bold text-eye-purple mb-1">이름</legend>
                <input
                  type="text"
                  value={newName}
                  maxLength={50}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="이름을 알려줄래?"
                  className="w-full px-3 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px]"
                />
              </fieldset>
            </div>
            <ProfileForm
              mode="self"
              extended
              defaultSelfName={trimmedNewName}
              submitLabel="이 사람 담기"
              loading={submitting || loadState === "loading"}
              onSubmit={(payload) => void handleRegisterSubmit(payload)}
            />
          </>
        )}
        <div className="h-5" />
      </div>

      {pid && (
        <StarConfirmModal
          cost={nextCost}
          balance={confirmBalance}
          loading={confirmBalanceLoading}
          accent="#E8C26A"
          title={`별 ${nextCost}개로 담을까?`}
          subtitle="우리 오늘에서 함께 지켜볼 수 있어"
          confirmLabel="담기"
          onConfirm={() => void submitWatch(pid)}
          onCharge={() => (window.location.href = "/shop")}
          onClose={() => setConfirmProfileId(null)}
        />
      )}
    </div>,
    document.body
  );
}
