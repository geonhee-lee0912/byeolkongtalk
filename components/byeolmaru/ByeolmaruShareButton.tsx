"use client";

// components/byeolmaru/ByeolmaruShareButton.tsx — 별마루 하루 화면(오늘 사주·오늘 카드)의 공유.
// 결과 화면과 같은 모양: '공유하기' 버튼 하나 → 시트에서 카카오톡 · 링크로 공유 · 이미지 저장
// (디자인 다듬기 별마루 ⑧ K2, 운영자 11-21. 예전엔 카톡 하나뿐인 '오늘 사주/카드 공유하기' 버튼이 두 탭에서 모양이 달랐다).
// 시트 칸·아이콘은 타로 결과(TarotShareButtons)의 것을 그대로 쓴다.
// 🔴 계측 `byeolmaru_share_clicked` 는 **고른 순간** 찍는다(시트를 연 순간이 아니다) — 예전 카톡 버튼과 같은 자리.
//    meta.kind(saju|tarot)는 그대로(어드민 별마루 '공유'가 이 축으로 쪼갠다), 고른 길을 meta.channel(kakao|link|image)로 더했다.
//    예전 값은 전부 카톡이었으니 channel 이 없는 옛 행 = kakao.
import { useState } from "react";
import { shareToKakao, isKakaoReady } from "@/lib/kakao-share";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { isShareCancel } from "@/lib/share-cancel";
import Sheet from "@/components/common/Sheet";
import { ShareOption, SHARE_ICON, KAKAO_ICON, LINK_ICON, SAVE_ICON } from "@/components/tarot/TarotShareButtons";

export interface ByeolmaruShare {
  title: string;
  description: string;
  /** 카톡 카드 그림 = 저장할 그림 */
  imageUrl: string;
  /** 받는 사람이 열 곳(utm 포함) */
  link: string;
  buttonTitle: string;
}

export default function ByeolmaruShareButton({ kind, share }: { kind: "saju" | "tarot"; share: ByeolmaruShare }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };
  const track = (channel: "kakao" | "link" | "image", ok: boolean) =>
    trackUiEvent("byeolmaru_share_clicked", { meta: { kind, channel, ok } });

  const kakao = () => {
    const ok = shareToKakao(share);
    track("kakao", ok);
    if (!ok) say("카카오 SDK 가 아직 준비 안 됐어");
  };

  // 모바일은 기기 공유창, 아니면(또는 취소·미지원) 링크 복사 — 운세 결과와 같은 순서
  const link = async () => {
    const isMobile =
      typeof navigator !== "undefined" &&
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints ?? 0) > 1);
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: share.title, text: share.description, url: share.link });
        track("link", true);
        return;
      } catch (e) {
        if (isShareCancel(e)) return;
        /* 그 밖의 실패 — 링크 복사로 */
      }
    }
    try {
      await navigator.clipboard.writeText(share.link);
      track("link", true);
      say("링크를 복사했어");
    } catch {
      track("link", false);
      say("복사를 못 했어");
    }
  };

  const save = async () => {
    try {
      const res = await fetch(share.imageUrl);
      if (!res.ok) throw new Error("og_failed");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `byeolmaru-${kind}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      track("image", true);
      say("이미지를 저장했어");
    } catch {
      track("image", false);
      say("이미지 저장에 실패했어");
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary btn-lg gap-2">
        {SHARE_ICON}
        공유하기
      </button>
      {open && (
        <Sheet label="공유하기" onClose={() => setOpen(false)} z={80}>
          <p className="mb-[22px] text-center font-display text-17 text-eye-purple">어디로 공유할까?</p>
          <div className="grid grid-cols-3">
            <ShareOption icon={KAKAO_ICON} label="카카오톡" circleClass="bg-[#FEE500] text-[#3C1E1E]" disabled={!isKakaoReady()} onPick={kakao} />
            <ShareOption icon={LINK_ICON} label="링크로 공유" circleClass="bg-lilac-soft text-eye-purple" onPick={() => void link()} />
            <ShareOption icon={SAVE_ICON} label="이미지 저장" circleClass="bg-lilac-soft text-eye-purple" onPick={() => void save()} />
          </div>
        </Sheet>
      )}
      {toast && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-night px-3 py-2 text-12 text-white shadow-float">
          {toast}
        </div>
      )}
    </div>
  );
}
