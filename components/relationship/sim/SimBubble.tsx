"use client";
// components/relationship/sim/SimBubble.tsx — 인형(상대) 대사 버블 + 페르소나 교정 피드백(👍/👎).
// 👍/👎 → 팝업(모달)에서 "실제 성격 / 왜 걔답거나 안 걔다운지" 한 칸 서술 → personality 누적(다음 턴 반영).
// 별콩이 각인 없음(ByeolkongNote 와 구분). onFeedback 없으면(스트리밍 live) 버튼 미표시.
import { useState } from "react";

export default function SimBubble({
  content,
  streaming,
  onFeedback,
}: {
  content: string;
  streaming?: boolean;
  /** (kind, note) → 저장 성공 여부. note 빈 문자열이면 호출부(👍 건너뛰기)가 서버를 부르지 않으므로 여기 도달 X. */
  onFeedback?: (kind: "up" | "down", note: string) => Promise<boolean>;
}) {
  const [modal, setModal] = useState<null | "up" | "down">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "up" | "down">(null);
  const [error, setError] = useState(false);

  function open(kind: "up" | "down") {
    setModal(kind);
    setNote("");
    setError(false);
  }
  function close() {
    if (busy) return;
    setModal(null);
    setNote("");
    setError(false);
  }
  // 👍인데 입력 없이 넘어가기 → 서버 무호출 로컬 완료.
  function skipUp() {
    setDone("up");
    setModal(null);
    setNote("");
  }

  async function submit() {
    if (busy || !modal) return;
    const t = note.trim();
    if (modal === "down" && !t) return; // 👎는 교정 필수
    if (modal === "up" && !t) { skipUp(); return; } // 👍 빈 입력 = 건너뛰기
    setBusy(true);
    setError(false);
    const ok = (await onFeedback?.(modal, t)) ?? false;
    setBusy(false);
    if (ok) {
      setDone(modal);
      setModal(null);
      setNote("");
    } else {
      setError(true);
    }
  }

  return (
    <div className="max-w-[82%] self-start">
      <div className="rounded-2xl rounded-tl-sm bg-lilac-soft/90 text-eye-purple px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
        {content}
        {streaming && (
          <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-eye-purple/60 animate-pulse-soft" />
        )}
      </div>

      {onFeedback && !streaming && (
        <div className="mt-1 pl-1">
          {done ? (
            <span className="text-[12px] text-lilac-soft/70">
              {done === "down" ? "반영했어 🌙 다음부터 그렇게 반응할게" : "고마워 🌙"}
            </span>
          ) : (
            <div className="flex gap-2 text-[15px]">
              <button type="button" onClick={() => open("up")} className="text-lilac-soft/70 hover:text-gold-soft" aria-label="이 반응 맞아요">
                👍
              </button>
              <button type="button" onClick={() => open("down")} className="text-lilac-soft/70 hover:text-gold-soft" aria-label="이 반응 달라요">
                👎
              </button>
            </div>
          )}
        </div>
      )}

      {/* 피드백 팝업 — 실제 성격 / 왜 걔답거나 안 걔다운지 한 칸 서술 */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-night-deep/70 px-4 py-6"
          onClick={close}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-lilac-mid/30 bg-night p-5 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-cream-warm font-bold text-[15px] mb-1">
              {modal === "down" ? "이 반응, 실제 걔랑 달라?" : "이 반응이 걔다웠어?"}
            </h3>
            <p className="text-lilac-soft/80 text-[13px] leading-relaxed mb-3">
              {modal === "down"
                ? "실제로는 어떤 사람인지, 이 답이 왜 걔답지 않은지 적어줘. 다음 대화부터 그렇게 반응할게."
                : "어떤 점이 실제 걔다웠는지 적어주면 그 면을 더 살릴게. (건너뛰어도 괜찮아)"}
            </p>
            {/* 어떤 대사에 대한 피드백인지 인용 */}
            <p className="text-lilac-soft/50 text-[12px] italic mb-3 line-clamp-2">“{content}”</p>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value.slice(0, 300));
                if (error) setError(false);
              }}
              rows={3}
              autoFocus
              placeholder={
                modal === "down"
                  ? "예: 사실 낯을 많이 가려서 이렇게 툭툭 대진 않아"
                  : "예: 이렇게 무심한 듯 챙기는 게 딱 걔야"
              }
              className="w-full px-3 py-2.5 rounded-xl bg-night-deep/60 border border-lilac-mid/30 text-cream-warm text-[14px] leading-relaxed placeholder:text-lilac/40 resize-none scrollbar-hide focus:outline-none focus:border-gold/50"
            />
            {error && (
              <p className="text-[12px] text-rose-300 mt-1.5">앗, 지금은 반영이 안 됐어. 잠시 후 다시 시도해줘.</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={modal === "up" ? skipUp : close}
                disabled={busy}
                className="flex-1 rounded-xl py-2.5 text-lilac-soft/70 text-[14px] border border-lilac-mid/25 disabled:opacity-40"
              >
                {modal === "up" ? "건너뛰기" : "취소"}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || (modal === "down" && !note.trim())}
                className="flex-1 rounded-xl py-2.5 bg-gold text-night-deep text-[14px] font-bold disabled:opacity-40"
              >
                {busy ? "반영 중…" : "반영하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
