"use client";

// app/relationship/sim/page.tsx — 연애 시뮬레이션 몰입 라우트 스캐폴드(FE2).
// 가드(로그인·rel 파라미터·소유권) + 밤 톤 컨테이너 + phase state 골격만. 단계별 UI 는 후속 태스크(FE3~FE7)가 채운다.
// useSearchParams 는 정적 빌드 시 Suspense 경계 필수(/login, /start 와 동일 패턴 — 없으면 next build 실패).
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SituationSelect from "@/components/relationship/sim/SituationSelect";
import NightStage from "@/components/relationship/sim/NightStage";
import SimDebrief from "@/components/relationship/sim/SimDebrief";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import { SIM_COST, type RelationshipStatus } from "@/lib/relationship/types";

type Phase = "select" | "stage" | "debrief";

interface RelInfo {
  id: string;
  label: string;
  status: string;
}

interface PendingPick {
  situationId: string;
  userContext: string;
}

// FE4 세션 생성 성공 결과 — FE5 가 NightStage 프레임 고지 등에 소비.
interface SimSession {
  simReadingId: string;
  frame: string;
  statusLabel: string;
}

export default function SimPage() {
  return (
    <Suspense fallback={null}>
      <SimPageInner />
    </Suspense>
  );
}

function SimPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const relationshipId = params.get("rel");
  const simReadingParam = params.get("sim");
  const [phase, setPhase] = useState<Phase>("select");
  const [loading, setLoading] = useState(true);
  const [rel, setRel] = useState<RelInfo | null>(null);
  const [noProfile, setNoProfile] = useState(false); // 프로필 없는 상대 = 시뮬 진입 불가
  const [pending, setPending] = useState<PendingPick | null>(null);
  // FE4: 결제 확인 진행 중 로딩 + 세션 생성 결과(스테이지 진입용) + 별 잔액(모달 표시용).
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState<SimSession | null>(null);
  const [balance, setBalance] = useState(0);
  // 재진입(?sim=) 로드분 — 이전 대화 시드 · 완료 디브리핑 프리로드 · 읽기전용 여부.
  const [initialMessages, setInitialMessages] = useState<{ who: "user" | "doll" | "note"; text: string }[] | null>(null);
  const [loadedDebrief, setLoadedDebrief] = useState<{ debrief: string; sendMessage: string | null; portrait: string } | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  // 진입 시 쿼트(다음 판 자금원·비용) — 정직한 가격 표기용(무료 런웨이/훅 vs 유료).
  const [quote, setQuote] = useState<{ funding: "runway" | "hook" | "paid"; cost: number; runwayRemaining: number } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (!me?.isAuthenticated) {
        router.replace(`/login?next=/relationship/sim?rel=${relationshipId ?? ""}`);
        return;
      }
      // ── 재진입(?sim=): 기존 판 로드 → phase 로 분기(차감 없음) ──
      if (simReadingParam) {
        const data = await fetch(`/api/relationship/sim?id=${simReadingParam}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (!data?.simReadingId) {
          router.replace("/relationship");
          return;
        }
        setRel({ id: data.relationshipId, label: data.label, status: data.status });
        setSession({ simReadingId: data.simReadingId, frame: data.frame, statusLabel: data.statusLabel });
        setInitialMessages(Array.isArray(data.messages) ? data.messages : []);
        if (data.phase === "debriefed") {
          setReadOnly(true);
          setLoadedDebrief({ debrief: data.debrief ?? "", sendMessage: data.sendMessage ?? null, portrait: data.portrait ?? "" });
        }
        setPhase("stage");
        setLoading(false);
        return;
      }
      if (!relationshipId) {
        router.replace("/relationship");
        return;
      }
      // 소유권/상대 로드(허브 목록에서 확인) + 별 잔액(FE4 결제 확인 모달용) + 쿼트(다음 판 자금원) 병렬 조회.
      const [list, bal, q] = await Promise.all([
        fetch("/api/relationship", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/stars/balance", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(`/api/relationship/sim/quote?relationshipId=${relationshipId}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      const found =
        (list?.relationships ?? []).find((r: { id: string }) => r.id === relationshipId) ?? null;
      if (!found) {
        router.replace("/relationship");
        return;
      }
      // 프로필 없는 상대는 시뮬 진입 불가(인형이 프로필로 빚어짐) — 안내 화면.
      if (!(found as { partnerProfileId?: string | null }).partnerProfileId) {
        setNoProfile(true);
        setLoading(false);
        return;
      }
      setRel({ id: found.id, label: found.label, status: found.status });
      setBalance(typeof bal?.balance === "number" ? bal.balance : 0);
      setQuote(q && typeof q.cost === "number" ? q : { funding: "paid", cost: SIM_COST, runwayRemaining: 0 });
      setLoading(false);
    })();
  }, [relationshipId, simReadingParam, router]);

  if (noProfile) {
    return (
      <main className="min-h-dvh bg-gradient-to-br from-night to-night-deep flex flex-col items-center justify-center gap-4 px-8 text-center text-cream-warm">
        <p className="text-[15px] leading-relaxed">
          이 상대는 아직 프로필이 없어 시뮬레이션을 시작할 수 없어.
          <br />먼저 상대 프로필을 등록해줘.
        </p>
        <button
          onClick={() => router.replace("/relationship")}
          className="rounded-xl px-5 py-2.5 bg-gold text-night-deep font-bold text-sm"
        >
          파일로 돌아가기
        </button>
      </main>
    );
  }

  if (loading || !rel) {
    return (
      <main className="min-h-dvh bg-gradient-to-br from-night to-night-deep flex items-center justify-center">
        <span className="inline-block w-5 h-5 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
      </main>
    );
  }

  // FE4: 판 고정가(SIM_COST) 차감 + 시뮬 세션 생성. 잔액 부족(402)은 상점으로.
  async function createSession() {
    if (!pending || !rel) return;
    setCreating(true);
    const res = await fetch("/api/relationship/sim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relationshipId: rel.id,
        situationId: pending.situationId,
        userContext: pending.userContext,
      }),
    });
    if (res.status === 402) {
      setCreating(false);
      router.push("/shop?reason=sim");
      return;
    }
    if (!res.ok) {
      setCreating(false);
      return; // TODO: 에러 토스트(후속)
    }
    const data = await res.json();
    setSession({ simReadingId: data.simReadingId, frame: data.frame, statusLabel: data.statusLabel });
    setBalance(typeof data.balance === "number" ? data.balance : balance);
    setPending(null);
    setCreating(false);
    setQuote(null);
    setPhase("stage");
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-night to-night-deep text-cream-warm">
      {/* 배경은 다른 화면처럼 full, 콘텐츠는 max-w-md 중앙 컬럼(데스크톱 full-width 방지). */}
      <div className="max-w-md mx-auto">
        {phase === "select" && (
          <SituationSelect
            status={rel.status as RelationshipStatus}
            partnerLabel={rel.label}
            onClose={() => router.replace("/relationship")}
            onPick={(situationId, userContext) => setPending({ situationId, userContext })}
          />
        )}
        {phase === "stage" && session && (
          <NightStage
            simReadingId={session.simReadingId}
            status={rel.status as RelationshipStatus}
            label={rel.label}
            frame={session.frame}
            balance={balance}
            initialMessages={initialMessages ?? undefined}
            readOnly={readOnly}
            onDebrief={() => setPhase("debrief")}
          />
        )}
        {phase === "debrief" && session && (
          <SimDebrief
            simReadingId={session.simReadingId}
            initialDebrief={loadedDebrief?.debrief}
            initialSendMessage={loadedDebrief?.sendMessage}
            initialPortrait={loadedDebrief?.portrait}
          />
        )}
      </div>

      {pending && quote && (
        quote.funding === "paid" ? (
          <StarConfirmModal
            cost={quote.cost}
            balance={balance}
            loading={creating}
            accent="#9F8AD0"
            title="연애 시뮬레이션 한 판"
            subtitle="연습 + 별콩이 코칭 + 디브리핑까지 포함"
            confirmLabel="시작하기"
            onConfirm={createSession}
            onCharge={() => router.push("/shop?reason=sim")}
            onClose={() => setPending(null)}
          />
        ) : (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setPending(null)}>
            <div className="w-full max-w-sm rounded-2xl bg-cream-warm p-5 text-eye-purple" onClick={(e) => e.stopPropagation()}>
              <div className="text-center">
                <div className="text-lg font-display mb-1">🎁 이번 판은 무료야</div>
                <p className="text-[13px] text-text-light mb-4">
                  {quote.funding === "runway"
                    ? `무료로 즐기는 판이야 (남은 무료 ${quote.runwayRemaining}판). 편하게 걔 인형을 만나봐.`
                    : "이번 주 돌아온 김에 주는 무료 판이야. 초상화를 더 채워보자."}
                </p>
                <button disabled={creating} onClick={createSession} className="w-full rounded-xl py-3 bg-lilac-deep text-white font-bold disabled:opacity-40">
                  {creating ? "여는 중…" : "무료로 시작하기"}
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </main>
  );
}
