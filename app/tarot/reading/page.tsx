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
import { parseAllRecoMarkers, INCHAT_ONLY_PRODUCTS, type RecoProduct } from "@/lib/reco-utils";
import { setRecoSessionStorage } from "@/lib/reco-nav";
import { chatErrorKr } from "@/lib/consultations/chat-errors";
import { trackUiEvent, countUserTurns } from "@/lib/analytics/ui-events";
import ClarifierChip, { type ClarifierChipState } from "@/components/upsell/ClarifierChip";
import ExtendChip, { type ExtendChipState } from "@/components/upsell/ExtendChip";
import ClarifierSheet, { type ClarifierFailure } from "@/components/upsell/ClarifierSheet";
import PostEndOffers from "@/components/upsell/PostEndOffers";
import RechargeSheet from "@/components/upsell/RechargeSheet";
import { RECHARGE_SOURCE } from "@/lib/analytics/recharge-source";
import { CLARIFIER_COST, EXTEND_COST } from "@/lib/upsell";
import { SPREAD_INFO } from "@/lib/tarot/spreads";
import { getCard } from "@/lib/tarot/cards";
import { parseReopenHeader, stripEndFromLastAssistant, type ReopenOptions } from "@/lib/tarot/reopen";
import { clarifierSyntheticMessage } from "@/lib/tarot/clarifier-message";
import { purchaseRequest } from "@/lib/tarot/purchase-request";
import {
  END_MARKER_REGEX,
  parseIntoBubbles,
  getLatestCardIndex,
  type Bubble,
} from "@/lib/tarot/bubbles";

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
const FINISH_PHRASE_RESULT_ONLY = "결과만 보고 마칠게"; // 첫 풀이 직후 작은 버튼 경유 (시안 B, 계측 구분용 — spec 2026-10-04 §3-6)
// 재개 제안 없음 — 한 참조를 공유해 setReopen 이 같은 값으로 불필요한 리렌더를 만들지 않는다
const NO_REOPEN: ReopenOptions = { extend: false, clarifier: false };
// 409(다른 구매가 처리 중) 뒤 서버 상태를 다시 읽기까지 — 바로 읽으면 그 요청이 반쯤 끝난 상태를 붙잡는다
const RESYNC_DELAY_MS = 1500;
// [CARD:n] 버블 파싱 — result 다시보기와 공유 (lib/tarot/bubbles)

// 첫 답 마무리 안내 한 줄의 인라인 SVG — 저장소에 아이콘 라이브러리가 없다
/** 4꼭지 금색 별(앱의 별 모티프) — 안내 문구 앞 */
function HintStar() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="#E8C26A" aria-hidden="true" className="shrink-0">
      <path d="M12 2l3.4 6.6L22 12l-6.6 3.4L12 22l-3.4-6.6L2 12l6.6-3.4L12 2z" />
    </svg>
  );
}

/** 작은 › — 결과만 볼래 버튼 끝 */
function ChevronRight() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
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
  // 강제 종료선에서 닫힌 대화의 재개 제안 — 서버 판정(X-Reopen 헤더·GET reopen)을 그대로 따른다
  const [reopen, setReopen] = useState<ReopenOptions>(NO_REOPEN);
  const offerShownRef = useRef<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 스트림이 도중에 끊긴(overloaded_error 등 일시적 upstream 실패) 턴을 그대로 담아둔다.
  // 이 턴은 서버가 DB 에 저장하지 않아 유실되므로, 유저가 재입력 없이 원탭으로 재전송할 수 있게
  // 마지막으로 실패한 sendMessage 인자를 보존한다. 성공(재)전송 시작 시 즉시 비운다.
  const [retryTurn, setRetryTurn] = useState<{
    history: Message[];
    rid: string;
    opts?: { forceEnd?: boolean; skipSetMessages?: boolean };
  } | null>(null);
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
  // 보조 카드 구매 요청이 서버에 가 있는 동안 — ClarifierSheet 이 알려 준다
  const [clarifierPurchasing, setClarifierPurchasing] = useState(false);
  // 구매 요청이 서버에 가 있는 동안엔 전송·마무리·다른 구매를 막는다 — 턴이 구매와 겹치면 강제 종료선 판정이 구매 반영 전/후로 갈려 [END] 가 경합한다
  const purchasing = extendState === "loading" || clarifierPurchasing;
  // 구매 흐름 중 — 요청이 가 있거나 보조 카드 시트가 열려 있다. 이 사이엔 마무리·재전송도 막고 전송 대기 조각은 미룬다
  const inPurchaseFlow = purchasing || clarifierSheetOpen;
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
  // W3 출구 nudge — 출구 칩 노출 상태
  const [exitOffer, setExitOffer] = useState(false);
  // 노출 계측 1회 발사 가드. 유저가 다시 말하면 idleStage 가 0 으로 리셋돼 칩이 재노출될 수
  // 있는데, 그때마다 찍으면 count(*) 가 부풀어 "노출 대비 클릭률"이 다시 오독된다.
  // 마운트 1개 = 리딩 1개라 ref 하나로 충분하다
  const exitShownLoggedRef = useRef(false);

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
            applyServerConversation(msgs, d.reopen);
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
    const allRecoMarkers = parseAllRecoMarkers(finalContent);

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
    setRetryTurn(null);

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
            .map((m) => ({ role: m.role, content: m.content }))
            // 최근 40개(약 20왕복)만 전송 — 카드 맥락은 서버 systemMessage 라 손실 없음.
            // 이래야 긴 대화가 서버 MAX_MESSAGES 상한에 걸려 영구 차단되지 않는다.
            .slice(-40),
          forceEnd,
        }),
      });
      if (!r.ok || !r.body) {
        const data = await r.json().catch(() => ({}));
        setError(chatErrorKr(data?.error));
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
      // 강제 종료선 종료 턴이면 재개 제안 자격을 서버가 헤더로 준다 (spec §3-4) — 헤더 없음 = 해당 없음
      setReopen(parseReopenHeader(r.headers.get("X-Reopen")) ?? NO_REOPEN);

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
      // 이 턴은 서버 미저장으로 유실됐다 — 재입력 없이 원탭 재전송할 수 있게 그대로 보존.
      setRetryTurn({ history, rid, opts });
      // 스트림 실패 시 직행 예약 해제 — 이후 일반 턴의 [END]가 예상 밖 점프를 만들지 않게
      pendingRecoJumpRef.current = null;
    }
  }

  // 실패한 턴을 동일 인자로 재전송(유저 메시지 버블은 화면에 남아 있어 재입력 불필요).
  function retrySend() {
    const t = retryTurn;
    if (!t || inPurchaseFlow) return;
    setRetryTurn(null);
    void sendMessage(t.history, t.rid, t.opts);
  }

  function flushPending() {
    if (pendingFragmentsRef.current.length === 0) return;
    if (input.trim()) return; // 입력창에 글자 남아있으면 보류 (다음 활동 때 재무장)
    if (isStreaming || isEnded || !readingId) return;
    // 구매 중이거나 보조 카드 시트가 열려 있으면 보내지 않고 잠시 뒤 다시 본다 — 턴이 구매와 겹치면 강제 종료선 판정이 구매 반영 전/후로 갈린다
    if (inPurchaseFlow) {
      armFlushTimer();
      return;
    }

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
      // 출구 칩 — 첫 턴부터 노출 (2026-07-26 P0-2: 1턴 만족 이탈도 결과 화면을 경유하도록
      // wrapMode 게이트 제거. 근거: 결과 미도달 47.4% + 1턴 시점 마무리 안내 0)
      idleStageRef.current = 3; // 종료 — 더는 무장하지 않음
      pushNudge(EXIT_NUDGE);
      setExitOffer(true);
      // 노출 계측 — "칩이 안 떴다" vs "떴는데 안 눌렀다" 를 가르는 유일한 신호
      if (!exitShownLoggedRef.current) {
        exitShownLoggedRef.current = true;
        trackUiEvent("exit_chip_shown", {
          readingId,
          meta: {
            surface: "tarot",
            turns: countUserTurns(messagesRef.current),
            spread: draw?.spreadType ?? null,
          },
        });
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
    if (!text || isStreaming || isEnded || !readingId || purchasing) return;
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

  // 인챗 제안 계측 — 리딩·상품·지면당 노출 1회 (spec §3-7). 마운트 단위는 Set, 같은 탭의 새로고침·재진입은 sessionStorage 로 막는다
  const trackOfferShown = (product: "clarifier" | "extend", surface: "chat" | "postend") => {
    if (!readingId) return;
    const key = `${product}:${surface}`;
    if (offerShownRef.current.has(key)) return;
    offerShownRef.current.add(key);
    // 저장소가 막힌 환경(시크릿·차단)에선 읽기·쓰기가 던진다 — 그땐 마운트당 1회로 폴백
    const storageKey = `byeolkong_offer_shown:${readingId}:${key}`;
    try {
      if (sessionStorage.getItem(storageKey) !== null) return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // 무음
    }
    trackUiEvent("inchat_offer_shown", { readingId, meta: { product, surface } });
  };
  const trackOfferClicked = (product: "clarifier" | "extend", surface: "chat" | "postend") => {
    trackUiEvent("inchat_offer_clicked", { readingId, meta: { product, surface } });
  };

  // 서버가 가진 대화를 화면에 반영 — 이어하기 복원과 구매 실패 뒤 재동기화(resyncFromServer)가 같은 경로를 쓴다
  function applyServerConversation(msgs: Message[], serverReopen: ReopenOptions | undefined) {
    setMessages(msgs);
    const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
    setIsEnded(!!lastAssistant && END_MARKER_REGEX.test(lastAssistant.content));
    END_MARKER_REGEX.lastIndex = 0;
    // 강제 종료선에서 닫힌 대화면 재개 가능한 상품을 서버가 판정해 준다 (spec §3-4)
    setReopen(serverReopen ?? NO_REOPEN);
    // RECO 마커 감지 — product별 최초 등장 인덱스 기록(서버 메시지 기준이라 통째로 다시 만든다)
    const restored: Partial<Record<RecoProduct, number>> = {};
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].role !== "assistant") continue;
      for (const p of parseAllRecoMarkers(msgs[i].content)) {
        if (p === "continue") continue;
        if (restored[p] === undefined) restored[p] = i;
      }
    }
    setRecoAttach(restored);
    // 마지막 대화가 보이도록 하단으로 스크롤
    setTimeout(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
    }, 120);
  }

  // 구매가 실패했거나 응답을 못 받았을 때 — 화면이 서버와 어긋났을 수 있다(다른 탭·늦게 온 요청·응답 유실).
  // 서버 상태를 다시 받아 이어하기 복원과 같은 경로로 반영한다. best-effort — 실패하면 이미 띄운 오류 문구만 남는다.
  // 서버가 가진 카드 목록(GET 실패면 null)을 돌려준다 — 대화 반영을 건너뛴 경우에도 준다(settleUnknownClarifier 가 카드가 더 붙었는지 본다)
  async function resyncFromServer(): Promise<TarotDrawResult["drawnCards"] | null> {
    if (!readingId) return null;
    const before = messagesRef.current;
    try {
      const r = await fetch(`/api/readings/${readingId}`, { cache: "no-store" });
      if (!r.ok) return null;
      const d = await r.json();
      const cards = (d.reading?.drawnCards ?? null) as TarotDrawResult["drawnCards"] | null;
      // 기다리는 사이 대화가 움직였으면(내 말 추가·전송 대기·답 출력 중) 이 응답은 낡았다 — 덮어쓰면 진행 중인 버블이 사라진다
      if (messagesRef.current !== before || pendingFragmentsRef.current.length > 0 || typingIntervalRef.current) return cards;
      const msgs = (d.messages ?? []) as Message[];
      if (msgs.length === 0) return cards;
      applyServerConversation(msgs, d.reopen);
      // 보조 카드가 서버에만 붙었을 수 있다(응답 유실) — 카드 판과 시트의 제외 목록도 서버 기준으로 맞춘다
      if (cards && cards.length > 0) setDraw((prev) => (prev ? { ...prev, drawnCards: cards } : prev));
      return cards;
    } catch {
      // 재동기화 실패는 무음 — 이미 보여 준 오류 문구가 남는다
      return null;
    }
  }

  // 구매가 402(잔액 부족) 말고 실패했을 때 — 서버 상태로 다시 맞춘다. 재개 불가로 끝난 대화(reading_already_ended)면
  // 재동기화가 실패해도 죽은 재개 버튼이 남지 않게 버튼부터 거둔다
  const handlePurchaseFailed = (code?: string) => {
    if (code === "reading_already_ended") setReopen(NO_REOPEN);
    // 409 는 다른 요청이 한창 처리 중이다 — 바로 읽으면 그 요청이 반쯤 끝난 상태(예: [END] 만 걷힌 채)를 붙잡으니 잠시 뒤에 본다
    if (code === "purchase_in_progress") setTimeout(() => void resyncFromServer(), RESYNC_DELAY_MS);
    else void resyncFromServer();
  };

  // 서버가 끝난 대화를 다시 열었다 — 입력창 복귀 + 화면·ref 히스토리의 [END] 정리(모델에 '이미 끝났다'를 다시 보내지 않게)
  function reopenChatLocally() {
    messagesRef.current = stripEndFromLastAssistant(messagesRef.current);
    setMessages((prev) => stripEndFromLastAssistant(prev));
    setIsEnded(false);
    setReopen(NO_REOPEN);
  }

  // ExtendChip 탭 핸들러
  const handleExtendTap = async () => {
    // 답이 출력되는 동안(서버는 [END] 를 먼저 저장하고 화면은 한 글자씩 따라온다)·다른 구매 중엔 막는다 — 그 사이 산 구매는 종료 판정과 어긋난다.
    // "done" 은 막지 않는다: 한도는 서버 슬롯 CAS 가 지킨다(칩은 done 이면 스스로 비활성)
    if (!readingId || isStreaming || purchasing) return;
    setExtendState("loading");
    try {
      const { status, ok, data } = await purchaseRequest<{ error?: string; reopened?: boolean }>(
        `/api/readings/${readingId}/extend`,
        { method: "POST" },
      );
      if (status === 402) {
        setExtendState("idle");
        setRechargeUpsellType("extend");
        setRechargeSheetOpen(true);
        return;
      }
      if (!ok) {
        const code = data.error;
        setError(
          code === "extend_limit_reached"
            ? "이미 연장했어. 더 연장은 안 돼"
            : code === "reading_already_ended"
            ? "이 대화는 이미 마무리됐어"
            : code === "purchase_in_progress"
            ? "다른 곳에서 처리 중이야. 잠깐 뒤에 다시 확인해줘"
            : "연장이 안 됐어. 잠시 후 다시 시도해줄래?"
        );
        setExtendState("idle");
        handlePurchaseFailed(code);
        return;
      }
      setExtendState("done");
      setError(null); // 앞선 실패 문구가 성공 뒤에도 남지 않게
      // 서버가 끝난 대화를 다시 열었다(reopened)거나 화면이 끝난 상태였다면 입력창을 되살린다
      if (isEnded || data.reopened === true) reopenChatLocally();
    } catch {
      // 끊김·시간 초과(PURCHASE_TIMEOUT_MS) — 요청은 서버에 닿았는데 응답만 잃었을 수 있다(결과를 모른다): 서버 상태를 다시 확인한다
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      setExtendState("idle");
      handlePurchaseFailed();
    }
  };

  // ClarifierSheet onDrawn — drawnCards 갱신 + synthetic user 턴 전송
  const handleClarifierDrawn = (newDrawnCards: TarotDrawResult["drawnCards"], reopened = false) => {
    if (!draw || !readingId) return;
    // 서버가 끝난 대화를 다시 열었다(reopened)거나 화면이 끝난 상태였다면 입력창을 되살린다 — 아래 synthetic 턴이 정리된 히스토리를 읽는다
    if (isEnded || reopened) reopenChatLocally();
    // draw state 갱신 (CardSpreadView 반영)
    setDraw((prev) => prev ? { ...prev, drawnCards: newDrawnCards } : prev);
    setClarifierState("done");
    // synthetic user 턴 자동 전송 — 카드 이름 명시 (모델이 "안 보인다"고 불신하지 않게)
    const newCard = newDrawnCards[newDrawnCards.length - 1];
    const cardInfo = newCard ? getCard(newCard.card_id) : null;
    const cardDesc = cardInfo
      ? `'${cardInfo.name_kr}' (${newCard.direction === "reversed" ? "역방향" : "정방향"})`
      : "카드 한 장";
    const syntheticMsg = clarifierSyntheticMessage(cardDesc);
    // 시트가 열려 있는 동안 전송이 보류된 말(대기 조각)이 있으면 이 턴에 함께 싣는다 — handleFinish 와 같은 방식이다: 큐를 비우고,
    // 조각 앞 스냅샷(baseHistoryRef)에 합친 한 턴으로 보낸다. 안 그러면 sendMessage 가 타이머만 지우고 조각은 큐에 남아
    // (유휴 멘트·출구 칩·재동기화가 '대기 중'이라며 건너뛰고, 다음 전송이 낡은 스냅샷에 옛 말을 다시 합쳐 보낸다) 이번 카드 턴이 이력에서 빠진다.
    // 서버는 마지막 유저 말 하나만 저장·분류하니 따로 보내면 앞 조각이 DB 에서 빠지고, 합쳐도 꼬리가 synthetic 이라 asking 이다
    // (clarifier-merged-turn.test.ts). ⑦(synthetic 와 정확히 일치)은 강제 종료선에서 다시 연 턴 전용인데 그 턴엔 대기 조각이 없다(끝난 대화엔 입력창이 없다).
    const queued = [...pendingFragmentsRef.current];
    const base = queued.length > 0 ? baseHistoryRef.current : messagesRef.current;
    pendingFragmentsRef.current = [];
    const newHistory: Message[] = [
      ...base.filter((m) => !m.ephemeral),
      { role: "user", content: [...queued, syntheticMsg].join("\n") },
    ];
    void sendMessage(newHistory, readingId, { skipSetMessages: true });
    setMessages((prev) => [...prev, { role: "user", content: syntheticMsg }]);
    suppressScrollUntilRef.current = Date.now() + 1500;
  };

  // 보조 카드 구매 결과를 모른다(응답 유실·타임아웃·5xx) — 서버엔 카드가 붙었을 수 있다. 그대로 두면 '다시 시도' 가 한 장을 더 사게 되니,
  // 서버 기준으로 카드가 시도 전보다 많으면 성공으로 본다: 시트를 닫고 onDrawn 과 같은 경로로 카드 풀이 턴을 잇는다.
  // 카드가 그대로면 안 산 것이니 재동기화만 한 셈이고 다시 시도해도 안전하다
  const settleUnknownClarifier = async () => {
    const before = draw?.drawnCards.length ?? 0; // 시도를 시작할 때의 카드 수 — 이 클로저는 그때 만들어졌다
    const cards = await resyncFromServer();
    // 그새 답이 나오기 시작했으면(시트를 닫고 마무리를 눌렀다 등) 카드 턴을 겹쳐 보내지 않는다 — 스트림 상태가 섞인다
    if (!cards || cards.length <= before || typingIntervalRef.current) return;
    setClarifierSheetOpen(false);
    setError(null);
    handleClarifierDrawn(cards);
  };

  // ClarifierSheet onFailed — 402 말고 구매가 실패했을 때
  const handleClarifierFailed = (f: ClarifierFailure) => {
    if (f.unseenMessage) setError(f.unseenMessage); // 시트를 닫은 뒤라 유저가 못 본 문구를 페이지에 보인다
    if (f.unknown) void settleUnknownClarifier();
    else handlePurchaseFailed(f.code);
  };

  const handleFinish = (phrase: string = FINISH_PHRASE) => {
    if (isStreaming || isEnded || !readingId || inPurchaseFlow) return;
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

  // 별콩이 답이 1개뿐인 동안(첫 풀이 직후 ~ 두 번째 답 도착 전) — 금색 마무리 버튼 대신 작은 링크를 보인다(시안 B, spec §3-6)
  const isFirstAnswerOnly = messages.filter((m) => m.role === "assistant" && !m.ephemeral).length < 2;

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
                      // 인챗 전용 칩 — 끝난 대화엔 안 띄운다(강제 종료선 재개는 하단 PostEndOffers 가 맡고, 그 밖의 종료는 구매가 400)
                      if (isEnded) return null;
                      if (product === "tarot:clarifier") {
                        return (
                          <ClarifierChip
                            key={product}
                            state={clarifierState}
                            disabled={isStreaming || purchasing}
                            onShown={() => trackOfferShown("clarifier", "chat")}
                            onTap={() => {
                              trackOfferClicked("clarifier", "chat");
                              setClarifierSheetOpen(true);
                            }}
                          />
                        );
                      }
                      if (product === "extend") {
                        return (
                          <ExtendChip
                            key={product}
                            state={extendState}
                            disabled={isStreaming || purchasing}
                            onShown={() => trackOfferShown("extend", "chat")}
                            onTap={() => {
                              trackOfferClicked("extend", "chat");
                              void handleExtendTap();
                            }}
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
                  onClick={() => {
                    // 발사 후 망각 — 실패해도 아래 종료 흐름을 막지 않는다
                    trackUiEvent("exit_chip_clicked", {
                      readingId,
                      meta: {
                        surface: "tarot",
                        turns: countUserTurns(messages),
                      },
                    });
                    handleFinish(FINISH_PHRASE_EXIT);
                  }}
                  // 구매 흐름 중엔 handleFinish 가 아무것도 안 한다 — 눌러서 exit_chip_clicked 만 찍히지 않게 잠근다
                  disabled={inPurchaseFlow}
                  className="px-4 py-2 rounded-full bg-gold text-night font-bold text-[12.5px] shadow-[0_2px_8px_rgba(232,194,106,0.45)] animate-fade-in disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="text-center mt-2">
                <p className="text-[12px] text-red-500">{error}</p>
                {retryTurn && (
                  <button
                    type="button"
                    onClick={retrySend}
                    disabled={inPurchaseFlow}
                    className="mt-1.5 inline-block text-[12px] font-bold text-lilac-deep underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    다시 시도
                  </button>
                )}
              </div>
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
              <PostEndOffers
                extend={reopen.extend}
                clarifier={reopen.clarifier}
                busy={extendState === "loading" ? "extend" : clarifierPurchasing ? "clarifier" : null}
                onShown={(p) => trackOfferShown(p, "postend")}
                onExtend={() => {
                  trackOfferClicked("extend", "postend");
                  void handleExtendTap();
                }}
                onClarifier={() => {
                  trackOfferClicked("clarifier", "postend");
                  setClarifierSheetOpen(true);
                }}
              />
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
                    disabled={isStreaming || !input.trim() || !readingId || purchasing}
                    className="shrink-0 h-[44px] px-4 rounded-xl bg-lilac-deep text-white font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    전송
                    <span className="text-[11px] font-normal text-white/70">
                      {input.length}/500
                    </span>
                  </button>
                </div>
                {isFirstAnswerOnly ? (
                  // 시안 B — 첫 풀이 직후 종료가 41% 라 금색 버튼 대신 안내 한 줄 + 오른쪽 작은 버튼.
                  // 안내는 truncate(min-w-0)라 320px 에서도 버튼을 밀어내지 않는다. 하단 바는 흰 배경이라 text-light 를 쓴다
                  <div className="flex items-center justify-between gap-2.5">
                    <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-light">
                      <HintStar />
                      <span className="truncate">궁금한 건 이어서 물어봐도 돼</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => handleFinish(FINISH_PHRASE_RESULT_ONLY)}
                      disabled={isStreaming || !readingId || inPurchaseFlow}
                      className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap py-1.5 text-[12px] font-bold text-eye-purple disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      결과만 볼래
                      <ChevronRight />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleFinish()}
                    disabled={isStreaming || !readingId || inPurchaseFlow}
                    className="w-full py-2.5 rounded-xl font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#ffe29e", color: "#48464d" }}
                  >
                    대화 마무리하고 결과 확인하기
                  </button>
                )}
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
          onPurchasingChange={setClarifierPurchasing}
          onFailed={handleClarifierFailed}
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
          source={RECHARGE_SOURCE.inchat}
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
              disabled={isStreaming || purchasing}
              className="shrink-0 px-3 py-1.5 bg-lilac-deep text-white rounded-full text-[12px] font-bold hover:bg-lilac-deep/90 disabled:opacity-50 disabled:cursor-not-allowed"
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
