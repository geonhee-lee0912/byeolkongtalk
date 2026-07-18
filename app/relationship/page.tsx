"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import RegisterOnboarding from "@/components/relationship/RegisterOnboarding";
import {
  DAILY_TURN_CAP,
  EXTEND_COST,
  EXTEND_TURNS,
  PASS_PLANS,
  RELATIONSHIP_STATUS_LABELS,
  type RelationshipStatus,
} from "@/lib/relationship/types";

interface Me {
  isAuthenticated: boolean;
}

interface RelationshipData {
  id: string;
  label: string;
  status: RelationshipStatus;
  selfProfileId: string | null;
  partnerProfileId: string | null;
  threadReadingId: string | null;
  memo: unknown;
}

const SKILL_PREVIEWS = [
  {
    emoji: "💬",
    label: "관계 체크인",
    tagline: "두 사람의 상태와 서로의 필요를 나란히",
  },
  {
    emoji: "🔍",
    label: "걔 속마음",
    tagline: "겉모습 뒤의 진짜 속마음까지",
  },
  {
    emoji: "💞",
    label: "우리 궁합",
    tagline: "두 사람 사주로 보는 궁합",
  },
  {
    emoji: "⚖️",
    label: "싸움 잘잘못 판정",
    tagline: "양쪽 입장을 듣고 비율로 판정 + 화해 처방",
  },
];

export default function RelationshipPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [relationship, setRelationship] = useState<RelationshipData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const load = async () => {
    const [me, rel] = await Promise.all([
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
        .catch(() => null),
      fetch("/api/relationship", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    if (!me?.isAuthenticated) {
      router.replace("/login?next=/relationship");
      return;
    }
    setRelationship((rel?.relationship as RelationshipData | null) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegistered = () => {
    setShowOnboarding(false);
    setLoading(true);
    void load();
  };

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  // 등록됨 — S2~S4 실제 스레드/패스 UI는 Stage 2b에서. 지금은 헤더 + 준비중 placeholder만.
  if (relationship) {
    return (
      <main className="flex flex-1 flex-col items-center w-full pb-20 pt-8 animate-fade-in">
        <div className="w-full max-w-md mx-auto px-5">
          <div className="bg-gradient-to-br from-eye-purple via-lilac-deep to-eye-purple rounded-2xl p-5 shadow-lg shadow-lilac-deep/30 text-center">
            <p className="text-[12px] text-white/70 mb-1">우리 사이</p>
            <h1 className="text-[22px] font-bold text-white">{relationship.label}</h1>
            <p className="mt-2 inline-block text-[12px] font-bold text-gold-soft bg-white/10 rounded-full px-3 py-1">
              {RELATIONSHIP_STATUS_LABELS[relationship.status]}
            </p>
          </div>

          <div className="mt-5 bg-cream-warm rounded-2xl p-6 border border-lilac-mid/20 text-center">
            <p className="text-[14px] text-eye-purple font-bold mb-1.5">
              준비 중이야
            </p>
            <p className="text-[13px] text-text-light leading-relaxed">
              곧 별콩이랑 대화할 수 있어 — 조금만 기다려줘.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // 미등록 — S1 콜드스타트
  return (
    <main className="flex flex-1 flex-col items-center w-full pb-20 pt-8 animate-fade-in">
      <div className="w-full max-w-md mx-auto">
        {showOnboarding ? (
          <RegisterOnboarding
            onRegistered={handleRegistered}
            onCancel={() => setShowOnboarding(false)}
          />
        ) : (
          <div className="px-5">
            {/* 히어로 */}
            <div className="flex flex-col items-center text-center mb-7">
              <div className="relative w-[110px] h-[110px] mb-3 animate-float">
                <Image
                  src="/byeolkong-listen.png"
                  alt="별콩이"
                  fill
                  sizes="110px"
                  priority
                  className="object-contain"
                />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-lilac-soft/70 px-3 py-1 text-[11px] font-bold text-lilac-deep mb-3">
                <span aria-hidden style={{ color: "#E48BA0" }}>
                  ♥
                </span>
                우리 사이
              </span>
              <h1 className="font-display text-[22px] text-eye-purple leading-snug">
                너의 연애, 별콩이랑
                <br />
                계속 이야기하자
              </h1>
              <p className="mt-3 text-[13px] text-text-light leading-relaxed">
                한 번 보고 끝나는 상담이 아니야.
                <br />
                상대를 등록하면 별콩이랑{" "}
                <b className="text-eye-purple">언제든 이어서 대화</b>할 수 있어 —
                지난 얘기를 다 기억하니까 매번 처음부터 말 안 해도 돼.
              </p>
            </div>

            {/* 무엇을 할 수 있나 — 핵심은 지속 대화, 스킬은 부가 */}
            <div className="mb-7">
              <p className="text-[13px] font-bold text-eye-purple mb-3 px-1">
                이런 걸 할 수 있어
              </p>
              {/* 핵심 — 지속 대화 */}
              <div className="rounded-2xl p-4 border border-lilac-mid/40 bg-gradient-to-br from-lilac-soft/60 to-cream-warm mb-3">
                <div className="flex items-start gap-2.5">
                  <span className="text-[24px] leading-none" aria-hidden>
                    💬
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-eye-purple leading-snug">
                      별콩이와 연애 상담 대화
                    </p>
                    <p className="text-[11.5px] text-text-light mt-1 leading-relaxed">
                      지금 이 마음, 언제든 별콩이랑 편하게 이야기해. 매번 처음부터
                      설명 안 해도 — 지난 대화를 다 기억하고 이어가.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-[11.5px] text-text-light/80 mb-2 px-1">
                여기에 더해, 이런 것도 꺼내 쓸 수 있어
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {SKILL_PREVIEWS.map((s) => (
                  <div
                    key={s.label}
                    className="bg-white/90 rounded-2xl p-3.5 border border-lilac-soft"
                  >
                    <div className="text-[22px] mb-1.5" aria-hidden>
                      {s.emoji}
                    </div>
                    <p className="text-[13px] font-bold text-eye-purple leading-snug">
                      {s.label}
                    </p>
                    <p className="text-[11px] text-text-light mt-1 leading-snug">
                      {s.tagline}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 패스 가격 */}
            <div className="mb-4">
              <p className="text-[13px] font-bold text-eye-purple mb-3 px-1">
                이용권 안내
              </p>
              <div className="flex flex-col gap-2">
                {PASS_PLANS.map((p) => (
                  <div
                    key={p.kind}
                    className="flex items-center justify-between rounded-2xl px-4 py-3 border border-lilac-mid/30 bg-white/80"
                  >
                    <span className="text-[14px] font-bold text-eye-purple">
                      {p.label}
                    </span>
                    <span className="text-[14px] font-bold text-lilac-deep">
                      ⭐ {p.cost}별
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 하루 대화 한도 — 또렷하게 (연장 무제한 명시 · 환불 분쟁 방지) */}
            <div className="mb-7 rounded-2xl border border-gold/60 bg-gold-soft/20 p-4">
              <p className="text-[13.5px] font-bold text-eye-purple flex items-center gap-1.5">
                <span aria-hidden>📌</span> 하루에 얼마나 대화할 수 있어?
              </p>
              <p className="mt-2 text-[12.5px] text-eye-purple/90 leading-relaxed">
                패스가 있는 동안 하루 <b>{DAILY_TURN_CAP}번</b>은 그냥 주고받을 수
                있어. 한 번에 여러 문장씩이라 대략 <b>4천~8천 자</b> 분량 — 웬만한
                고민 하나는 그날 깊이 풀어낼 양이야.
              </p>
              <p className="mt-1.5 text-[11.5px] text-text-light leading-relaxed">
                {DAILY_TURN_CAP}번을 다 써도 {EXTEND_COST}별마다 대화{" "}
                {EXTEND_TURNS}번씩{" "}
                <b className="text-eye-purple/80">횟수 제한 없이</b> 더 이어갈 수
                있고, 매일 자정엔 {DAILY_TURN_CAP}번이 다시 채워져.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowOnboarding(true)}
              className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
            >
              상대 등록하고 시작하기
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
