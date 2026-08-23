"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { StarGraph } from "@/lib/byeoljari/types";
import ConstellationView from "@/components/byeoljari/ConstellationView";
import BirthdaySelect from "@/components/byeoljari/BirthdaySelect";
import { RELATION_TYPE_LABEL } from "@/lib/byeoljari/display";

// 관계분류 칩 순서 — display.ts 단일 원천(드리프트 방지, ConstellationView 와 동일 관례).
const RELATION_ORDER = Object.keys(RELATION_TYPE_LABEL);

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; graph: StarGraph };

export default function ByeoljariGuestPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [meId, setMeId] = useState<string | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [relationType, setRelationType] = useState("friend"); // 호스트(별자리 주인)와 나의 관계
  const [namePublic, setNamePublic] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/fortune/byeoljari/${shareId}`);
      const data = await res.json();
      setState(data.ok ? { status: "ready", graph: data as StarGraph } : { status: "error" });
    } catch {
      setState({ status: "error" });
    }
  }, [shareId]);

  useEffect(() => {
    setMeId(localStorage.getItem(`byeoljari:me:${shareId}`));
    load();
  }, [shareId, load]);

  async function join() {
    setBusy(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/fortune/byeoljari/${shareId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name, birthDate: birth, relationType, namePublic }),
      });
      const data = await res.json();
      if (data.ok && data.memberId) {
        localStorage.setItem(`byeoljari:me:${shareId}`, data.memberId);
        setMeId(data.memberId);
        setShowJoin(false);
        await load();
      } else if (data.reason === "full") {
        setJoinError("별자리 인원이 가득 찼어 (최대 20명)");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    // w-full 필수 — body flex-col 안에서 mx-auto(auto 마진)가 stretch 를 무효화해
    // main 이 내용물 폭(shrink-to-fit)이 되고, overview↔포커스 전환마다 지도 폭이 출렁였다
    <main className="mx-auto w-full max-w-md px-4 py-6">
      {state.status === "loading" && (
        <div className="flex h-64 items-center justify-center text-text-light">별자리를 불러오는 중…</div>
      )}
      {state.status === "error" && (
        <div className="flex h-64 items-center justify-center text-text-light">별자리를 찾을 수 없어.</div>
      )}
      {state.status === "ready" && (
        <>
          <ConstellationView graph={state.graph} meId={meId} />

          {!meId && !state.graph.viewerIsOwner && !showJoin && (
            <button
              onClick={() => setShowJoin(true)}
              className="mt-4 w-full rounded-xl bg-lilac-deep py-3 text-white"
            >
              이 별자리에 내 별 놓기
            </button>
          )}
          {/* 주인(이미 멤버)에겐 join 대신 친구 초대(링크 복사) — 친구가 그 링크로 내 별 놓기. */}
          {(meId || state.graph.viewerIsOwner) && (
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* clipboard 권한 실패 시 무시 — 사용자가 주소창에서 직접 복사 */
                }
              }}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-semibold text-white shadow-sm transition active:scale-[0.99] ${
                copied ? "bg-[#3E9E7A]" : "bg-lilac-deep"
              }`}
            >
              {copied ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  링크 복사됨! 친구에게 보내줘
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  친구 초대하기
                </>
              )}
            </button>
          )}
          {showJoin && (
            <div className="mt-4 space-y-2 rounded-2xl bg-cream-warm p-4">
              <input
                className="w-full rounded-lg border border-lilac bg-white px-3 py-2"
                placeholder="내 이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <BirthdaySelect value={birth} onChange={setBirth} />
              <div>
                <p className="mb-1 text-xs text-text-light">별자리 주인과 어떤 사이야?</p>
                <div className="flex flex-wrap gap-2">
                  {RELATION_ORDER.map((rt) => {
                    const on = relationType === rt;
                    return (
                      <button
                        key={rt}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setRelationType(rt)}
                        className={
                          on
                            ? "rounded-full bg-lilac-deep px-3 py-1 text-xs text-white"
                            : "rounded-full border border-lilac-soft bg-white px-3 py-1 text-xs text-text-light"
                        }
                      >
                        {RELATION_TYPE_LABEL[rt]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-text-light">
                <input
                  type="checkbox"
                  checked={namePublic}
                  onChange={(e) => setNamePublic(e.target.checked)}
                  className="h-4 w-4 accent-lilac-deep"
                />
                별자리에 내 이름 보이기
              </label>
              {joinError && (
                <p className="text-[12px] text-red-500 text-center">{joinError}</p>
              )}
              <button
                disabled={busy || !name || !birth}
                onClick={join}
                className="w-full rounded-xl bg-lilac-deep py-3 text-white disabled:opacity-50"
              >
                내 별 놓기
              </button>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-text-light">
            로그인하면 이 별자리를 계속 볼 수 있어. 안 하면 이 기기에서만 보여.
          </p>
        </>
      )}
    </main>
  );
}
