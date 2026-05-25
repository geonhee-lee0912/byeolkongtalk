import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "별콩이 타로 — 별콩톡",
};

export default function TarotPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-5 py-12 max-w-md mx-auto w-full animate-fade-in text-center">
      <div className="opacity-85">
        <Image
          src="/byeolkong-main.png"
          alt="별콩이"
          width={180}
          height={180}
          priority
        />
      </div>

      <h1 className="mt-2 font-display text-2xl font-bold text-eye-purple">
        별콩이 타로
      </h1>
      <p className="mt-3 text-[14px] text-text-light leading-relaxed">
        78장의 카드를 펼쳐 너의 지금을
        <br />
        함께 짚어줄 준비를 하고 있어.
      </p>

      <span className="mt-6 px-3 py-1 rounded-full text-[11px] font-bold text-eye-purple bg-cream-warm border border-lilac-mid/40">
        곧 만나
      </span>

      <Link
        href="/"
        className="mt-8 text-[12px] text-text-light/70 underline"
      >
        다른 방식 골라보기
      </Link>
    </main>
  );
}
