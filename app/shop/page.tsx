import Image from "next/image";

export const metadata = {
  title: "별콩 상점 — 별콩톡",
};

export default function ShopPage() {
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
        별콩 상점
      </h1>
      <p className="mt-3 text-[14px] text-text-light leading-relaxed">
        곧 별을 충전하고 별콩이와 더 깊은 이야기를
        <br />
        나눌 수 있게 될 거야. 조금만 기다려줘.
      </p>

      <span className="mt-6 px-3 py-1 rounded-full text-[11px] font-bold text-eye-purple bg-cream-warm border border-lilac-mid/40">
        준비 중
      </span>
    </main>
  );
}
