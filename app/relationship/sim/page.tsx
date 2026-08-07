"use client";

// app/relationship/sim/page.tsx — 연애 시뮬레이션 몰입 라우트 스캐폴드(FE2).
// 가드(로그인·rel 파라미터·소유권) + 밤 톤 컨테이너 + phase state 골격만. 단계별 UI 는 후속 태스크(FE3~FE7)가 채운다.
// useSearchParams 는 정적 빌드 시 Suspense 경계 필수(/login, /start 와 동일 패턴 — 없으면 next build 실패).
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Phase = "select" | "stage" | "debrief";

interface RelInfo {
  id: string;
  label: string;
  status: string;
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
      // 소유권/상대 로드: 허브 목록에서 이 관계를 확인(없으면 허브로).
      const list = await fetch("/api/relationship", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const found =
        (list?.relationships ?? []).find((r: { id: string }) => r.id === relationshipId) ?? null;
      if (!found) {
        router.replace("/relationship");
        return;
      }
      setRel({ id: found.id, label: found.label, status: found.status });
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

  return (
    <main className="min-h-dvh bg-gradient-to-br from-night to-night-deep text-cream-warm">
      {/* T3: phase==="select" → <SituationSelect/> */}
      {/* T4~T6: phase==="stage" → <NightStage/> */}
      {/* T7: phase==="debrief" → <SimDebrief/> */}
      <div className="p-4 text-center text-sm text-lilac">
        시뮬 셸 (phase: {phase}) — 상대: {rel.label}
      </div>
    </main>
  );
}
