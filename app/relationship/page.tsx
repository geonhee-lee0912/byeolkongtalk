"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import RegisterOnboarding from "@/components/relationship/RegisterOnboarding";
import PassSheet from "@/components/relationship/PassSheet";
import RelationshipEditModal from "@/components/relationship/RelationshipEditModal";
import ThreadChat, { type ThreadChatMsg } from "@/components/relationship/ThreadChat";
import { formatPassRemaining } from "@/lib/relationship/passDisplay";
import {
  DAILY_TURN_CAP,
  EXTEND_COST,
  EXTEND_TURNS,
  PASS_PLANS,
  PASS_PLAN_BY_KIND,
  RELATIONSHIP_SKILL_PREVIEWS,
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

interface PassData {
  kind: string;
  expiresAt: string;
}

interface DailyData {
  used: number;
  allowance: number;
  extendCount: number;
}

const SKILL_PREVIEWS = RELATIONSHIP_SKILL_PREVIEWS;

export default function RelationshipPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [relationship, setRelationship] = useState<RelationshipData | null>(null);
  const [pass, setPass] = useState<PassData | null>(null);
  const [daily, setDaily] = useState<DailyData | null>(null);
  const [messages, setMessages] = useState<ThreadChatMsg[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPassSheet, setShowPassSheet] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  const load = async () => {
    const [me, rel, bal] = await Promise.all([
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
        .catch(() => null),
      fetch("/api/relationship", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/stars/balance", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    if (!me?.isAuthenticated) {
      router.replace("/login?next=/relationship");
      return;
    }
    setRelationship((rel?.relationship as RelationshipData | null) ?? null);
    setPass((rel?.pass as PassData | null) ?? null);
    setDaily((rel?.daily as DailyData | null) ?? null);
    setMessages(
      (
        (rel?.messages as
          | { role: "user" | "assistant"; content: string; created_at?: string }[]
          | undefined) ?? []
      ).map((m) => ({ role: m.role, content: m.content, createdAt: m.created_at }))
    );
    setBalance(typeof bal?.balance === "number" ? bal.balance : null);
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

  // 등록됨 — S2(패스없음)/S3(활성)/S4(오늘 캡 도달) 실제 스레드/패스 UI
  if (relationship) {
    const hasPass = !!pass;
    const capReached = !!daily && daily.used >= daily.allowance;
    const showPartnerBanner = relationship.partnerProfileId === null;

    const planDays = pass ? PASS_PLAN_BY_KIND[pass.kind as keyof typeof PASS_PLAN_BY_KIND]?.days ?? 0 : 0;
    const passStatus =
      pass && planDays
        ? formatPassRemaining(new Date(pass.expiresAt).getTime(), planDays, Date.now())
        : null;

    const headerCard = (
      <div
        className="rounded-2xl px-3.5 h-[64px] border border-lilac-mid/20 shadow-sm flex items-center gap-2.5"
        style={{ background: "linear-gradient(135deg, #2A1F4D 0%, #1F1735 100%)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[10.5px] text-white leading-none">
            <span>{RELATIONSHIP_STATUS_LABELS[relationship.status]}</span>
            <span aria-hidden style={{ color: "#F4A6C0" }}>❤</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[14px] text-white">
            <span className="font-bold truncate">{relationship.label}</span>
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              aria-label="관계 정보 수정"
              className="shrink-0 w-6 h-6 mt-[1px] rounded-full flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>
        </div>
        <span className="flex-1" />
        {passStatus && (
          <button
            type="button"
            onClick={() => setShowPassSheet(true)}
            className="shrink-0 whitespace-nowrap text-[11px] active:scale-95 transition"
          >
            <span className="font-bold text-white">{passStatus}</span>
            <span className="mx-1.5 text-white/30">|</span>
            <span className="font-bold text-gold-soft">패스권 구매</span>
            <span className="ml-0.5 text-white/50">›</span>
          </button>
        )}
      </div>
    );

    const partnerBanner = showPartnerBanner && (
      <button
        type="button"
        onClick={() => setShowEditModal(true)}
        className="mt-3 w-full flex items-center gap-2 rounded-xl border border-gold/50 bg-gold-soft/20 px-3.5 py-2.5 text-left hover:bg-gold-soft/30 active:scale-[0.99] transition"
      >
        <span className="text-[13px] shrink-0" aria-hidden>
          💡
        </span>
        <p className="text-[11.5px] text-eye-purple leading-snug">
          상대 생년월일이 없어 — 궁합 볼 때 필요해
        </p>
      </button>
    );

    const editModal = showEditModal && (
      <RelationshipEditModal
        currentLabel={relationship.label}
        currentStatus={relationship.status}
        onClose={() => setShowEditModal(false)}
        onSaved={() => {
          setShowEditModal(false);
          void load();
        }}
      />
    );

    // S2 — 활성 패스 없음: 히스토리(있으면 읽기전용) + 패스 패널이 주 CTA
    if (!hasPass) {
      return (
        <main
          className="flex flex-col items-stretch w-full min-h-0 animate-fade-in"
          style={{ height: "calc(100dvh - 3.5rem - 4rem - env(safe-area-inset-bottom))" }}
        >
          <div className="flex flex-col flex-1 min-h-0 w-full max-w-md mx-auto px-5 pt-4 pb-4">
            <div className="shrink-0">
              {headerCard}
              {partnerBanner}
              <p
                className={`text-[13px] text-center mt-4 leading-relaxed ${
                  messages.length === 0 ? "text-text-light" : "font-bold text-eye-purple"
                }`}
              >
                {messages.length === 0
                  ? "아직 별콩이랑 나눈 얘기가 없어 — 패스를 시작하면 바로 이야기할 수 있어."
                  : "패스가 만료됐어, 다시 이어가자"}
              </p>
            </div>

            {messages.length > 0 ? (
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hover rounded-2xl border border-lilac-mid/20 bg-cream-warm/50 mt-4">
                <ThreadChat
                  relationshipId={relationship.id}
                  initialMessages={messages}
                  canSend={false}
                  capReached={false}
                  selfProfileId={relationship.selfProfileId}
                  partnerProfileId={relationship.partnerProfileId}
                />
              </div>
            ) : (
              <div className="flex-1" />
            )}

            <button
              type="button"
              onClick={() => setShowPassSheet(true)}
              className="shrink-0 mt-4 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
            >
              {messages.length > 0 ? "패스 연장하기" : "패스 시작하기"}
            </button>
          </div>
          {editModal}
          {showPassSheet && (
            <PassSheet
              relationshipId={relationship.id}
              pass={null}
              daily={null}
              balance={balance ?? undefined}
              onClose={() => setShowPassSheet(false)}
              onExtended={() => void load()}
              onPurchased={() => {
                setShowPassSheet(false);
                void load();
              }}
            />
          )}
        </main>
      );
    }

    // S3(입력 가능) / S4(오늘 캡 도달 — 연장 칩) — 상단 컨텍스트는 고정, 대화는 내부 스크롤
    return (
      <main
        className="flex flex-col items-stretch w-full min-h-0"
        style={{
          height: "calc(100dvh - 3.5rem - 4rem - env(safe-area-inset-bottom))",
        }}
      >
        <div className="shrink-0 w-full max-w-md mx-auto px-5 pt-4 pb-5">
          {headerCard}
          {partnerBanner}
        </div>

        <ThreadChat
          className="flex-1 min-h-0"
          relationshipId={relationship.id}
          initialMessages={messages}
          canSend={!capReached}
          capReached={capReached}
          selfProfileId={relationship.selfProfileId}
          partnerProfileId={relationship.partnerProfileId}
          onDailyCapReached={() => void load()}
          onExtended={() => void load()}
          onPassRequired={() => void load()}
        />

        {editModal}
        {showPassSheet && (
          <PassSheet
            relationshipId={relationship.id}
            pass={pass}
            daily={daily}
            balance={balance ?? undefined}
            onClose={() => setShowPassSheet(false)}
            onExtended={() => void load()}
            onPurchased={() => {
              setShowPassSheet(false);
              void load();
            }}
          />
        )}
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
                연애 상담
              </span>
              <h1 className="font-display text-[22px] text-eye-purple leading-snug">
                너의 연애, 별콩이랑
                <br />
                계속 이야기하자
              </h1>
              <p className="mt-3 text-[13px] text-text-light leading-relaxed">
                한 번 보고 끝나는 상담이 아니야. 상대를 등록하면 별콩이랑 언제든 이어서
                대화할 수 있어, 지난 얘기를 다 기억하니까.
              </p>
            </div>

            {/* 무엇을 할 수 있나 — 핵심은 지속 대화, 스킬은 부가 */}
            <div className="mb-7">
              <p className="text-[13px] font-bold text-eye-purple mb-3 px-1">
                별콩이는 이런 친구야
              </p>
              {/* 핵심 — 지속 대화 */}
              <div className="rounded-2xl p-4 border border-lilac-mid/40 bg-gradient-to-br from-lilac-soft/60 to-cream-warm mb-3">
                <div className="flex items-start gap-2.5">
                  <span className="text-[24px] leading-none" aria-hidden>💜</span>
                  <div>
                    <p className="text-[14px] font-bold text-eye-purple leading-snug">
                      너만의 연애 상담 친구
                    </p>
                    <p className="text-[11.5px] text-text-light mt-1 leading-relaxed">
                      설레는 것도, 서운한 것도, 어떻게 해야 할지 모를 때도 그냥 편하게
                      털어놔. 별콩이가 네 편에서 같이 고민해줄게.
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
              <p className="text-[13px] font-bold text-eye-purple mb-2 px-1">이용권</p>
              <div className="rounded-2xl border border-lilac-mid/30 bg-white/70 p-4">
                <p className="text-[12.5px] text-text-light leading-relaxed mb-2.5">
                  패스를 켜 두면 그 기간 동안 매일 별콩이랑 연애 상담을 이어갈 수 있어.
                </p>
                <p className="text-[13px] font-bold text-eye-purple text-center">
                  {PASS_PLANS.map((p) => `${p.label} ⭐${p.cost}`).join("  ·  ")}
                </p>
              </div>
            </div>

            {/* 하루 대화 한도 — 또렷하게 (연장 무제한 명시 · 환불 분쟁 방지) */}
            <div className="mb-7 rounded-2xl border border-gold/60 bg-gold-soft/20 p-4">
              <p className="text-[13.5px] font-bold text-eye-purple flex items-center gap-1.5">
                <span aria-hidden>📌</span> 하루에 얼마나 대화할 수 있어?
              </p>
              <p className="mt-2 text-[12.5px] text-eye-purple/90 leading-relaxed">
                패스가 있는 동안 하루 <b>대략 {DAILY_TURN_CAP}번</b>(4천~8천 자쯤) 주고받을
                수 있어. 웬만한 고민 하나는 그날 깊이 풀 양이야.
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
