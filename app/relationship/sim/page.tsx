"use client";

// app/relationship/sim/page.tsx — 연애 시뮬레이션 몰입 라우트 스캐폴드(FE2).
// 가드(로그인·rel 파라미터·소유권) + 밤 톤 컨테이너 + phase state 골격만. 단계별 UI 는 후속 태스크(FE3~FE7)가 채운다.
// useSearchParams 는 정적 빌드 시 Suspense 경계 필수(/login, /start 와 동일 패턴 — 없으면 next build 실패).
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SituationSelect from "@/components/relationship/sim/SituationSelect";
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
  const [phase, setPhase] = useState<Phase>("select");
  const [loading, setLoading] = useState(true);
  const [rel, setRel] = useState<RelInfo | null>(null);
  const [pending, setPending] = useState<PendingPick | null>(null);
  // FE4: 결제 확인 진행 중 로딩 + 세션 생성 결과(스테이지 진입용) + 별 잔액(모달 표시용).
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState<SimSession | null>(null);
  const [balance, setBalance] = useState(0);
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
      if (!relationshipId) {
        router.replace("/relationship");
        return;
      }
      // 소유권/상대 로드(허브 목록에서 확인) + 별 잔액(FE4 결제 확인 모달용) 병렬 조회.
      const [list, bal] = await Promise.all([
        fetch("/api/relationship", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/stars/balance", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      const found =
        (list?.relationships ?? []).find((r: { id: string }) => r.id === relationshipId) ?? null;
      if (!found) {
        router.replace("/relationship");
        return;
      }
      setRel({ id: found.id, label: found.label, status: found.status });
      setBalance(typeof bal?.balance === "number" ? bal.balance : 0);
      setLoading(false);
    })();
  }, [relationshipId, router]);

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
    setPhase("stage");
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-night to-night-deep text-cream-warm">
      {phase === "select" && (
        <SituationSelect
          status={rel.status as RelationshipStatus}
          partnerLabel={rel.label}
          onClose={() => router.replace("/relationship")}
          onPick={(situationId, userContext) => setPending({ situationId, userContext })}
        />
      )}
      {/* T5~T6: phase==="stage" → <NightStage/>(FE5). 세션 생성 확인용 임시 표시. */}
      {phase === "stage" && (
        <div className="p-4 text-cream-warm">무대 진입 — {session?.statusLabel} (FE5)</div>
      )}
      {/* T7: phase==="debrief" → <SimDebrief/> */}

      {pending && (
        <StarConfirmModal
          cost={SIM_COST}
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
      )}
    </main>
  );
}
