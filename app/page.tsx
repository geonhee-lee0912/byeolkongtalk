import Image from "next/image";
import Link from "next/link";
import Footer from "@/components/layout/Footer";

export default function Home() {
  return (
    <>
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-12 max-w-md mx-auto w-full animate-fade-in">
        {/* 별콩이 캐릭터 + 별 파티클 */}
      <div className="relative animate-float">
        <Image
          src="/byeolkong-main.png"
          alt="별콩이"
          width={280}
          height={280}
          priority
        />
        <div
          className="absolute -top-1 left-6 w-3 h-3 bg-gold rounded-full animate-star-twinkle"
        />
        <div
          className="absolute top-14 -right-1 w-2 h-2 bg-gold-soft rounded-full animate-star-twinkle"
          style={{ animationDelay: "0.6s" }}
        />
        <div
          className="absolute bottom-16 -left-3 w-2 h-2 bg-gold rounded-full animate-star-twinkle"
          style={{ animationDelay: "1.2s" }}
        />
      </div>

      {/* 타이틀 */}
      <h1 className="mt-8 text-4xl font-bold text-eye-purple text-center leading-tight">
        별콩이가
        <br />
        사주를 봐줄게
      </h1>
      <p className="mt-4 text-base text-text-light text-center leading-relaxed">
        흐름을 읽고, 가능성을 짚고,
        <br />
        선택의 방향을 함께 살펴봐.
      </p>

        <Link
          href="/saju"
          className="mt-12 px-7 py-3.5 rounded-full bg-lilac-deep text-white text-[15px] font-bold hover:bg-lilac-deep/90 active:scale-[0.98] transition"
        >
          ✨ 내 사주 보기
        </Link>
      </main>

      <Footer />
    </>
  );
}
