"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ChatBubble from "@/components/tarot/ChatBubble";
import CardSpreadView from "@/components/tarot/CardSpreadView";
import SafetyBanner from "@/components/safety/SafetyBanner";
import RecoInlineCard from "@/components/reco/RecoInlineCard";
import RecoConfirmModal from "@/components/reco/RecoConfirmModal";
import { EMOTION_OPTIONS } from "@/lib/emotions";
import { TAROT_DRAW_KEY, type TarotDrawResult } from "@/lib/tarot/session";
import type { SensitiveCategory } from "@/lib/sensitive";
import { RECO_MARKER_REGEX, stripRecoMarkers, parseRecoMarker, INCHAT_ONLY_PRODUCTS, type RecoProduct } from "@/lib/reco-utils";
import { setRecoSessionStorage } from "@/lib/reco-nav";
import ClarifierChip, { type ClarifierChipState } from "@/components/upsell/ClarifierChip";
import ExtendChip, { type ExtendChipState } from "@/components/upsell/ExtendChip";
import ClarifierSheet from "@/components/upsell/ClarifierSheet";
import RechargeSheet from "@/components/upsell/RechargeSheet";
import { CLARIFIER_COST, EXTEND_COST } from "@/lib/upsell";
import { SPREAD_INFO } from "@/lib/tarot/spreads";
import { getCard } from "@/lib/tarot/cards";

interface Message {
  role: "user" | "assistant";
  content: string;
  /** 부재 감지 멘트 — 화면 표시 전용. API/ DB/ 턴 카운트 제외 */
  ephemeral?: boolean;
}

const TYPING_SPEED = 45;
const THINKING_PROBABILITY = 0.2; // 새 버블 생성 전 "생각 중" pause 확률
const DEBOUNCE_FLUSH_MS = 2000;
const IDLE_NUDGE_1_MS = 10000;
const IDLE_NUDGE_2_MS = 40000; // 1단계 멘트 이후 추가 대기
const NUDGE_STAGE_1 = [
  "어디 갔어~? 천천히 생각해도 괜찮아 :)",
  "음, 아직 거기 있어? 별콩이 여기서 기다릴게",
  "다른 거 하는 중이야? 돌아오면 마저 봐줄게",
];
const NUDGE_STAGE_2 = [
  "별콩이 여기 있을게, 천천히 와",
  "급할 거 없어. 마음 정리되면 다시 얘기하자",
];
// W3 출구 nudge — 수렴 이후 무응답 지속 시 "마무리하고 결과 보기" 제안 (로컬 멘트, API 호출 X)
const IDLE_EXIT_MS = 60000; // 2단계 멘트 이후 출구 제안까지 추가 대기
const EXIT_NUDGE = [
  "오늘은 여기까지 해도 충분해. 지금까지 나눈 얘기, 결과 카드로 만들어둘게 — 보고 갈래?",
  "마음 가는 만큼만 하면 돼. 오늘 얘기는 결과 카드로 정리해둘 수 있어 — 마무리하고 볼래?",
];
const FINISH_PHRASE = "대화 마무리할게"; // 하단 골드 버튼 경유
const FINISH_PHRASE_EXIT = "오늘은 여기서 마무리할게"; // 출구 칩 경유 (계측 구분용)
const CARD_MARKER_REGEX = /\[CARD:(\d+)\]/g;
const END_MARKER_REGEX = /\[END\]/gi;
// 미완성 마커 (e.g., "[CA", "[CARD:", "[CARD:1", "[E", "[EN", "[END", "[RECO:", "[RECO:saju") 제거용 — 버블 깜빡임 방지
const TRAILING_PARTIAL_MARKER =
  /\[(?:C(?:A(?:R(?:D(?::\d*)?)?)?)?|E(?:N(?:D)?)?|R(?:E(?:C(?:O(?::[a-z0-9_:]*)?)?)?)?)?$/;

interface Bubble {
  text: string;
  cardIndex: number | null;
  showCardImage: boolean;
}

/** 원문 버퍼를 문단 + [CARD:n] 마커 기준으로 버블 배열로 파싱 */
function parseIntoBubbles(raw: string): Bubble[] {
  const bubbles: Bubble[] = [];
  // RECO 마커는 파싱 전 원본에서 감지(parseRecoMarker) 가능하도록 raw 는 보존.
  // 표시 텍스트에서만 제거한다.
  const cleaned = stripRecoMarkers(
    raw
      .replace(TRAILING_PARTIAL_MARKER, "")
      .replace(END_MARKER_REGEX, "")
  );
  // RECO_MARKER_REGEX 는 lastIndex 를 공유하지 않도록 stripRecoMarkers 내부에서 처리됨.
  RECO_MARKER_REGEX.lastIndex = 0;
  const tokens = cleaned.split(/(\[CARD:\d+\])/g);
  let currentCardIndex: number | null = null;
  let nextIsFirstInSection = false;

  for (const token of tokens) {
    const markerMatch = /^\[CARD:(\d+)\]$/.exec(token);
    if (markerMatch) {
      currentCardIndex = parseInt(markerMatch[1], 10) - 1;
      nextIsFirstInSection = true;
      continue;
    }
    const paras = token
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of paras) {
      bubbles.push({
        text: p,
        cardIndex: currentCardIndex,
        showCardImage: nextIsFirstInSection,
      });
      nextIsFirstInSection = false;
    }
  }
  return bubbles;
}

/** 버퍼에서 가장 최근에 등장한 [CARD:n] 의 n 반환 (1-based) */
function getLatestCardIndex(text: string): number | null {
  let lastMatch: RegExpExecArray | null = null;
  const regex = new RegExp(CARD_MARKER_REGEX.source, "g");
  let m;
  while ((m = regex.exec(text)) !== null) {
    lastMatch = m;
  }
  return lastMatch ? parseInt(lastMatch[1], 10) : null;
}

export default function TarotReadingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-5">
          <p className="text-text-light text-sm">카드를 펼치는 중…</p>
        </main>
      }
    >
      <TarotReadingInner />
    </Suspense>
  );
}

function TarotReadingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("id");
  const [draw, setDraw] = useState<TarotDrawResult | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingBubbles, setStreamingBubbles] = useState<Bubble[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showPendingDots, setShowPendingDots] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number | null>(null);
  const [concernExpanded, setConcernExpanded] = useState(false);
  const [safety, setSafety] = useState<{
    category: SensitiveCategory;
    severity: number;
  } | null>(null);
  // 인챗 추천 카드 — product 별 각 1개. cross-type은 RecoInlineCard, inchat 전용은 칩.
  // { [product]: messageIndex } 맵
  const [recoAttach, setRecoAttach] = useState<Partial<Record<RecoProduct, number>>>({});
  // 확인 모달 열림 여부 (cross-type용)
  const [recoModalOpen, setRecoModalOpen] = useState(false);
  // 현재 확인 모달에 표시 중인 product (cross-type)
  const [recoModalProduct, setRecoModalProduct] = useState<RecoProduct | null>(null);
  // [END] 감지 전 펜딩 이동 — [마무리하고 넘어가기] 탭 후 세팅
  const pendingRecoJumpRef = useRef<RecoProduct | null>(null);
  // 업셀 칩 상태
  const [clarifierState, setClarifierState] = useState<ClarifierChipState>("idle");
  const [extendState, setExtendState] = useState<ExtendChipState>("idle");
  // ClarifierSheet 열림 여부
  const [clarifierSheetOpen, setClarifierSheetOpen] = useState(false);
  // RechargeSheet
  const [rechargeSheetOpen, setRechargeSheetOpen] = useState(false);
  const [rechargeUpsellType, setRechargeUpsellType] = useState<"clarifier" | "extend">("extend");
  // pending_upsell 재개 배너
  const [pendingResumeBanner, setPendingResumeBanner] = useState<{
    type: "clarifier" | "extend";
  } | null>(null);

  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef("");
  const displayIndexRef = useRef(0);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchDoneRef = useRef(false);
  const lastScrollRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const lastStableBubbleCountRef = useRef(0);
  const suppressScrollUntilRef = useRef(0);
  const showPendingDotsRef = useRef(false);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const messagesRef = useRef<Message[]>([]);
  const pendingFragmentsRef = useRef<string[]>([]);
  const baseHistoryRef = useRef<Message[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleStageRef = useRef(0); // 0=아직, 1=1단계 후, 2=2단계 후, 3=종료
  const flushPendingRef = useRef<() => void>(() => {});
  const runIdleNudgeRef = useRef<() => void>(() => {});
  // W3 출구 nudge — 마지막 응답의 wrap-mode (X-Wrap-Mode 헤더) + 출구 칩 노출 상태
  const wrapModeRef = useRef<"free" | "converge" | "hardcap">("free");
  const [exitOffer, setExitOffer] = useState(false);

  // 컨텍스트 로드 + reading 생성 + 첫 풀이 자동 시작
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // 이어하기 모드 — 기존 reading 을 불러와 대화를 복원 (별 재차감 X)
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
            spreadType: TarotDrawResult["spreadType"];
            spreadCategory: TarotDrawResult["spreadCategory"];
            emotionTag: string | null;
            question: string;
            drawnCards: TarotDrawResult["drawnCards"] | null;
          };
          const msgs = (d.messages ?? []) as Message[];
          if (!reading.drawnCards || reading.drawnCards.length === 0) {
            router.replace("/readings");
            return;
          }
          setDraw({
            spreadType: reading.spreadType,
            spreadCategory: reading.spreadCategory,
            emotion: (reading.emotionTag ?? "") as TarotDrawResult["emotion"],
            concern: reading.question,
            drawnCards: reading.drawnCards,
          });
          setReadingId(resumeId);
          // 메시지가 없으면(이어가기 deep 로 갓 생성됐거나 첫 스트림 도중 이탈해 미저장)
          // 첫 풀이를 자동 생성, 있으면 대화 복원.
          if (msgs.length === 0) {
            void sendMessage(
              [{ role: "user", content: reading.question }],
              resumeId
            );
          } else {
            setMessages(msgs);
            const lastAssistant = [...msgs]
              .reverse()
              .find((m) => m.role === "assistant");
            if (lastAssistant && END_MARKER_REGEX.test(lastAssistant.content)) {
              setIsEnded(true);
            }
            END_MARKER_REGEX.lastIndex = 0;
            // 복원 시 RECO 마커 감지 — product별 최초 등장 인덱스 기록
            {
              const restored: Partial<Record<RecoProduct, number>> = {};
              for (let i = 0; i < msgs.length; i++) {
                if (msgs[i].role !== "assistant") continue;
                for (const m of msgs[i].content.matchAll(new RegExp(RECO_MARKER_REGEX.source, "gi"))) {
                  const v = m[1].toLowerCase() as RecoProduct;
                  if (v === "continue") continue;
                  if (restored[v] === undefined) restored[v] = i;
                }
              }
              if (Object.keys(restored).length > 0) setRecoAttach(restored);
            }
            // 복원 직후 마지막 대화가 보이도록 하단으로 스크롤
            setTimeout(() => {
              const el = scrollRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight });
            }, 120);
          }
        } catch {
          router.replace("/readings");
        }
      })();
      return;
    }

    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem(TAROT_DRAW_KEY)
        : null;
    if (!raw) {
      router.replace("/tarot");
      return;
    }
    let parsed: TarotDrawResult;
    try {
      parsed = JSON.parse(raw) as TarotDrawResult;
    } catch {
      router.replace("/tarot");
      return;
    }
    setDraw(parsed);
    // 드로우 키 1회성 소비 — 뒤로가기/재마운트로 startedRef 가 초기화되면 이 리딩이
    // 재생성돼 별이 중복 차감되던 크리티컬 버그 방지. parsed 는 이미 state 로 확보됨.
    // 재마운트 시엔 키가 없어 위 !raw 분기로 /tarot 에 안전하게 유도된다.
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(TAROT_DRAW_KEY);
    }

    void (async () => {
      try {
        const contRaw =
          typeof window !== "undefined"
            ? sessionStorage.getItem("byeolkong:continuation")
            : null;
        let cont: { previousReadingId?: string; mode?: string } = {};
        try {
          cont = contRaw ? JSON.parse(contRaw) : {};
        } catch {
          cont = {};
        }
        const r = await fetch("/api/consultations/tarot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadType: parsed.spreadType,
            spreadCategory: parsed.spreadCategory,
            emotion: parsed.emotion,
            concern: parsed.concern,
            drawnCards: parsed.drawnCards,
            previousReadingId: cont.previousReadingId,
            continuationMode: cont.mode === "fresh" ? "fresh" : undefined,
          }),
        });
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("byeolkong:continuation");
        }
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          if (data?.code === "LOGIN_REQUIRED") {
            router.push("/login?next=/tarot");
            return;
          }
          if (data?.code === "INSUFFICIENT_STARS") {
            router.push("/shop");
            return;
          }
          setError(data?.error || "시작이 안 됐어. 잠시 후 다시 시도해줄래?");
          return;
        }
        const data = await r.json();
        setReadingId(data.id);
        // 첫 풀이 — concern 은 messages[0] 로 전송하지만 화면 버블로는 안 그림
        void sendMessage(
          [{ role: "user", content: parsed.concern }],
          data.id
        );
      } catch {
        setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, resumeId]);

  // pending_upsell 복원 — readingId 확보 후 체크
  useEffect(() => {
    if (!readingId) return;
    const raw = sessionStorage.getItem("byeolkong:pending_upsell");
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as { readingId: string; type: "clarifier" | "extend" };
      if (pending.readingId !== readingId) {
        sessionStorage.removeItem("byeolkong:pending_upsell");
        return;
      }
      // 잔액 확인
      fetch("/api/stars/balance", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const bal: number = d?.balance ?? 0;
          const needed = pending.type === "clarifier" ? CLARIFIER_COST : EXTEND_COST;
          if (bal >= needed) {
            setPendingResumeBanner({ type: pending.type });
          } else {
            // 잔액 여전히 부족 — 키 삭제
            sessionStorage.removeItem("byeolkong:pending_upsell");
          }
        })
        .catch(() => {
          sessionStorage.removeItem("byeolkong:pending_upsell");
        });
    } catch {
      sessionStorage.removeItem("byeolkong:pending_upsell");
    }
  }, [readingId]);

  useEffect(() => {
    messagesRef.current = messages;
  });

  useEffect(() => {
    flushPendingRef.current = flushPending;
  });

  useEffect(() => {
    runIdleNudgeRef.current = runIdleNudge;
  });

  useEffect(() => {
    return () => {
      stopTyping();
      clearFlushTimer();
      clearIdleTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emotionEmoji = useMemo(() => {
    if (!draw) return "✨";
    return (
      EMOTION_OPTIONS.find((e) => e.tag === draw.emotion)?.emoji ?? "✨"
    );
  }, [draw]);

  // 컨테이너 하단 스크롤 — 쓰로틀 + 유저 전송 직후 일시정지 존중
  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    const now = Date.now();
    if (now < suppressScrollUntilRef.current) return;
    if (now - lastScrollRef.current < 120) return;
    lastScrollRef.current = now;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    });
  }

  function startTyping() {
    if (typingIntervalRef.current) return;
    pauseUntilRef.current = 0;
    lastStableBubbleCountRef.current = 0;

    typingIntervalRef.current = setInterval(() => {
      const now = Date.now();
      if (now < pauseUntilRef.current) return;

      if (showPendingDotsRef.current) {
        showPendingDotsRef.current = false;
        setShowPendingDots(false);
      }

      const buffer = bufferRef.current;
      const currentIndex = displayIndexRef.current;

      if (currentIndex < buffer.length) {
        const nextIndex = currentIndex + 1;
        const nextVisible = buffer.slice(0, nextIndex);
        const parsed = parseIntoBubbles(nextVisible);

        const isNewBubble =
          parsed.length > lastStableBubbleCountRef.current &&
          lastStableBubbleCountRef.current > 0;

        if (isNewBubble && Math.random() < THINKING_PROBABILITY) {
          pauseUntilRef.current = now + 700 + Math.floor(Math.random() * 700);
          showPendingDotsRef.current = true;
          setShowPendingDots(true);
          lastStableBubbleCountRef.current = parsed.length;
          return;
        }

        lastStableBubbleCountRef.current = parsed.length;
        displayIndexRef.current = nextIndex;
        setStreamingBubbles(parsed);

        const latest = getLatestCardIndex(nextVisible);
        if (latest !== null) setActiveCardIndex(latest - 1);
        // 답변 첫 글자가 뜨는 순간 스크롤 억제 해제 — 첫 말풍선부터 따라 내려가도록
        if (currentIndex === 0) suppressScrollUntilRef.current = 0;
        scrollToBottom();
      } else if (fetchDoneRef.current) {
        stopTyping();
        finishMessage();
      }
    }, TYPING_SPEED);
  }

  function stopTyping() {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }

  function clearFlushTimer() {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }

  function clearIdleTimer() {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function armFlushTimer() {
    clearFlushTimer();
    flushTimerRef.current = setTimeout(
      () => flushPendingRef.current(),
      DEBOUNCE_FLUSH_MS
    );
  }

  function armIdleTimer(delay: number) {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(
      () => runIdleNudgeRef.current(),
      delay
    );
  }

  function finishMessage() {
    const finalContent = bufferRef.current;
    if (!finalContent) {
      setIsStreaming(false);
      setStreamingBubbles([]);
      return;
    }

    const hasEnd = END_MARKER_REGEX.test(finalContent);
    END_MARKER_REGEX.lastIndex = 0;

    // 스트리밍 완료 — 이 메시지의 모든 RECO 마커 감지 (product 별 1개 제한)
    const allRecoMarkers: RecoProduct[] = [];
    for (const m of finalContent.matchAll(new RegExp(RECO_MARKER_REGEX.source, "gi"))) {
      const v = m[1].toLowerCase() as RecoProduct;
      if (!allRecoMarkers.includes(v)) allRecoMarkers.push(v);
    }

    setTimeout(() => {
      setMessages((prev) => {
        const newMessages = [...prev, { role: "assistant" as const, content: finalContent }];
        const msgIdx = newMessages.length - 1;
        setRecoAttach((existing) => {
          const updated = { ...existing };
          for (const rp of allRecoMarkers) {
            if (rp === "continue") continue;
            if (updated[rp] !== undefined) continue; // 이미 등록됨
            updated[rp] = msgIdx;
          }
          return updated;
        });
        return newMessages;
      });
      setStreamingBubbles([]);
      setIsStreaming(false);
      setActiveCardIndex(null);
      if (hasEnd) {
        // pendingRecoJumpRef 있으면 결과 화면 대신 추천 상품으로 직행
        const pendingProduct = pendingRecoJumpRef.current;
        if (pendingProduct && draw && readingId) {
          pendingRecoJumpRef.current = null;
          const dest = setRecoSessionStorage({
            product: pendingProduct,
            readingId,
            question: draw.concern,
            emotionTag: draw.emotion ?? null,
          });
          router.replace(dest);
        } else {
          setIsEnded(true);
        }
      } else {
        idleStageRef.current = 0;
        armIdleTimer(IDLE_NUDGE_1_MS);
      }
    }, 80);
  }

  async function sendMessage(
    history: Message[],
    rid: string,
    opts?: { forceEnd?: boolean; skipSetMessages?: boolean }
  ) {
    const forceEnd = opts?.forceEnd ?? false;
    clearFlushTimer();
    clearIdleTimer();
    setExitOffer(false);
    if (!opts?.skipSetMessages) setMessages(history);
    setIsStreaming(true);
    setStreamingBubbles([]);
    setShowPendingDots(false);
    showPendingDotsRef.current = false;
    bufferRef.current = "";
    displayIndexRef.current = 0;
    fetchDoneRef.current = false;
    setActiveCardIndex(null);
    setError(null);

    startTyping();

    try {
      const r = await fetch("/api/consultations/tarot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readingId: rid,
          // ephemeral(부재 멘트) 제외 + role/content 만 추려 전송.
          // 이어하기로 불러온 메시지에 붙은 created_at 등 DB 필드를 보내면
          // Anthropic API 가 "Extra inputs are not permitted" 로 거절함.
          messages: history
            .filter((m) => !m.ephemeral)
            .map((m) => ({ role: m.role, content: m.content })),
          forceEnd,
        }),
      });
      if (!r.ok || !r.body) {
        const data = await r.json().catch(() => ({}));
        setError(data?.error || "연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
        stopTyping();
        setIsStreaming(false);
        return;
      }

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
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bufferRef.current += decoder.decode(value, { stream: true });
      }
      fetchDoneRef.current = true;
    } catch {
      fetchDoneRef.current = true;
      stopTyping();
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      setIsStreaming(false);
      // 스트림 실패 시 직행 예약 해제 — 이후 일반 턴의 [END]가 예상 밖 점프를 만들지 않게
      pendingRecoJumpRef.current = null;
    }
  }

  function flushPending() {
    if (pendingFragmentsRef.current.length === 0) return;
    if (input.trim()) return; // 입력창에 글자 남아있으면 보류 (다음 활동 때 재무장)
    if (isStreaming || isEnded || !readingId) return;

    const merged = pendingFragmentsRef.current.join("\n");
    pendingFragmentsRef.current = [];
    clearFlushTimer();

    const apiHistory: Message[] = [
      ...baseHistoryRef.current.filter((m) => !m.ephemeral),
      { role: "user", content: merged },
    ];
    void sendMessage(apiHistory, readingId, { skipSetMessages: true });

    suppressScrollUntilRef.current = Date.now() + 1500;
  }

  function pushNudge(pool: string[]) {
    const text = pool[Math.floor(Math.random() * pool.length)];
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: text, ephemeral: true },
    ]);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }

  function runIdleNudge() {
    // 게이트: 대기 조각 없음 + 입력 빔 + 비스트리밍 + 미종료 + 별콩이가 1회 이상 응답
    if (pendingFragmentsRef.current.length > 0) return;
    if (input.trim()) return;
    if (isStreaming || isEnded || !readingId) return;
    const assistantSpoke = messagesRef.current.some(
      (m) => m.role === "assistant" && !m.ephemeral
    );
    if (!assistantSpoke) return;

    const stage = idleStageRef.current;
    if (stage === 0) {
      pushNudge(NUDGE_STAGE_1);
      idleStageRef.current = 1;
      armIdleTimer(IDLE_NUDGE_2_MS);
    } else if (stage === 1) {
      pushNudge(NUDGE_STAGE_2);
      idleStageRef.current = 2;
      armIdleTimer(IDLE_EXIT_MS);
    } else if (stage === 2) {
      // W3 출구 — 수렴 이후(또는 RECO 노출 후)에만. 초반 증발 유도 방지.
      idleStageRef.current = 3; // 종료 — 더는 무장하지 않음
      const exitEligible =
        wrapModeRef.current !== "free" || Object.keys(recoAttach).length > 0;
      if (exitEligible) {
        pushNudge(EXIT_NUDGE);
        setExitOffer(true);
      }
    }
  }

  const submitText = (text: string) => {
    // 대기 묶음 시작(0→1) 시점에 현재까지의 히스토리를 base로 스냅샷
    if (pendingFragmentsRef.current.length === 0) {
      baseHistoryRef.current = messagesRef.current;
    }
    pendingFragmentsRef.current.push(text);

    // 화면엔 보낸 대로 user 버블 즉시 표시
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    // idle 중단 + 플러시 타이머 재무장
    clearIdleTimer();
    idleStageRef.current = 0;
    armFlushTimer();

    // 유저 발화 직후 — 유저 버블이 컨테이너 상단 근처에 오도록 스크롤
    suppressScrollUntilRef.current = Date.now() + 1500;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        const userBubbles = el.querySelectorAll<HTMLElement>(".justify-end");
        const last = userBubbles[userBubbles.length - 1];
        if (last) {
          el.scrollTo({
            top: Math.max(0, last.offsetTop - 16),
            behavior: "smooth",
          });
        }
      });
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming || isEnded || !readingId) return;
    submitText(text);
  };

  // 인챗 추천 카드 [마무리하고 넘어가기] 확인 핸들러 (cross-type 전용)
  const handleRecoConfirm = () => {
    setRecoModalOpen(false);
    const product = recoModalProduct;
    if (!product || !readingId || !draw) return;

    if (isEnded) {
      // 이미 종료된 대화 — 결과 스킵하고 바로 이동
      const dest = setRecoSessionStorage({
        product,
        readingId,
        question: draw.concern,
        emotionTag: draw.emotion ?? null,
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
    if (!readingId || extendState !== "idle") return;
    setExtendState("loading");
    try {
      const res = await fetch(`/api/readings/${readingId}/extend`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setExtendState("idle");
        setRechargeUpsellType("extend");
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

  // ClarifierSheet onDrawn — drawnCards 갱신 + synthetic user 턴 전송
  const handleClarifierDrawn = (newDrawnCards: TarotDrawResult["drawnCards"]) => {
    if (!draw || !readingId) return;
    // draw state 갱신 (CardSpreadView 반영)
    setDraw((prev) => prev ? { ...prev, drawnCards: newDrawnCards } : prev);
    setClarifierState("done");
    // synthetic user 턴 자동 전송 — 카드 이름 명시 (모델이 "안 보인다"고 불신하지 않게)
    const newCard = newDrawnCards[newDrawnCards.length - 1];
    const cardInfo = newCard ? getCard(newCard.card_id) : null;
    const cardDesc = cardInfo
      ? `'${cardInfo.name_kr}' (${newCard.direction === "reversed" ? "역방향" : "정방향"})`
      : "카드 한 장";
    const syntheticMsg = `방금 보조 카드로 ${cardDesc}를 더 뽑았어. 지금까지 흐름이랑 이어서 봐줘`;
    const currentHistory = messagesRef.current.filter((m) => !m.ephemeral);
    const newHistory: Message[] = [
      ...currentHistory,
      { role: "user", content: syntheticMsg },
    ];
    void sendMessage(newHistory, readingId, { skipSetMessages: true });
    setMessages((prev) => [...prev, { role: "user", content: syntheticMsg }]);
    suppressScrollUntilRef.current = Date.now() + 1500;
  };

  const handleFinish = (phrase: string = FINISH_PHRASE) => {
    if (isStreaming || isEnded || !readingId) return;
    clearFlushTimer();
    clearIdleTimer();
    idleStageRef.current = 0;

    const tail = input.trim();
    const hadPending = pendingFragmentsRef.current.length > 0;
    const base = hadPending ? baseHistoryRef.current : messagesRef.current;
    const frags = [...pendingFragmentsRef.current];

    if (tail) {
      frags.push(tail);
      // 아직 버블이 없는 현재 입력은 화면에도 추가
      setMessages((prev) => [...prev, { role: "user", content: tail }]);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
    }
    pendingFragmentsRef.current = [];

    // 마무리 의사 표시 — user 말풍선으로 띄우고 전송 내용에도 포함
    frags.push(phrase);
    setMessages((prev) => [...prev, { role: "user", content: phrase }]);

    const merged = frags.join("\n");

    const apiHistory: Message[] = [
      ...base.filter((m) => !m.ephemeral),
      { role: "user", content: merged },
    ];
    void sendMessage(apiHistory, readingId, {
      forceEnd: true,
      skipSetMessages: true,
    });

    suppressScrollUntilRef.current = Date.now() + 1500;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        const userBubbles = el.querySelectorAll<HTMLElement>(".justify-end");
        const last = userBubbles[userBubbles.length - 1];
        if (last) {
          el.scrollTo({
            top: Math.max(0, last.offsetTop - 16),
            behavior: "smooth",
          });
        }
      });
    });
  };

  const autoResizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  if (!draw) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">카드를 펼치는 중…</p>
      </main>
    );
  }

  return (
    <main
      className="flex flex-col items-stretch w-full min-h-0"
      style={{
        height: "calc(100dvh - 3.5rem - 4rem - env(safe-area-inset-bottom))",
      }}
    >
      {/* 스크롤 영역 — 고민 + 카드 스프레드 + 대화 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-4">
          {safety && (
            <SafetyBanner
              category={safety.category}
              severity={safety.severity}
              onClose={() => setSafety(null)}
            />
          )}

          {/* 고민 컨텍스트 — 접기/펼치기 토글, 디폴트 접힘 */}
          <button
            type="button"
            onClick={() => setConcernExpanded((v) => !v)}
            className="w-full text-left mb-4 px-4 py-3 bg-cream-warm rounded-2xl border border-lilac-mid/20 hover:border-lilac-mid/40 transition-colors"
            aria-expanded={concernExpanded}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] shrink-0">{emotionEmoji}</span>
              <span className="text-[12px] font-bold text-text-light tracking-wide shrink-0">
                {draw.emotion}
              </span>
              {!concernExpanded && (
                <span className="text-[12px] text-text-light/70 truncate flex-1 ml-1">
                  · {draw.concern || "지금 내 흐름이 궁금해"}
                </span>
              )}
              <span
                className={`text-text-light text-[14px] shrink-0 transition-transform ml-auto ${
                  concernExpanded ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </div>
            {concernExpanded && (
              <p className="text-[13px] text-eye-purple leading-relaxed whitespace-pre-wrap break-words mt-2">
                {draw.concern || "지금 내 흐름이 궁금해"}
              </p>
            )}
          </button>

          {/* 카드 영역 (다크 배경 + 별 파티클) */}
          <CardSpreadView
            drawnCards={draw.drawnCards}
            spreadType={draw.spreadType}
            activeIndex={activeCardIndex}
          />

          {/* 대화 영역 */}
          <div className="mt-5 flex flex-col">
            {messages.map((msg, msgI) => {
              // 첫 user 메시지(고민)는 위 컨텍스트 박스에 있으므로 버블 생략
              if (msg.role === "user") {
                if (msgI === 0) return null;
                return (
                  <ChatBubble key={msgI} role="user" content={msg.content} />
                );
              }
              const bubbles = parseIntoBubbles(msg.content);
              // 이 메시지에 부착된 product들
              const attachedProducts = (Object.entries(recoAttach) as [RecoProduct, number][])
                .filter(([, idx]) => idx === msgI)
                .map(([p]) => p);
              return (
                <div key={msgI}>
                  {bubbles.map((b, bI) => {
                    const isTurnFirst = bI === 0;
                    return (
                      <ChatBubble
                        key={`${msgI}-${bI}`}
                        role="assistant"
                        content={b.text}
                        showAvatar={isTurnFirst}
                        showName={isTurnFirst}
                        cardIndex={b.cardIndex}
                        showCardImage={b.showCardImage}
                        drawnCards={draw.drawnCards}
                      />
                    );
                  })}
                  {attachedProducts.map((product) => {
                    if (INCHAT_ONLY_PRODUCTS.includes(product)) {
                      // 인챗 전용 칩
                      if (product === "tarot:clarifier") {
                        return (
                          <ClarifierChip
                            key={product}
                            state={clarifierState}
                            onTap={() => setClarifierSheetOpen(true)}
                          />
                        );
                      }
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
                    // cross-type → RecoInlineCard
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

            {isStreaming &&
              streamingBubbles.map((b, i, arr) => {
                const isLast = i === arr.length - 1;
                const isTurnFirst = i === 0;
                return (
                  <ChatBubble
                    key={`stream-${i}`}
                    role="assistant"
                    content={b.text}
                    showAvatar={isTurnFirst}
                    showName={isTurnFirst}
                    cardIndex={b.cardIndex}
                    showCardImage={b.showCardImage}
                    drawnCards={draw.drawnCards}
                    streaming={isLast && !showPendingDots}
                  />
                );
              })}

            {/* 신규 버블 직전 또는 스트림 시작 직후 dots 인디케이터 */}
            {isStreaming &&
              (showPendingDots || streamingBubbles.length === 0) && (
                <ChatBubble
                  role="assistant"
                  content=""
                  showAvatar={streamingBubbles.length === 0}
                  showName={streamingBubbles.length === 0}
                  drawnCards={draw.drawnCards}
                  streaming
                />
              )}

            {error && (
              <p className="text-[12px] text-red-500 text-center mt-2">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 하단 입력창 또는 종료 CTA */}
      <div className="shrink-0 border-t border-lilac-mid/30 bg-white">
        <div className="max-w-md mx-auto px-5 py-3">
          {isEnded ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-text-light text-center pb-2.5">
                별콩이의 풀이가 마무리됐어 ✨
              </p>
              <Link
                href={readingId ? `/tarot/result?id=${readingId}` : "/mypage"}
                className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] text-center"
              >
                결과 보기 →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      autoResizeInput();
                      clearIdleTimer();
                      idleStageRef.current = 0;
                      if (pendingFragmentsRef.current.length > 0) armFlushTimer();
                    }}
                    onCompositionStart={() => {
                      composingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                      composingRef.current = false;
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !composingRef.current
                      ) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    rows={1}
                    placeholder={
                      isStreaming
                        ? "별콩이가 답하는 중…"
                        : "별콩이에게 더 물어보기 (Shift+Enter 줄바꿈)"
                    }
                    disabled={isStreaming || !readingId}
                    maxLength={500}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-lilac-mid/40 text-eye-purple text-[14px] leading-[22px] placeholder:text-text-light/50 disabled:opacity-60 resize-none scrollbar-hide focus:outline-none focus:border-lilac-deep focus:ring-2 focus:ring-lilac-deep/30"
                    style={{ minHeight: "44px", maxHeight: "120px" }}
                  />
                  <button
                    type="submit"
                    disabled={isStreaming || !input.trim() || !readingId}
                    className="shrink-0 h-[44px] px-4 rounded-xl bg-lilac-deep text-white font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    전송
                    <span className="text-[11px] font-normal text-white/70">
                      {input.length}/500
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleFinish()}
                  disabled={isStreaming || !readingId}
                  className="w-full py-2.5 rounded-xl bg-gold text-night font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ✨ 결과 카드 받기
                </button>
              </form>
          )}
        </div>
      </div>

      {/* 인챗 추천 확인 모달 (cross-type) */}
      <RecoConfirmModal
        open={recoModalOpen}
        product={recoModalProduct}
        onCancel={() => setRecoModalOpen(false)}
        onConfirm={handleRecoConfirm}
      />

      {/* 보조 카드 드로우 시트 */}
      {draw && readingId && (
        <ClarifierSheet
          open={clarifierSheetOpen}
          readingId={readingId}
          drawnCards={draw.drawnCards}
          accent={SPREAD_INFO[draw.spreadType]?.accent ?? "#6B8DD6"}
          onClose={() => setClarifierSheetOpen(false)}
          onDrawn={handleClarifierDrawn}
          onInsufficient={() => {
            setClarifierSheetOpen(false);
            setRechargeUpsellType("clarifier");
            setRechargeSheetOpen(true);
          }}
        />
      )}

      {/* 충전 시트 */}
      {readingId && (
        <RechargeSheet
          open={rechargeSheetOpen}
          returnTo={`/tarot/reading?id=${readingId}`}
          pendingUpsell={
            readingId
              ? { readingId, type: rechargeUpsellType }
              : undefined
          }
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
              충전 완료!{" "}
              {pendingResumeBanner.type === "clarifier"
                ? "이어서 뽑을까?"
                : "이어갈까?"}
            </p>
            <button
              onClick={() => {
                const type = pendingResumeBanner.type;
                sessionStorage.removeItem("byeolkong:pending_upsell");
                setPendingResumeBanner(null);
                if (type === "clarifier") {
                  setClarifierSheetOpen(true);
                } else {
                  void handleExtendTap();
                }
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
