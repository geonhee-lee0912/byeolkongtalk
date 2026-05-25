import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "내 고민톡 — 별콩톡",
};

export default function ReadingsPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-5 py-10 max-w-md mx-auto w-full animate-fade-in text-center">
      <div className="opacity-80">
        <Image
          src="/byeolkong-main.png"
          alt="별콩이"
          width={180}
          height={180}
          priority
        />
      </div>

      <h1 className="mt-2 text-2xl font-bold text-eye-purple">
        내 고민톡
      </h1>
      <p className="mt-3 text-[14px] text-text-light leading-relaxed">
        지금까지 별콩이와 나눈 이야기들을
        <br />
        한곳에서 다시 펼쳐볼 수 있게 정리할게.
      </p>

      <Link
        href="/mypage"
        className="mt-6 px-5 py-2.5 rounded-full bg-lilac-deep text-white text-[13px] font-bold hover:bg-lilac-deep/90 active:scale-[0.98] transition"
      >
        내 정보에서 먼저 보기
      </Link>

      <span className="mt-4 px-3 py-1 rounded-full text-[11px] font-bold text-eye-purple bg-cream-warm border border-lilac-mid/40">
        준비 중
      </span>
    </main>
  );
}
