"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { StarGraph } from "@/lib/byeoljari/types";
import ConstellationView from "@/components/byeoljari/ConstellationView";
import BirthdaySelect from "@/components/byeoljari/BirthdaySelect";
import { RELATION_TYPE_LABEL } from "@/lib/byeoljari/display";
import { buildInviteUrl } from "@/lib/byeoljari/invite-link";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import FreeToPaidCta from "@/components/upsell/FreeToPaidCta";
import { LINK_ICON } from "@/components/tarot/TarotShareButtons";

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
  const joinRef = useRef<HTMLDivElement>(null);

  // 참여 칸은 지도 아래에 열리는데 버튼은 화면 아래 고정이라, 열리면 그 칸으로 데려간다(⑦ K1)
  useEffect(() => {
    if (showJoin) joinRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showJoin]);

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

          {showJoin && (
            <div ref={joinRef} className="card mt-4 space-y-2 scroll-mt-20">
              <input
                className="w-full rounded-lg border border-lilac bg-white px-3 py-2"
                placeholder="내 이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <BirthdaySelect value={birth} onChange={setBirth} />
              <div>
                <p className="mb-1 text-12 text-text-light">별자리 주인과 어떤 사이야?</p>
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
                            ? "rounded-full bg-accent px-3 py-1 text-12 text-white"
                            : "rounded-full border border-lilac-soft bg-white px-3 py-1 text-12 text-text-light"
                        }
                      >
                        {RELATION_TYPE_LABEL[rt]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-14 text-text-light">
                <input
                  type="checkbox"
                  checked={namePublic}
                  onChange={(e) => setNamePublic(e.target.checked)}
                  className="h-4 w-4 accent-lilac-deep"
                />
                별자리에 내 이름 보이기
              </label>
              {joinError && (
                <p className="text-12 text-red-500 text-center">{joinError}</p>
              )}
              <button
                disabled={busy || !name || !birth}
                onClick={join}
                className="btn btn-primary btn-lg"
              >
                내 별 놓기
              </button>
              <p className="text-11 text-text-light text-center leading-relaxed">
                만 14세 이상만 참여할 수 있어. 생년월일은 별자리 계산에만 쓰이고
                다른 사람에게 보이지 않아. 내 별을 놓으면{" "}
                <Link href="/privacy" className="underline">
                  개인정보처리방침
                </Link>
                에 동의한 것으로 간주돼.
              </p>
            </div>
          )}

          <p className="mt-6 text-center text-12 text-text-light">
            로그인하면 이 별자리를 계속 볼 수 있어. 안 하면 이 기기에서만 보여.
          </p>
          {/* 방문자(공유로 들어온 사람)에게만 별마루 유도 — 주인은 자기 별자리라 CTA 불필요(형제 버튼과 동일 가드). */}
          {!state.graph.viewerIsOwner && (
            <Link href="/byeolmaru" className="mt-2 block text-center text-12 text-accent">
              별마루에서 무료로 다 보기
            </Link>
          )}

          <FreeToPaidCta
            title="이 인연, 더 깊이 볼래?"
            chat={{ label: "이 관계, 타로로 물어볼래?", tagline: "지금 그 사람 마음이 궁금하면, 타로 카드 뽑아 별콩이랑 바로 상담해봐" }}
            products={["love_self", "compat"]}
            source="byeoljari"
            bare
          />

          {/* 아래 탭 위 고정 버튼 하나 — 방문자는 '이 별자리에 내 별 놓기', 주인·멤버는 '친구 초대하기'(디자인 다듬기 인연 별자리 ⑦ K1·⑧ I1, 운영자 11-20).
              예전엔 둘 다 목록 맨 아래였고, 초대는 다른 주 버튼보다 옅은 보라에 복사되면 버튼이 초록으로 바뀌었다 → 같은 주 버튼 + 위에 복사 알림.
              방문자가 누르면 지도 아래 참여 칸이 열리고 그리로 스크롤한다 */}
          {(meId || state.graph.viewerIsOwner || !showJoin) && (
            <div className="sticky z-30 bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 mt-6 px-4 py-3 bg-cream shadow-float-up">
              {meId || state.graph.viewerIsOwner ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const url = buildInviteUrl(window.location.origin, shareId);
                      await navigator.clipboard.writeText(url);
                      trackUiEvent("byeoljari_invite_clicked", { meta: { shareId } });
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* clipboard 권한 실패 시 무시 — 사용자가 주소창에서 직접 복사 */
                    }
                  }}
                  className="btn btn-primary btn-lg gap-2"
                >
                  {LINK_ICON}
                  친구 초대하기
                </button>
              ) : (
                <button type="button" onClick={() => setShowJoin(true)} className="btn btn-primary btn-lg">
                  이 별자리에 내 별 놓기
                </button>
              )}
              {copied && (
                <div className="absolute left-1/2 -translate-x-1/2 -top-10 px-3 py-2 rounded-lg bg-night text-white text-12 whitespace-nowrap shadow-float animate-fade-in">
                  링크 복사됨! 친구에게 보내줘
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
