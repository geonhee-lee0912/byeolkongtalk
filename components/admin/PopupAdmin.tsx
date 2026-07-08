// components/admin/PopupAdmin.tsx — 전체 발송 폼 + 발송 목록/미리보기/회수 (client).
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PopupComposer } from "./PopupComposer";
import PopupCard from "@/components/popup/PopupCard";

export interface PopupRow {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  broadcast: boolean;
  targetUserId: string | null;
  createdAt: string;
  ackCount: number;
}

export function PopupAdmin({
  popups,
  totalUsers,
}: {
  popups: PopupRow[];
  totalUsers: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [previewRow, setPreviewRow] = useState<PopupRow | null>(null);

  async function sendBroadcast(p: {
    title: string;
    body?: string;
    imageUrl?: string;
  }): Promise<boolean> {
    const res = await fetch("/api/admin/popups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!res.ok) {
      alert(
        "실패: " + ((await res.json().catch(() => ({}))).error ?? res.status)
      );
      return false;
    }
    router.refresh();
    return true;
  }

  async function revoke(id: string, popupTitle: string) {
    if (
      !confirm(
        `"${popupTitle}" 팝업을 회수할까요? 아직 안 본 유저에게도 더 이상 노출되지 않습니다.`
      )
    )
      return;
    setBusy(true);
    const res = await fetch(`/api/admin/popups/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      alert(
        "실패: " + ((await res.json().catch(() => ({}))).error ?? res.status)
      );
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-xl bg-white/5 p-4">
        <div className="text-sm font-bold">전체 발송</div>
        <PopupComposer
          submitLabel="전 유저에게 발송"
          confirmMessage="전체 발송입니다. 모든 로그인 유저에게 노출됩니다. 보낼까요?"
          onSubmit={sendBroadcast}
        />
        <p className="text-[11px] text-white/40">
          개별 발송은 사용자 상세 화면에서 할 수 있어요.
        </p>
      </div>

      <div>
        <div className="text-sm text-white/60 mb-2">
          발송 목록 ({popups.length})
        </div>
        {popups.length === 0 ? (
          <p className="text-sm text-white/40">발송한 팝업 없음</p>
        ) : (
          <ul className="text-sm space-y-2">
            {popups.map((p) => (
              <li key={p.id} className="rounded bg-white/5 px-3 py-2 space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="font-bold">
                    {p.broadcast ? "📢 전체" : "👤 개별"} ·{" "}
                    {p.imageUrl ? "🖼 " : ""}
                    {p.title}
                  </span>
                  <span className="flex gap-2 shrink-0 text-[12px]">
                    <button
                      onClick={() => setPreviewRow(p)}
                      className="text-white/70 hover:text-white"
                    >
                      미리보기
                    </button>
                    <button
                      onClick={() => revoke(p.id, p.title)}
                      disabled={busy}
                      className="text-red-300 hover:text-red-200"
                    >
                      회수
                    </button>
                  </span>
                </div>
                {p.body && (
                  <div className="text-white/60 whitespace-pre-wrap line-clamp-2">
                    {p.body}
                  </div>
                )}
                <div className="text-[11px] text-white/40 flex justify-between">
                  <span>
                    확인 {p.ackCount}
                    {p.broadcast ? ` / ${totalUsers}` : " / 1"}
                    {!p.broadcast && p.targetUserId
                      ? ` · 대상 ${p.targetUserId.slice(0, 8)}…`
                      : ""}
                  </span>
                  <span>{new Date(p.createdAt).toLocaleString("ko-KR")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {previewRow && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6 bg-night/60"
          onClick={() => setPreviewRow(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
            <PopupCard
              content={{
                title: previewRow.title,
                body: previewRow.body,
                imageUrl: previewRow.imageUrl,
              }}
              onConfirm={() => setPreviewRow(null)}
            />
            <p className="text-center text-[11px] text-white/50 mt-2">
              미리보기 — 확인 버튼을 누르면 닫힙니다
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
