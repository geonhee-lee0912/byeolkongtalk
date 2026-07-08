// components/admin/PopupComposer.tsx — 팝업 작성 폼 (텍스트/이미지 + 미리보기).
// 전체 발송(PopupAdmin)과 개별 발송(PopupSend)이 공유. 미리보기는 유저 모달과
// 동일한 PopupCard 를 렌더해서 "미리보기 = 실제 노출" 을 보장.
"use client";
import { useState } from "react";
import PopupCard from "@/components/popup/PopupCard";

export function PopupComposer({
  submitLabel,
  confirmMessage,
  onSubmit,
}: {
  submitLabel: string;
  confirmMessage: string;
  /** 성공 시 true 반환 (폼 리셋) */
  onSubmit: (p: {
    title: string;
    body?: string;
    imageUrl?: string;
  }) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"text" | "image">("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const ready =
    !!title.trim() && (mode === "text" ? !!body.trim() : !!imageUrl);

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/popups/upload", {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      alert(
        "업로드 실패: " +
          ((await res.json().catch(() => ({}))).error ?? res.status)
      );
      return;
    }
    setImageUrl((await res.json()).url);
  }

  async function submit() {
    if (!ready || busy) return;
    if (!confirm(confirmMessage)) return;
    setBusy(true);
    const ok = await onSubmit({
      title: title.trim(),
      ...(mode === "text"
        ? { body: body.trim() }
        : { imageUrl: imageUrl! }),
    });
    setBusy(false);
    if (ok) {
      setTitle("");
      setBody("");
      setImageUrl(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-3 text-sm">
        {(
          [
            ["text", "📝 텍스트 팝업"],
            ["image", "🖼 이미지 팝업"],
          ] as const
        ).map(([m, label]) => (
          <label key={m} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            {label}
          </label>
        ))}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={
          mode === "text"
            ? "제목 (최대 100자)"
            : "관리용 라벨 — 유저에겐 안 보임 (목록/alt 용)"
        }
        maxLength={100}
        className="w-full bg-white/10 rounded px-2 py-1.5 text-sm"
      />

      {mode === "text" ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="내용 (최대 2000자)"
          maxLength={2000}
          rows={4}
          className="w-full bg-white/10 rounded px-2 py-1.5 text-sm resize-y"
        />
      ) : (
        <div className="space-y-2">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
            disabled={uploading}
            className="text-sm"
          />
          {uploading && <p className="text-[12px] text-white/50">업로드 중...</p>}
          {imageUrl && (
            <div className="flex items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="첨부 이미지"
                className="max-h-32 rounded border border-white/10"
              />
              <button
                onClick={() => setImageUrl(null)}
                className="text-red-300 hover:text-red-200 text-[12px]"
              >
                제거
              </button>
            </div>
          )}
          <p className="text-[11px] text-white/40">
            png/jpg/webp · 최대 2MB · 유저에겐 이미지 + 확인 버튼만 노출됩니다
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setPreview(true)}
          disabled={!ready}
          className="bg-white/10 px-4 py-1.5 rounded text-sm disabled:opacity-50"
        >
          미리보기
        </button>
        <button
          onClick={submit}
          disabled={busy || uploading || !ready}
          className="bg-gold text-black px-4 py-1.5 rounded text-sm font-bold disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>

      {preview && ready && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6 bg-night/60"
          onClick={() => setPreview(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
            <PopupCard
              content={{
                title,
                body: mode === "text" ? body : null,
                imageUrl: mode === "image" ? imageUrl : null,
              }}
              onConfirm={() => setPreview(false)}
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
