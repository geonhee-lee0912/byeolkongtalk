"use client";

// 사주 운세(2탭) 간판. 큰 히어로(HeroBanner) 대체.
// variant="rich"(기본, B안): 황혼 배경(하단 원형 주황) + 별 반짝임 + 별콩이(우측·축소) + 좌측 텍스트·생일 버튼.
// variant="slim"(A 롤백): 얇은 한 줄.
// 별콩이 이미지는 배경이 투명한 요소(public/fortune-byeolkong.webp) — 배경색은 이 컴포넌트 CSS 가 정한다.
import Image from "next/image";
import Link from "next/link";

interface Props {
  variant?: "rich" | "slim";
}

export default function FortuneHeader({ variant = "rich" }: Props) {
  if (variant === "slim") {
    return (
      <section
        className="w-full max-w-md mx-auto flex items-center gap-3 px-5 py-3.5"
        style={{ background: "linear-gradient(135deg,#FFF9F2,#FFFFFF)" }}
      >
        <div>
          <p className="text-[13px] font-extrabold text-eye-purple leading-tight">사주 운세</p>
          <p className="text-[11.5px] text-text-light">생일만 알려줘, 한 장으로 정리해줄게</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative mx-auto w-full max-w-md overflow-hidden"
      style={{
        // 황혼 — 위쪽 흰색, 하단 중앙에서 원형으로 번지는 주황
        background:
          "radial-gradient(97% 83% at 50% 123%, #FFC97F 0%, #FFDCA6 37%, #FFF2E1 69%, #FFFFFF 100%)",
      }}
    >
      {/* 좌측 흰 영역 별 반짝임 */}
      <span className="absolute top-2 left-[44%] text-[10px] text-gold opacity-70 animate-star-twinkle" aria-hidden>✦</span>
      <span className="absolute top-5 left-[57%] text-[8px] text-gold-soft opacity-60 animate-star-twinkle" aria-hidden>✦</span>
      <span className="absolute top-1.5 left-[63%] text-[9px] text-gold opacity-50 animate-star-twinkle" aria-hidden>✧</span>

      {/* 별콩이 (우측 하단, 60% 감·왼쪽으로 조금) */}
      <div className="pointer-events-none absolute right-8 top-1/2 h-[100px] w-[77px] -translate-y-1/2">
        <Image
          src="/fortune-byeolkong.webp"
          alt="별콩이"
          fill
          sizes="77px"
          className="object-contain"
          priority
        />
      </div>

      {/* 좌측 텍스트 + 생일 등록 버튼 */}
      <div className="relative max-w-[78%] px-5 pb-5 pt-9">
        <p className="font-display text-[17px] font-black text-eye-purple">사주 운세</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-text-light">
          생일만 알려줘, 한 장으로 정리해줄게
        </p>
        <Link
          href="/mypage"
          className="mt-3 -ml-0.5 inline-flex items-center gap-1 rounded-xl border border-lilac-mid/60 bg-white/50 px-3 py-1 text-[11.5px] font-semibold text-lilac-deep transition active:scale-95"
        >
          생일 등록하기
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
