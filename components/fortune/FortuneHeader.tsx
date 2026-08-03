"use client";

// 사주 운세(2탭) 간판. 큰 히어로(HeroBanner) 대체.
// variant="rich"(기본, B안): 별콩이 크게 + 세계관 배경 → 헤더와 분리.
// variant="slim"(A 롤백): 얇은 한 줄. "여차하면 A로" 를 prop 한 개로.
import Image from "next/image";

interface Props {
  variant?: "rich" | "slim";
}

export default function FortuneHeader({ variant = "rich" }: Props) {
  if (variant === "slim") {
    return (
      <section
        className="w-full max-w-md mx-auto flex items-center gap-3 px-5 py-3.5"
        style={{ background: "linear-gradient(135deg,#F6EFFF,#FBEFF4)" }}
      >
        <span className="relative w-9 h-9 rounded-full overflow-hidden bg-lilac-soft shrink-0">
          <Image src="/byeolkong-head.png" alt="별콩이" fill sizes="36px" className="object-contain" />
        </span>
        <div>
          <p className="text-[13px] font-extrabold text-eye-purple leading-tight">사주 운세</p>
          <p className="text-[11.5px] text-text-light">생일만 알려줘, 한 장으로 정리해줄게</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative w-full max-w-md mx-auto overflow-hidden px-5 py-5"
      style={{ background: "linear-gradient(135deg,#EBE1FB,#F7E7F2)" }}
    >
      <span className="absolute top-2.5 right-4 text-[11px] opacity-55 animate-star-twinkle" aria-hidden>✨</span>
      <span className="absolute bottom-3 right-11 text-[8px] opacity-50 animate-star-twinkle" aria-hidden>⭐</span>
      <div className="relative flex items-center gap-3.5">
        <span
          className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 shadow-[0_3px_10px_rgba(159,138,208,0.32)]"
          style={{ background: "linear-gradient(135deg,#D4C7EE,#9F8AD0)" }}
        >
          <Image src="/byeolkong-head.png" alt="별콩이" fill sizes="56px" className="object-contain" />
        </span>
        <div>
          <p className="text-[15px] font-extrabold text-eye-purple">사주 운세</p>
          <p className="text-[11.5px] text-text-light mt-0.5 leading-relaxed">
            생일만 알려줘,
            <br />
            별콩이가 한 장으로 정리해줄게
          </p>
        </div>
      </div>
    </section>
  );
}
