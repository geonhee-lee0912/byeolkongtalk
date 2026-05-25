// 카카오톡 피드 공유 헬퍼 — KakaoSdkLoader 가 window.Kakao 를 init 한 상태 전제.
// 사용처: result 페이지의 ShareButtons 의 "카카오톡으로 공유" 클릭.

interface KakaoLikeWindow extends Window {
  Kakao?: {
    isInitialized?: () => boolean;
    Share?: {
      sendDefault: (params: unknown) => void;
    };
  };
}

export function isKakaoReady(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as KakaoLikeWindow;
  return !!(w.Kakao && w.Kakao.isInitialized?.() && w.Kakao.Share?.sendDefault);
}

export interface KakaoSajuShareInput {
  title: string; // 카카오톡 카드 타이틀
  description: string; // 카드 하단 설명 (마무리 한마디)
  imageUrl: string; // OG 이미지 URL (1200×630)
  link: string; // 클릭 시 이동할 URL
}

/**
 * 카카오톡 피드 공유 — 사용자가 OG 이미지 + 텍스트 + 링크가 박힌 카드를 친구에게 전송.
 * Kakao SDK 가 준비 안 됐으면 false 반환 → 호출자가 텍스트 폴백 처리.
 */
export function shareToKakao(input: KakaoSajuShareInput): boolean {
  if (!isKakaoReady()) return false;
  const w = window as KakaoLikeWindow;
  try {
    w.Kakao!.Share!.sendDefault({
      objectType: "feed",
      content: {
        title: input.title,
        description: input.description,
        imageUrl: input.imageUrl,
        link: {
          mobileWebUrl: input.link,
          webUrl: input.link,
        },
      },
      buttons: [
        {
          title: "나도 사주 보기",
          link: {
            mobileWebUrl: input.link,
            webUrl: input.link,
          },
        },
      ],
    });
    return true;
  } catch (e) {
    console.warn("[kakao-share] sendDefault failed:", e);
    return false;
  }
}
