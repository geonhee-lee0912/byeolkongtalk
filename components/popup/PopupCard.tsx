"use client";

import Image from "next/image";

export interface PopupContent {
  title: string;
  body?: string | null;
  imageUrl?: string | null;
}

/**
 * 팝업 카드 — 유저 모달(UserPopupGate)과 어드민 미리보기가 공유하는 단일 렌더.
 * imageUrl 있으면 이미지 팝업(이미지 + 확인 버튼만, title 은 alt/관리용),
 * 없으면 텍스트 팝업(별콩이 + 제목 + 내용).
 */
export default function PopupCard({
  content,
  onConfirm,
  busy = false,
}: {
  content: PopupContent;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const isImage = !!content.imageUrl;
  return (
    <div className="w-full max-w-sm bg-cream rounded-3xl border border-lilac-mid/40 shadow-2xl overflow-hidden">
      {isImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={content.imageUrl!}
          alt={content.title}
          className="w-full h-auto max-h-[70vh] object-contain bg-cream"
        />
      ) : (
        <div className="p-6 pb-0 text-center">
          <div className="flex justify-center mb-3">
            <Image
              src="/byeolkong-main.png"
              alt="별콩이"
              width={72}
              height={72}
            />
          </div>
          <h2 className="font-display text-[20px] text-eye-purple mb-2">
            {content.title}
          </h2>
          <p className="text-[13px] text-text-light leading-relaxed whitespace-pre-wrap text-left">
            {content.body}
          </p>
        </div>
      )}
      <div className="p-5">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="w-full py-3 bg-lilac-deep text-white rounded-full text-[14px] font-bold hover:bg-lilac-deep/90 transition-colors disabled:opacity-60"
        >
          확인했어
        </button>
      </div>
    </div>
  );
}
