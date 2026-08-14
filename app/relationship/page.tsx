"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import PassSheet from "@/components/relationship/PassSheet";
import ProfileEditModal from "@/components/relationship/ProfileEditModal";
import AddPersonSheet from "@/components/relationship/AddPersonSheet";
import HubSwitcher from "@/components/relationship/HubSwitcher";
import ProfileCard from "@/components/relationship/ProfileCard";
import ProductList from "@/components/relationship/ProductList";
import ThreadChat, { type ThreadChatMsg } from "@/components/relationship/ThreadChat";
import ProfileDetails from "@/components/relationship/ProfileDetails";
import type { SajuResult } from "@/lib/saju/calc";
import { formatPassRemaining } from "@/lib/relationship/passDisplay";
import {
  DAILY_TURN_CAP,
  EXTEND_COST,
  EXTEND_TURNS,
  FREE_INTRO_TURNS,
  PASS_PLANS,
  PASS_PLAN_BY_KIND,
  RELATIONSHIP_SKILL_PREVIEWS,
  RELATIONSHIP_STATUS_LABELS,
  type RelationshipStatus,
} from "@/lib/relationship/types";

interface Me {
  user: { id: string; nickname: string; profile_img: string | null } | null;
  isAuthenticated: boolean;
}

// GET /api/relationship 사람 프로필 뷰(self·상대 공통).
interface PersonProfileView {
  id: string;
  displayName: string;
  birthDate: string | null;
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: "male" | "female" | "other";
  mbti: string | null;
  personality: string | null;
}

interface RelHub {
  id: string;
  label: string;
  status: RelationshipStatus;
  selfProfileId: string | null;
  partnerProfileId: string | null;
  threadReadingId: string | null;
  partner: PersonProfileView | null;
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

interface HubGet {
  relationships: RelHub[];
  selectedId: string | null;
  self: PersonProfileView | null;
  pass: PassData | null;
  daily: DailyData | null;
  messages: { role: "user" | "assistant"; content: string; created_at?: string }[];
  activeSkill: string | null;
}

const SKILL_PREVIEWS = RELATIONSHIP_SKILL_PREVIEWS;

export default function RelationshipPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [relationships, setRelationships] = useState<RelHub[]>([]);
  const [self, setSelf] = useState<PersonProfileView | null>(null);
  // 내 명식판 표시용 — /api/profiles 의 isPrimary 프로필 saju(생일 없으면 null).
  const [selfSaju, setSelfSaju] = useState<SajuResult | null>(null);
  // /api/profiles 의 프로필 id → saju 맵(상대 명식 조회용). partnerProfileId 로 lookup.
  const [profileSaju, setProfileSaju] = useState<Record<string, SajuResult | null>>({});
  // 선택 대상: "me"(나 앵커) 또는 관계 id
  const [selected, setSelected] = useState<"me" | string>("me");
  // 선택 상대의 다음 시뮬 판 자금원 — ProductList 시뮬 회수 표기용(/sim/quote).
  const [simQuote, setSimQuote] = useState<{ funding: "runway" | "hook" | "paid"; cost: number; runwayRemaining: number } | null>(null);
  // 상대 카드 아래 상세(성격·MBTI·명식) 펼침 — 상대 전환 시 접힘으로 리셋
  const [partnerExpanded, setPartnerExpanded] = useState(false);
  // 허브(스위처+프로필+상품) ↔ 스레드(대화) 뷰 토글
  const [view, setView] = useState<"hub" | "thread">("hub");
  const [pass, setPass] = useState<PassData | null>(null);
  const [daily, setDaily] = useState<DailyData | null>(null);
  const [messages, setMessages] = useState<ThreadChatMsg[]>([]);
  // 새 사람 추가 — create 등록 모달 / 슬롯 구매 시트(슬롯 필요 시만). handleAddPerson 이 분기.
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [slotSheet, setSlotSheet] = useState<{ nextCost: number } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPassSheet, setShowPassSheet] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  // 관계 전환 중 스코프드 데이터(messages/pass/daily)를 아직 못 받은 상태 — 이전 관계 값 표시 방지.
  const [selectionLoading, setSelectionLoading] = useState(false);
  // 조회 순서 토큰 — 빠른 A→B→A 전환에서 늦게 도착한 이전 응답이 최신 선택을 덮어쓰지 않도록.
  const reqTokenRef = useRef(0);
  // 무료 인트로 배너 표시용 — 이번 마운트에서 보낸 유저 턴 수. load()/refresh() 가 messages 를
  // 다시 받아오면 그 안에 이미 포함되므로 0 으로 리셋한다(이중 계산 방지).
  const [sentFreeTurns, setSentFreeTurns] = useState(0);

  // GET 응답 → 선택 관계의 pass/daily/messages/activeSkill + 목록/self 반영(선택/뷰는 건드리지 않음).
  // token 이 최신이 아니면(그 사이 새 선택이 시작됨) 응답을 버려 stale 덮어쓰기를 막는다.
  const applyGet = (rel: HubGet, token: number) => {
    if (token !== reqTokenRef.current) return;
    setRelationships(rel.relationships ?? []);
    setSelf(rel.self ?? null);
    setPass(rel.pass ?? null);
    setDaily(rel.daily ?? null);
    setMessages(
      (rel.messages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      }))
    );
    setActiveSkill(rel.activeSkill ?? null);
    setSentFreeTurns(0);
    setSelectionLoading(false);
  };

  const fetchHub = (relId?: string): Promise<HubGet | null> =>
    fetch(`/api/relationship${relId ? `?selectedId=${encodeURIComponent(relId)}` : ""}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<HubGet>) : null))
      .catch(() => null);

  const fetchBalance = () =>
    fetch("/api/stars/balance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

  // 내 명식용 — isPrimary 프로필의 saju 를 뽑아 selfSaju 로. GET /api/relationship 의 self 엔
  // SajuResult 가 없어 별도 조회한다(mypage 와 동일 소스).
  const fetchProfiles = () =>
    fetch("/api/profiles", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

  const applyProfiles = (profs: unknown) => {
    const list = (
      profs as
        | { profiles?: { id: string; isPrimary?: boolean; saju?: SajuResult | null }[] }
        | null
    )?.profiles;
    if (!Array.isArray(list)) {
      setSelfSaju(null);
      setProfileSaju({});
      return;
    }
    setSelfSaju(list.find((p) => p.isPrimary)?.saju ?? null);
    const map: Record<string, SajuResult | null> = {};
    for (const p of list) map[p.id] = p.saju ?? null;
    setProfileSaju(map);
  };

  // 초기 로드 + 하드 리로드(등록 직후) — 선택을 서버 selectedId(최근 관계)로 초기화한다.
  const load = async () => {
    const token = (reqTokenRef.current += 1);
    const [meRes, rel, bal, profs] = await Promise.all([
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
        .catch(() => null),
      fetchHub(),
      fetchBalance(),
      fetchProfiles(),
    ]);
    if (!meRes?.isAuthenticated) {
      router.replace("/login?next=/relationship");
      return;
    }
    setMe(meRes);
    if (typeof bal?.balance === "number") setBalance(bal.balance);
    if (token === reqTokenRef.current) applyProfiles(profs);
    if (rel && token === reqTokenRef.current) {
      applyGet(rel, token);
      setSelected(rel.selectedId ?? "me");
    }
    setLoading(false);
  };

  // 현재 선택을 유지한 채 데이터만 새로고침(편집 저장·패스 구매·스킬 종료 등)
  const refresh = async (sel: "me" | string = selected) => {
    const token = (reqTokenRef.current += 1);
    const relId = sel !== "me" ? sel : undefined;
    const [rel, bal, profs] = await Promise.all([fetchHub(relId), fetchBalance(), fetchProfiles()]);
    if (rel) applyGet(rel, token);
    // 조회 실패(null)여도 최신 토큰이면 로딩은 해제 — selectionLoading 이 영구히 걸리지 않도록.
    else if (token === reqTokenRef.current) setSelectionLoading(false);
    if (typeof bal?.balance === "number" && token === reqTokenRef.current) setBalance(bal.balance);
    // 내 명식 — 프로필 편집(생일 추가) 후에도 최신으로 반영.
    if (token === reqTokenRef.current) applyProfiles(profs);
  };

  // 스위처 전환 — 상대 선택 시 그 관계의 pass/daily/messages 를 재조회, 항상 허브 뷰로.
  const onSelect = async (sel: "me" | string) => {
    setSelected(sel);
    setView("hub");
    setPartnerExpanded(false);
    if (sel === "me") {
      // 나 앵커는 조회 불필요 — 진행 중이던 관계 응답을 무효화하고 로딩 해제.
      reqTokenRef.current += 1;
      setSelectionLoading(false);
      return;
    }
    // 다른 관계로 전환 — 이전 관계의 스코프드 상태를 즉시 비워 잘못된 표시를 막고(이전 messages 로
    // ThreadChat 이 seed 되는 것 포함), 새 데이터를 받아온다.
    setSelectionLoading(true);
    setMessages([]);
    setPass(null);
    setDaily(null);
    setActiveSkill(null);
    setSentFreeTurns(0);
    await refresh(sel);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 선택 상대가 바뀌면 시뮬 회수 표기용 쿼트 조회(실제 사람일 때만, me/미선택이면 null).
  useEffect(() => {
    if (selected === "me") { setSimQuote(null); return; }
    let alive = true;
    setSimQuote(null);
    fetch(`/api/relationship/sim/quote?relationshipId=${selected}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => { if (alive && q && typeof q.cost === "number") setSimQuote(q); })
      .catch(() => {});
    return () => { alive = false; };
  }, [selected]);

  // 새 사람 추가([＋]/첫 사람/등록 CTA 공통) — 슬롯 현황으로 분기. 무료면 등록 모달,
  // 슬롯 필요하면 구매 시트. 조회 실패(null)면 등록 모달로(POST 402가 방어적으로 시트를 연다).
  const handleAddPerson = async () => {
    const info = await fetch("/api/relationship/slot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (info && info.canAddFree === false) {
      setSlotSheet({ nextCost: info.nextCost });
    } else {
      setShowCreateModal(true);
    }
  };

  if (loading || !me?.user) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const meCard = { name: me.user.nickname, imageUrl: me.user.profile_img };
  const selectedRel =
    selected !== "me" ? relationships.find((r) => r.id === selected) ?? null : null;
  // 상대 명식 — /api/profiles 맵에서 partnerProfileId 로 조회(없으면 null).
  const partnerSaju = selectedRel?.partnerProfileId
    ? profileSaju[selectedRel.partnerProfileId] ?? null
    : null;
  const userTurns = messages.filter((m) => m.role === "user").length;

  // 나·상대 공통 편집 모달 — 선택 대상에서 target 파생. selectedRel 이 없으면(나 또는 알 수 없는
  // 선택) 항상 "나" 모달로 폴백해 아래 카드 렌더와 일치시킨다. 저장 후 현재 선택 유지한 채 새로고침.
  const editModal = showEditModal && (
    selectedRel ? (
      <ProfileEditModal
        target={{
          relationshipId: selectedRel.id,
          label: selectedRel.label,
          status: selectedRel.status,
        }}
        initial={{
          label: selectedRel.label,
          status: selectedRel.status,
          displayName: selectedRel.partner?.displayName,
          birthDate: selectedRel.partner?.birthDate,
          birthTime: selectedRel.partner?.birthTime,
          isLunarInput: selectedRel.partner?.isLunarInput,
          isLeapMonth: selectedRel.partner?.isLeapMonth,
          gender: selectedRel.partner?.gender,
          mbti: selectedRel.partner?.mbti,
          personality: selectedRel.partner?.personality,
        }}
        onClose={() => setShowEditModal(false)}
        onSaved={() => {
          setShowEditModal(false);
          void refresh();
        }}
      />
    ) : (
      <ProfileEditModal
        target="me"
        initial={{
          displayName: me.user.nickname,
          birthDate: self?.birthDate,
          birthTime: self?.birthTime,
          isLunarInput: self?.isLunarInput,
          isLeapMonth: self?.isLeapMonth,
          gender: self?.gender,
          mbti: self?.mbti,
          personality: self?.personality,
        }}
        onClose={() => setShowEditModal(false)}
        onSaved={() => {
          setShowEditModal(false);
          void refresh();
        }}
      />
    )
  );

  // 새 사람 추가 UI — 등록 모달(create) + 슬롯 구매 시트. [＋]/첫 사람/등록 CTA 에서만 트리거되므로
  // 허브 뷰에서만 렌더(둘 다 portal 이라 위치 무관). 등록 성공 → 방금 만든 관계를 곧장 선택·표시
  // (last_visited_at=null 이라 기본 정렬로는 최근방문 관계가 뽑혀 새 사람이 안 보이는 것 회피).
  const addPersonUI = (
    <>
      {showCreateModal && (
        <ProfileEditModal
          target={{ create: true }}
          onClose={() => setShowCreateModal(false)}
          onSaved={(newId) => {
            setShowCreateModal(false);
            if (newId) {
              setSelected(newId);
              setView("hub");
              void refresh(newId);
            } else {
              setLoading(true);
              void load();
            }
          }}
          onSlotRequired={(nextCost) => {
            setShowCreateModal(false);
            setSlotSheet({ nextCost });
          }}
        />
      )}
      {slotSheet && (
        <AddPersonSheet
          nextCost={slotSheet.nextCost}
          balance={balance ?? 0}
          onClose={() => setSlotSheet(null)}
          onGoShop={() => router.push("/shop")}
          onPurchased={async () => {
            setSlotSheet(null);
            const bal = await fetchBalance();
            if (typeof bal?.balance === "number") setBalance(bal.balance);
            setShowCreateModal(true);
          }}
        />
      )}
    </>
  );

  // 스레드 뷰 — S2(패스없음)/S3(활성)/S4(오늘 캡 도달) 실제 대화/패스 UI
  if (view === "thread" && selectedRel) {
    const relationship = selectedRel;
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
        <button
          type="button"
          onClick={() => setView("hub")}
          aria-label="뒤로"
          className="shrink-0 -ml-1 w-7 h-7 rounded-full flex items-center justify-center text-white/85 hover:bg-white/10 active:scale-95 transition"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
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

    // S2 — 활성 패스 없음. 단 무료 인트로(유저 발화 FREE_INTRO_TURNS회)가 남았으면 입력 열린 스레드로.
    // 분기 판정은 서버가 준 messages 만 본다 — sentFreeTurns(표시용)를 섞으면 마지막 턴 직후 곧바로
    // 소진 화면으로 튀면서, 아직 refresh() 하지 않은 방금 대화가 화면에서 사라진다. 실제 벽은 서버 402.
    const usedFreeTurns = userTurns; // 상단에서 이미 계산 — 재계산 방지(같은 messages 소스)
    const freeLeft = !hasPass ? Math.max(0, FREE_INTRO_TURNS - usedFreeTurns) : 0;
    // 배너는 이번 마운트에서 보낸 턴까지 반영해야 실시간으로 맞는다(1/3 → 2/3 → 3/3 → 소진 안내).
    const freeShownLeft = Math.max(0, freeLeft - sentFreeTurns);
    const freeShownTurn = Math.min(usedFreeTurns + sentFreeTurns + 1, FREE_INTRO_TURNS);

    if (!hasPass && freeLeft > 0) {
      return (
        <main
          className="flex flex-col items-stretch w-full min-h-0"
          style={{ height: "calc(100dvh - 3.5rem - 4rem - env(safe-area-inset-bottom))" }}
        >
          <div className="shrink-0 w-full max-w-md mx-auto px-5 pt-4 pb-3">
            {headerCard}
            {partnerBanner}
            <div className="mt-3 flex items-center justify-between rounded-xl border border-lilac-mid/30 bg-lilac-soft/40 px-3.5 py-2.5">
              <p className="text-[11.5px] text-eye-purple leading-snug">
                {freeShownLeft > 0 ? (
                  <>
                    💜 무료 첫 대화 <b>{freeShownTurn}/{FREE_INTRO_TURNS}턴</b> — 먼저 편하게 얘기해봐
                  </>
                ) : (
                  <>💜 무료 첫 대화를 다 썼어 — 패스를 켜면 이어서 얘기할 수 있어</>
                )}
              </p>
              <button
                type="button"
                onClick={() => setShowPassSheet(true)}
                className="shrink-0 text-[11px] font-bold text-lilac-deep active:scale-95 transition"
              >
                패스 보기 ›
              </button>
            </div>
          </div>

          <ThreadChat
            className="flex-1 min-h-0"
            relationshipId={relationship.id}
            initialMessages={messages}
            canSend={true}
            capReached={false}
            selfProfileId={relationship.selfProfileId}
            partnerProfileId={relationship.partnerProfileId}
            partnerLabel={relationship.label}
            initialActiveSkill={activeSkill}
            onPassRequired={() => void refresh()}
            onSkillDone={() => void refresh()}
            onUserTurnComplete={() => setSentFreeTurns((n) => n + 1)}
          />

          {editModal}
          {showPassSheet && (
            <PassSheet
              relationshipId={relationship.id}
              pass={null}
              daily={null}
              balance={balance ?? undefined}
              onClose={() => setShowPassSheet(false)}
              onExtended={() => void refresh()}
              onPurchased={() => {
                setShowPassSheet(false);
                void refresh();
              }}
            />
          )}
        </main>
      );
    }

    // S2 — 무료 인트로 소진 + 패스 없음: 히스토리(읽기전용) + 패스 패널이 주 CTA
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
              <p className="text-[13px] text-center mt-4 leading-relaxed font-bold text-eye-purple">
                패스를 켜면 이 대화 그대로 이어갈 수 있어
              </p>
            </div>

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

            <button
              type="button"
              onClick={() => setShowPassSheet(true)}
              className="shrink-0 mt-4 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
            >
              패스 시작하기
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
              onExtended={() => void refresh()}
              onPurchased={() => {
                setShowPassSheet(false);
                void refresh();
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
          partnerLabel={relationship.label}
          initialActiveSkill={activeSkill}
          onDailyCapReached={() => void refresh()}
          onExtended={() => void refresh()}
          onPassRequired={() => void refresh()}
          onSkillDone={() => void refresh()}
        />

        {editModal}
        {showPassSheet && (
          <PassSheet
            relationshipId={relationship.id}
            pass={pass}
            daily={daily}
            balance={balance ?? undefined}
            onClose={() => setShowPassSheet(false)}
            onExtended={() => void refresh()}
            onPurchased={() => {
              setShowPassSheet(false);
              void refresh();
            }}
          />
        )}
      </main>
    );
  }

  // 허브 뷰 — 스위처 + (프로필 카드 / 상품 목록 / 미등록 마케팅)
  return (
    <main className="flex flex-1 flex-col items-center w-full pb-20 pt-5 animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5">
        <HubSwitcher
          me={meCard}
          relationships={relationships}
          selectedId={selected}
          onSelect={(s) => void onSelect(s)}
          onAddPerson={() => void handleAddPerson()}
        />

        {relationships.length === 0 ? (
          // 미등록 — 스위처(나 + ＋첫 사람) 아래 콜드스타트 마케팅
          <div className="mt-6">
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
              onClick={() => void handleAddPerson()}
              className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
            >
              상대 등록하고 시작하기
            </button>
          </div>
        ) : selectedRel ? (
          <>
            <ProfileCard
              target={selectedRel}
              me={meCard}
              onEdit={() => setShowEditModal(true)}
            />
            {/* 상대 정보 펼치기 — 카드 아래, 카드와 같은 전체폭 버튼 */}
            <button
              type="button"
              onClick={() => setPartnerExpanded((v) => !v)}
              aria-expanded={partnerExpanded}
              className="w-full mt-2 py-2.5 rounded-xl border border-lilac-mid/30 bg-white/70 text-[12px] font-bold text-lilac-deep active:scale-[0.99] transition flex items-center justify-center gap-1"
            >
              {partnerExpanded ? "상대 정보 접기" : "상대 정보 펼치기"}
              <span aria-hidden>{partnerExpanded ? "▾" : "▸"}</span>
            </button>
            {partnerExpanded && (
              <ProfileDetails
                saju={partnerSaju}
                mbti={selectedRel.partner?.mbti ?? null}
                personality={selectedRel.partner?.personality ?? null}
              />
            )}
            <div className="h-px bg-lilac-mid/20 my-5" />
            <p className="text-[13px] font-bold text-eye-purple mb-2 px-0.5">우리 사이 체크하기</p>
            <ProductList
              onOpenThread={() => {
                if (!selectionLoading) setView("thread");
              }}
              onOpenSim={() => {
                if (!selectionLoading && selected !== "me") router.push(`/relationship/sim?rel=${selected}`);
              }}
              simQuote={simQuote}
            />
          </>
        ) : (
          // 나 앵커 선택 — 그리고 selected 가 목록에 없는(예: 삭제된) id 인 경우의 폴백.
          <>
            <ProfileCard
              target="me"
              me={meCard}
              onEdit={() => setShowEditModal(true)}
            />
            <ProfileDetails
              saju={selfSaju}
              mbti={self?.mbti ?? null}
              personality={self?.personality ?? null}
              mine
            />
          </>
        )}
      </div>

      {editModal}
      {addPersonUI}
    </main>
  );
}
