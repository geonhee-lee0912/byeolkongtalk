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
  const [busy, setBusy] = useState(false);

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
    try {
      const res = await fetch(`/api/fortune/byeoljari/${shareId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name, birthDate: birth, relationType }),
      });
      const data = await res.json();
      if (data.ok && data.memberId) {
        localStorage.setItem(`byeoljari:me:${shareId}`, data.memberId);
        setMeId(data.memberId);
        setShowJoin(false);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      {state.status === "loading" && (
        <div className="flex h-64 items-center justify-center text-text-light">별자리를 불러오는 중…</div>
      )}
      {state.status === "error" && (
        <div className="flex h-64 items-center justify-center text-text-light">별자리를 찾을 수 없어.</div>
      )}
      {state.status === "ready" && (
        <>
          <ConstellationView graph={state.graph} meId={meId} />

          {!meId && !showJoin && (
            <button
              onClick={() => setShowJoin(true)}
              className="mt-4 w-full rounded-xl bg-lilac-deep py-3 text-white"
            >
              이 별자리에 내 별 놓기
            </button>
          )}
          {showJoin && (
            <div className="mt-4 space-y-2 rounded-2xl bg-cream-warm p-4">
              <input
                className="w-full rounded-lg border border-lilac px-3 py-2"
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
