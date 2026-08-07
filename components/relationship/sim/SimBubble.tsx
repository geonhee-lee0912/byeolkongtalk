"use client";
// components/relationship/sim/SimBubble.tsx — 인형(상대) 대사 버블 + 페르소나 교정 피드백(👍/👎).
// 별콩이 각인 없음(ByeolkongNote 와 구분). onFeedback 없으면(스트리밍 live) 버튼 미표시.
import { useState } from "react";

export default function SimBubble({
  content,
  streaming,
  onFeedback,
}: {
  content: string;
  streaming?: boolean;
  /** (kind, note) → 저장 성공 여부. note 빈 문자열이면 호출부(👍 스킵)가 서버를 부르지 않으므로 여기 도달 X. */
  onFeedback?: (kind: "up" | "down", note: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<null | "up" | "down">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "up" | "down">(null);
  const [error, setError] = useState(false);

  async function send(kind: "up" | "down") {
    const t = note.trim();
    if (busy) return;
    if (kind === "down" && !t) return; // 👎는 교정 필수
    setBusy(true);
    setError(false);
    let ok = true;
    if (t) ok = (await onFeedback?.(kind, t)) ?? false; // 노트 있으면 서버 반영
    setBusy(false);
    if (ok) {
      setDone(kind);
      setMode(null);
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
          ) : mode ? (
            <div className="mt-1">
              <div className="flex items-end gap-1.5">
              <textarea
                value={note}
                onChange={(e) => { setNote(e.target.value.slice(0, 300)); if (error) setError(false); }}
                rows={2}
                autoFocus
                placeholder={
                  mode === "down"
                    ? "실제 상대는 어떤 사람이야? (예: 사실 낯을 많이 가려)"
                    : "어떤 점이 걔다웠어? (건너뛰기 OK)"
                }
                className="flex-1 px-3 py-2 rounded-xl bg-night/40 border border-lilac-mid/30 text-cream-warm text-[13px] leading-snug placeholder:text-lilac/50 resize-none scrollbar-hide focus:outline-none focus:border-gold/50"
              />
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void send(mode)}
                  disabled={busy || (mode === "down" && !note.trim())}
                  className="rounded-lg px-2.5 py-1.5 bg-gold text-night-deep text-[12px] font-bold disabled:opacity-40"
                >
                  보내기
                </button>
                <button
                  type="button"
                  onClick={() => (mode === "up" ? setDone("up") : setMode(null))}
                  className="rounded-lg px-2.5 py-1 text-lilac-soft/70 text-[12px]"
                >
                  {mode === "up" ? "건너뛰기" : "취소"}
                </button>
              </div>
              </div>
              {error && (
                <p className="text-[11px] text-rose-300 mt-1">앗, 지금은 반영이 안 됐어. 잠시 후 다시 시도해줘.</p>
              )}
            </div>
          ) : (
            <div className="flex gap-2 text-[13px]">
              <button type="button" onClick={() => { setMode("up"); setNote(""); }} className="text-lilac-soft/70 hover:text-gold-soft" aria-label="이 반응 맞아요">
                👍
              </button>
              <button type="button" onClick={() => { setMode("down"); setNote(""); }} className="text-lilac-soft/70 hover:text-gold-soft" aria-label="이 반응 달라요">
                👎
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
