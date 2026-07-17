"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SajuIdentityRow, { sajuCaption } from "@/components/saju/SajuIdentityRow";
import ChatBubble from "@/components/saju/ChatBubble";
import SafetyBanner from "@/components/safety/SafetyBanner";
import RecoInlineCard from "@/components/reco/RecoInlineCard";
import RecoConfirmModal from "@/components/reco/RecoConfirmModal";
import type { SajuResult } from "@/lib/saju/calc";
import type { SensitiveCategory } from "@/lib/sensitive";
import { stripRecoMarkers, parseRecoMarker, INCHAT_ONLY_PRODUCTS, RECO_MARKER_REGEX, type RecoProduct } from "@/lib/reco-utils";
import { setRecoSessionStorage } from "@/lib/reco-nav";
import ExtendChip, { type ExtendChipState } from "@/components/upsell/ExtendChip";
import RechargeSheet from "@/components/upsell/RechargeSheet";

interface Message {
  role: "user" | "assistant";
  content: string;
  /** 클라 전용 부재/출구 멘트 — DB 저장 X, API 히스토리 전송에서 제외 */
  ephemeral?: boolean;
}

interface ReadingProfile {
  displayName: string;
  relationType: string;
  birthDate: string;
  birthTime: string | null;
}

interface CurrentReading {
  readingId: string;
  saju: SajuResult;
  question: string;
  /** 표시용 — 구버전 세션 핸드오프엔 없을 수 있음 */
  profile?: ReadingProfile;
}

const RELATION_LABEL: Record<string, string> = {
  family: "가족",
  friend: "친구",
  partner: "연인",
  other: "기타",
};

const END_MARKER = /\[END\]\s*$/;
// 미완성 마커 ([E, [EN, [END, [RECO:, [RECO:saju 등) 스트리밍 중 깜빡임 방지
const TRAILING_PARTIAL = /\[(?:E(?:N(?:D)?)?|R(?:E(?:C(?:O(?::[a-z0-9_:]*)?)?)?)?)?]?\s*$/;
// W3 출구 nudge — 수렴 이후 무응답 60초에 "마무리하고 결과 보기" 제안 (로컬 멘트, API 호출 X)
const IDLE_EXIT_MS = 60000;
const EXIT_NUDGE = [
  "오늘은 여기까지 해도 충분해. 지금까지 나눈 얘기, 결과 카드로 만들어둘게 — 보고 갈래?",
  "마음 가는 만큼만 하면 돼. 오늘 얘기는 결과 카드로 정리해둘 수 있어 — 마무리하고 볼래?",
];
const FINISH_PHRASE = "대화 마무리할게"; // 하단 골드 버튼 경유
const FINISH_PHRASE_EXIT = "오늘은 여기서 마무리할게"; // 출구 칩 경유 (계측 구분용)

export default function ReadingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-5">
          <p className="text-text-light text-sm">잠시만…</p>
        </main>
      }
    >
      <ReadingInner />
    </Suspense>
  );
}

function ReadingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("id");
  const [ctx, setCtx] = useState<CurrentReading | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSajuBoard, setShowSajuBoard] = useState(true);
  const [safety, setSafety] = useState<{
    category: SensitiveCategory;
    severity: number;
  } | null>(null);
  // 인챗 추천 카드 — product별 각 1개. cross-type은 RecoInlineCard, inchat 전용은 칩.
  const [recoAttach, setRecoAttach] = useState<Partial<Record<RecoProduct, number>>>({});
  const [recoModalOpen, setRecoModalOpen] = useState(false);
  const [recoModalProduct, setRecoModalProduct] = useState<RecoProduct | null>(null);
  // [END] 감지 전 펜딩 이동 — [마무리하고 넘어가기] 탭 후 세팅
  const pendingRecoJumpRef = useRef<RecoProduct | null>(null);
  // extend 칩 상태
  const [extendState, setExtendState] = useState<ExtendChipState>("idle");
  // RechargeSheet
  const [rechargeSheetOpen, setRechargeSheetOpen] = useState(false);
  // pending_upsell 재개 배너
  const [pendingResumeBanner, setPendingResumeBanner] = useState<{
    type: "clarifier" | "extend";
  } | null>(null);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // W3 출구 nudge — 마지막 응답의 wrap-mode (X-Wrap-Mode 헤더) + 출구 칩 상태
  const wrapModeRef = useRef<"free" | "converge" | "hardcap">("free");
  const [exitOffer, setExitOffer] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runExitNudgeRef = useRef<() => void>(() => {});

  // 컨텍스트 로드 + 첫 풀이 자동 시작
  useEffect(() => {
    // 이어하기 모드 — 기존 reading 을 불러와 대화를 복원 (별 재차감 X).
    // 메시지가 있으면 startedRef 로 자동 첫 풀이를 막고, 비어 있으면(첫 스트림 도중
    // 이탈해 미저장) 그대로 둬서 아래 자동 시작 effect 가 첫 풀이를 복구한다.
    if (resumeId) {
      void (async () => {
        try {
          const r = await fetch(`/api/readings/${resumeId}`, {
            cache: "no-store",
          });
          if (!r.ok) {
            router.replace("/readings");
            return;
          }
          const d = await r.json();
          const reading = d.reading as {
            sajuData: SajuResult | null;
            question: string;
            consultationType?: string;
          };
          if (!reading?.sajuData || reading.consultationType === "tarot") {
            router.replace("/readings");
            return;
          }
          const rawMsgs = (d.messages ?? []) as Message[];
          if (rawMsgs.length > 0) {
            startedRef.current = true;
            const restored = rawMsgs.map((m) => ({
              role: m.role,
              content: m.role === "assistant"
                ? stripRecoMarkers(m.content.replace(/\[END\]/g, "")).trim()
                : m.content,
            }));
            setMessages(restored);
            const lastAssistant = [...rawMsgs]
              .reverse()
              .find((m) => m.role === "assistant");
            if (lastAssistant && /\[END\]/.test(lastAssistant.content)) {
              setIsEnded(true);
            }
            // 복원 시 RECO 마커 감지 — product별 최초 등장 인덱스 기록
            {
              const restored: Partial<Record<RecoProduct, number>> = {};
              for (let i = 0; i < rawMsgs.length; i++) {
                if (rawMsgs[i].role !== "assistant") continue;
                for (const m of rawMsgs[i].content.matchAll(new RegExp(RECO_MARKER_REGEX.source, "gi"))) {
                  const v = m[1].toLowerCase() as RecoProduct;
                  if (v === "continue") continue;
                  if (restored[v] === undefined) restored[v] = i;
                }
              }
              if (Object.keys(restored).length > 0) setRecoAttach(restored);
            }
          }
          const p = d.profile as {
            display_name: string;
            relation_type: string;
            birth_date: string;
            birth_time: string | null;
          } | null;
          setCtx({
            readingId: resumeId,
            saju: reading.sajuData,
            question: reading.question,
            profile: p
              ? {
                  displayName: p.display_name,
                  relationType: p.relation_type,
                  birthDate: p.birth_date,
                  birthTime: p.birth_time,
                }
              : undefined,
          });
        } catch {
          router.replace("/readings");
        }
      })();
      return;
    }

    try {
      const raw = sessionStorage.getItem("byeolkong:current_reading");
      if (!raw) {
        router.replace("/saju");
        return;
      }
      const c = JSON.parse(raw) as CurrentReading;
      if (!c?.readingId || !c?.saju || !c?.question) {
        router.replace("/saju");
        return;
      }
      setCtx(c);
    } catch {
      router.replace("/saju");
    }
  }, [router, resumeId]);

  useEffect(() => {
    if (!ctx) return;
    if (startedRef.current) return;
    startedRef.current = true;
    // 첫 풀이: question 을 user 메시지로 전송 → 별콩이가 자동 응답
    void sendMessage(ctx.question, [{ role: "user", content: ctx.question }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // pending_upsell 복원 — ctx(readingId) 확보 후 체크
  useEffect(() => {
    if (!ctx?.readingId) return;
    const raw = sessionStorage.getItem("byeolkong:pending_upsell");
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as { readingId: string; type: "clarifier" | "extend" };
      if (pending.readingId !== ctx.readingId) {
        sessionStorage.removeItem("byeolkong:pending_upsell");
        return;
      }
      fetch("/api/stars/balance", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const bal: number = d?.balance ?? 0;
          if (bal >= 10) {
            setPendingResumeBanner({ type: pending.type });
          } else {
            sessionStorage.removeItem("byeolkong:pending_upsell");
          }
        })
        .catch(() => {
          sessionStorage.removeItem("byeolkong:pending_upsell");
        });
    } catch {
      sessionStorage.removeItem("byeolkong:pending_upsell");
    }
  }, [ctx?.readingId]);

  // 메시지 추가 시 하단 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, streamingText]);

  // W3 출구 nudge — 어시스턴트 턴 완료 후 무응답 지속 + 수렴 이후(또는 RECO 노출 후)에만
  function clearExitTimer() {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }

  function armExitTimer() {
    clearExitTimer();
    exitTimerRef.current = setTimeout(() => runExitNudgeRef.current(), IDLE_EXIT_MS);
  }

  function runExitNudge() {
    if (isStreaming || isEnded || !ctx) return;
    if (input.trim()) return;
    const exitEligible =
      wrapModeRef.current !== "free" || Object.keys(recoAttach).length > 0;
    if (!exitEligible) return;
    const text = EXIT_NUDGE[Math.floor(Math.random() * EXIT_NUDGE.length)];
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: text, ephemeral: true },
    ]);
    setExitOffer(true);
  }

  useEffect(() => {
    runExitNudgeRef.current = runExitNudge;
  });

  useEffect(() => {
    return () => clearExitTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMessage(
    _userContent: string,
    history: Message[],
    opts?: { forceEnd?: boolean }
  ) {
    if (!ctx) return;
    clearExitTimer();
    setExitOffer(false);
    setMessages(history);
    setIsStreaming(true);
    setStreamingText("");
    setError(null);

    try {
      const r = await fetch("/api/consultations/saju/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readingId: ctx.readingId,
          // ephemeral(부재/출구 멘트) 제외 + role/content 만 추려 전송
          messages: history
            .filter((m) => !m.ephemeral)
            .map((m) => ({ role: m.role, content: m.content })),
          forceEnd: opts?.forceEnd ?? false,
        }),
      });
      if (!r.ok || !r.body) {
        const data = await r.json().catch(() => ({}));
        setError(data?.error || "연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
        setIsStreaming(false);
        return;
      }

      // sensitive 응답 헤더 확인 (서버가 박은 경우만 존재)
      const sCat = r.headers.get("X-Sensitive-Category");
      const sSev = r.headers.get("X-Sensitive-Severity");
      if (sCat) {
        setSafety({
          category: sCat as SensitiveCategory,
          severity: Number(sSev ?? 1),
        });
      }

      // W3: wrap-mode 저장 — 출구 nudge 발동 기준
      const wm = r.headers.get("X-Wrap-Mode");
      if (wm === "free" || wm === "converge" || wm === "hardcap") {
        wrapModeRef.current = wm;
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        // 미완성 [END]/[RECO:] 마커 임시 제거 (스트리밍 깜빡임 방지)
        const display = stripRecoMarkers(accumulated.replace(TRAILING_PARTIAL, ""));
        setStreamingText(display);
      }

      const ended = END_MARKER.test(accumulated);
      const finalText = stripRecoMarkers(accumulated.replace(END_MARKER, "")).trim();

      // 빈 응답 방어 — 서버 가드를 혹시 통과해도 빈 말풍선을 히스토리에 남기지 않는다
      if (!finalText && !ended) {
        setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
        setStreamingText("");
        setIsStreaming(false);
        return;
      }

      // 스트리밍 완료 — 모든 RECO 마커 감지 (product별 1개 제한)
      const allRecoMarkers: RecoProduct[] = [];
      for (const m of accumulated.matchAll(new RegExp(RECO_MARKER_REGEX.source, "gi"))) {
        const v = m[1].toLowerCase() as RecoProduct;
        if (!allRecoMarkers.includes(v)) allRecoMarkers.push(v);
      }

      const newMessages: Message[] = [...history, { role: "assistant", content: finalText }];
      setMessages(newMessages);
      const msgIdx = newMessages.length - 1;
      if (allRecoMarkers.length > 0) {
        setRecoAttach((existing) => {
          const updated = { ...existing };
          for (const rp of allRecoMarkers) {
            if (rp === "continue") continue;
            if (updated[rp] !== undefined) continue;
            updated[rp] = msgIdx;
          }
          return updated;
        });
      }
      setStreamingText("");
      setIsStreaming(false);
      if (ended) {
        // pendingRecoJumpRef 있으면 결과 화면 대신 추천 상품으로 직행
        const pendingProduct = pendingRecoJumpRef.current;
        if (pendingProduct && ctx) {
          pendingRecoJumpRef.current = null;
          const dest = setRecoSessionStorage({
            product: pendingProduct,
            readingId: ctx.readingId,
            question: ctx.question,
            emotionTag: null,
          });
          router.replace(dest);
        } else {
          setIsEnded(true);
        }
      } else {
        // 미종료 턴 — 무응답 지속 시 출구 nudge 무장
        armExitTimer();
      }
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      setIsStreaming(false);
      // 스트림 실패 시 직행 예약 해제 — 이후 일반 턴의 [END]가 예상 밖 점프를 만들지 않게
      pendingRecoJumpRef.current = null;
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || isEnded) return;
    const text = input.trim();
    setInput("");
    void sendMessage(text, [...messages, { role: "user", content: text }]);
  };

  // 인챗 추천 카드 [마무리하고 넘어가기] 확인 핸들러 (cross-type 전용)
  const handleRecoConfirm = () => {
    setRecoModalOpen(false);
    const product = recoModalProduct;
    if (!product || !ctx) return;

    if (isEnded) {
      // 이미 종료된 대화 — 결과 스킵하고 바로 이동
      const dest = setRecoSessionStorage({
        product,
        readingId: ctx.readingId,
        question: ctx.question,
        emotionTag: null,
      });
      router.replace(dest);
      return;
    }

    // 진행 중인 대화 — pendingRecoJumpRef 세팅 후 그레이스풀 종료
    pendingRecoJumpRef.current = product;
    handleFinish();
  };

  // ExtendChip 탭 핸들러
  const handleExtendTap = async () => {
    if (!ctx || extendState !== "idle") return;
    setExtendState("loading");
    try {
      const res = await fetch(`/api/readings/${ctx.readingId}/extend`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setExtendState("idle");
        setRechargeSheetOpen(true);
        return;
      }
      if (!res.ok) {
        const msg = (data as {error?:string}).error === "extend_limit_reached"
          ? "이미 연장했어. 더 연장은 안 돼"
          : "연장이 안 됐어. 잠시 후 다시 시도해줄래?";
        setError(msg);
        setExtendState("idle");
        return;
      }
      setExtendState("done");
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      setExtendState("idle");
    }
  };

  // 대화 마무리 — 그레이스풀 종료([END])를 강제해 결과 화면으로 유도
  const handleFinish = (phrase: string = FINISH_PHRASE) => {
    if (isStreaming || isEnded || !ctx) return;
    void sendMessage(
      phrase,
      [...messages, { role: "user", content: phrase }],
      { forceEnd: true }
    );
  };

  if (!ctx) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  // assistant 턴별 첫 메시지 판정 (연속 같은 role 이면 첫 메시지에만 아바타)
  const isFirstAssistantInGroup = (idx: number): boolean => {
    if (messages[idx]?.role !== "assistant") return false;
    if (idx === 0) return true;
    return messages[idx - 1].role !== "assistant";
  };

  return (
    <main className="flex flex-1 flex-col items-stretch w-full">
      {/* 상단 사주판 thumbnail (접기/펼치기) */}
      <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur border-b border-lilac-mid/20">
        <div className="max-w-md mx-auto px-5 py-2.5 flex items-center justify-between">
          <button
            onClick={() => setShowSajuBoard((v) => !v)}
            className="flex items-center gap-2 text-[12px] text-eye-purple"
          >
            <span className="font-bold">사주판</span>
            <span className="text-text-light/70">
              {showSajuBoard ? "접기 ▴" : "펼치기 ▾"}
            </span>
          </button>
          <Link
            href="/saju"
            className="text-[11px] text-text-light/70"
          >
            ‹ 처음으로
          </Link>
        </div>
        {showSajuBoard && (
          <div className="max-w-md mx-auto px-5 pb-3">
            <div className="bg-white rounded-2xl p-3 border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)] flex items-center gap-3">
              <SajuIdentityRow
                saju={ctx.saju}
                title={
                  ctx.profile
                    ? ctx.profile.relationType === "self"
                      ? "내 사주"
                      : ctx.profile.displayName
                    : `${ctx.saju.dayStem}${ctx.saju.dayElement} 일간`
                }
                badge={
                  ctx.profile && ctx.profile.relationType !== "self"
                    ? (RELATION_LABEL[ctx.profile.relationType] ?? "지인")
                    : null
                }
                caption={
                  ctx.profile
                    ? sajuCaption(ctx.saju, ctx.profile)
                    : [
                        ctx.saju.input.inputCalendar === "lunar" ? "음력" : "양력",
                        ...(ctx.saju.input.hourKnown ? [] : ["시간 모름"]),
                      ].join(" · ")
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* 채팅 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 180px)" }}
      >
        <div className="max-w-md mx-auto px-5 py-5">
          {safety && (
            <SafetyBanner
              category={safety.category}
              severity={safety.severity}
              onClose={() => setSafety(null)}
            />
          )}
          {messages.map((m, i) => {
            const attachedProducts = m.role === "assistant"
              ? (Object.entries(recoAttach) as [RecoProduct, number][])
                  .filter(([, idx]) => idx === i)
                  .map(([p]) => p)
              : [];
            return (
              <div key={i}>
                <ChatBubble
                  role={m.role}
                  content={m.content}
                  isFirstInTurn={isFirstAssistantInGroup(i)}
                />
                {attachedProducts.map((product) => {
                  if (INCHAT_ONLY_PRODUCTS.includes(product)) {
                    if (product === "extend") {
                      return (
                        <ExtendChip
                          key={product}
                          state={extendState}
                          onTap={() => void handleExtendTap()}
                        />
                      );
                    }
                    return null;
                  }
                  return (
                    <RecoInlineCard
                      key={product}
                      product={product}
                      onTap={() => {
                        setRecoModalProduct(product);
                        setRecoModalOpen(true);
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
          {/* W3 출구 칩 — 출구 nudge 멘트 바로 아래 */}
          {exitOffer && !isStreaming && !isEnded && (
            <div className="flex justify-start pl-10 mt-1 mb-2">
              <button
                type="button"
                onClick={() => handleFinish(FINISH_PHRASE_EXIT)}
                className="px-4 py-2 rounded-full bg-gold text-night font-bold text-[12.5px] shadow-[0_2px_8px_rgba(232,194,106,0.45)] animate-fade-in"
              >
                ✨ 결과 카드 보기
              </button>
            </div>
          )}
          {isStreaming && (
            <ChatBubble
              role="assistant"
              content={streamingText}
              isFirstInTurn={
                messages.length === 0 ||
                messages[messages.length - 1].role !== "assistant"
              }
              streaming
            />
          )}
          {error && (
            <p className="text-[12px] text-red-500 text-center mt-2">{error}</p>
          )}
        </div>
      </div>

      {/* 하단 입력창 또는 종료 CTA */}
      <div className="border-t border-lilac-mid/30 bg-cream">
        <div className="max-w-md mx-auto px-5 py-3">
          {isEnded ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-text-light text-center">
                별콩이의 풀이가 마무리됐어 ✨
              </p>
              <Link
                href={`/saju/result?id=${ctx.readingId}`}
                className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] text-center"
              >
                결과 보기 →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isStreaming ? "별콩이가 답하는 중…" : "별콩이에게 더 물어보기"
                  }
                  disabled={isStreaming}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] placeholder:text-text-light/50 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={isStreaming || !input.trim()}
                  className="px-4 py-2.5 rounded-xl bg-lilac-deep text-white font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  전송
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleFinish()}
                disabled={isStreaming}
                className="w-full py-2.5 rounded-xl bg-gold text-night font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✨ 이 풀이로 결과 카드 받기
              </button>
            </form>
          )}
        </div>
      </div>

      {/* 인챗 추천 확인 모달 (cross-type 전용) */}
      <RecoConfirmModal
        open={recoModalOpen}
        product={recoModalProduct}
        onCancel={() => setRecoModalOpen(false)}
        onConfirm={handleRecoConfirm}
      />

      {/* 충전 시트 */}
      {ctx && (
        <RechargeSheet
          open={rechargeSheetOpen}
          returnTo={`/saju/reading?id=${ctx.readingId}`}
          pendingUpsell={{ readingId: ctx.readingId, type: "extend" }}
          onClose={() => setRechargeSheetOpen(false)}
        />
      )}

      {/* pending_upsell 재개 배너 */}
      {pendingResumeBanner && (
        <div className="fixed top-[3.5rem] inset-x-0 z-[80] flex justify-center px-4 pointer-events-none">
          <div
            className="w-full max-w-md pointer-events-auto flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gold/40 shadow-lg animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-[15px] shrink-0">⭐</span>
            <p className="flex-1 text-[13px] font-bold text-eye-purple leading-snug">
              충전 완료! 이어갈까?
            </p>
            <button
              onClick={() => {
                sessionStorage.removeItem("byeolkong:pending_upsell");
                setPendingResumeBanner(null);
                void handleExtendTap();
              }}
              className="shrink-0 px-3 py-1.5 bg-lilac-deep text-white rounded-full text-[12px] font-bold hover:bg-lilac-deep/90"
            >
              좋아
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem("byeolkong:pending_upsell");
                setPendingResumeBanner(null);
              }}
              className="shrink-0 text-[11px] text-text-light/70 hover:text-text-light"
            >
              나중에
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
