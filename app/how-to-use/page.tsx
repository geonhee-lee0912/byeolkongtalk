import Image from "next/image";
import Link from "next/link";
import { WELCOME_BONUS_STARS } from "@/lib/constants";

const STEPS = [
  { n: 1, t: "고민 고르기", d: "지금 마음에 걸리는 고민이나 감정을 골라 적어줘." },
  { n: 2, t: "타로·상담으로 풀기", d: "별콩이가 타로나 상담으로 그 마음을 함께 들여다봐." },
  { n: 3, t: "결과 받고 이어가기", d: "흐름과 가능성을 받아보고, 더 궁금하면 계속 이어가면 돼." },
];

const PRODUCTS = [
  { e: "🃏", t: "타로톡", d: "고민을 타로로 풀어보기" },
  { e: "🔮", t: "별콩 운세", d: "사주로 보는 나의 흐름" },
  { e: "💬", t: "연애 상담", d: "그 사람 이야기를 계속" },
  { e: "🎭", t: "연애 시뮬", d: "그 사람과 상황 연습" },
];

export default function HowToUsePage() {
  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 space-y-8">
        <section className="text-center">
          <Image
            src="/byeolkong-main.png"
            alt="별콩이"
            width={96}
            height={96}
            className="mx-auto rounded-full bg-cream-warm object-cover"
            priority
          />
          <h1 className="mt-4 text-xl font-bold text-eye-purple">별콩이가 처음이야?</h1>
          <p className="mt-2 text-[14px] text-text-light leading-relaxed">
            별콩이는 별의 수호자야. 타로와 사주로 네 마음의 흐름을 함께 읽어주는 친구지. 어떻게 노는지 알려줄게!
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-bold text-eye-purple mb-3">이렇게 시작해</h2>
          <div className="space-y-3">
            {STEPS.map((s) => (
              <div key={s.n} className="flex gap-3 rounded-2xl bg-cream-warm border border-lilac-soft/50 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lilac-deep text-white text-[13px] font-bold">
                  {s.n}
                </span>
                <div>
                  <p className="text-[14px] font-bold text-eye-purple">{s.t}</p>
                  <p className="mt-0.5 text-[13px] text-text-light leading-snug">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-[15px] font-bold text-eye-purple mb-3">뭘 할 수 있어</h2>
          <div className="grid grid-cols-2 gap-3">
            {PRODUCTS.map((p) => (
              <div key={p.t} className="rounded-2xl bg-cream-warm border border-lilac-soft/50 p-4">
                <div className="text-2xl">{p.e}</div>
                <p className="mt-1.5 text-[13.5px] font-bold text-eye-purple">{p.t}</p>
                <p className="mt-0.5 text-[12px] text-text-light leading-snug">{p.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-gold-soft/20 border border-gold/30 p-4">
          <p className="text-[13.5px] text-eye-purple leading-relaxed">
            🌟 처음 오면 <b>별콩별 {WELCOME_BONUS_STARS}개</b>를 선물로 줘. 무료로 시작하고, 더 깊게 보고 싶으면 충전이나 패스로 이어갈 수 있어.
          </p>
        </section>

        <Link
          href="/concern"
          className="block w-full text-center py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px]"
        >
          별콩이랑 시작하기
        </Link>
      </div>
    </main>
  );
}
