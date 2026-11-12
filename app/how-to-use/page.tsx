import Image from "next/image";
import Link from "next/link";
import { WELCOME_BONUS_STARS } from "@/lib/constants";

const STEPS = [
  { n: 1, t: "고민 고르기", d: "지금 마음에 걸리는 고민이나 감정을 골라 적어줘." },
  { n: 2, t: "타로·상담으로 풀기", d: "별콩이가 타로나 상담으로 그 마음을 함께 들여다봐." },
  { n: 3, t: "결과 받고 이어가기", d: "흐름과 가능성을 받아보고, 더 궁금하면 계속 이어가면 돼." },
];

// 지금 탭·홈 카드와 같은 이름·그림, 누르면 그곳으로(디자인 다듬기 ② /how-to-use 운영자 A안 11-12).
// 그림 칸 바탕은 홈과 같은 구역 색(연애 분홍 · 별마루·상담 연보라) · 사주는 하늘
const PRODUCTS = [
  { icon: "/icons/fortune/tarot_counsel.webp", bg: "#FCE7EE", t: "타로톡", d: "고민을 타로로 풀어보기", href: "/" },
  { icon: "/icons/fortune/saju_full.webp", bg: "#E3F1FA", t: "사주 운세", d: "사주로 보는 나의 흐름", href: "/fortune" },
  { icon: "/icons/byeolmaru/hub.webp", bg: "#E8DEF5", t: "별마루", d: "오늘 사주·타로, 매일 무료", href: "/byeolmaru" },
  { icon: "/icons/relationship/consult.webp", bg: "#E8DEF5", t: "연애 상담", d: "그 사람 이야기 · 연애 시뮬", href: "/relationship" },
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
          <h1 className="mt-4 text-20 font-bold text-eye-purple">별콩이가 처음이야?</h1>
          <p className="mt-2 text-14 text-text-light leading-relaxed">
            별콩이는 별의 수호자야. 타로와 사주로 네 마음의 흐름을 함께 읽어주는 친구지. 어떻게 노는지 알려줄게!
          </p>
        </section>

        <section>
          <h2 className="text-15 font-bold text-eye-purple mb-3">이렇게 시작해</h2>
          <div className="space-y-3">
            {STEPS.map((s) => (
              <div key={s.n} className="card flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lilac-deep text-white text-13 font-bold">
                  {s.n}
                </span>
                <div>
                  <p className="text-14 font-bold text-eye-purple">{s.t}</p>
                  <p className="mt-0.5 text-13 text-text-light leading-snug">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-15 font-bold text-eye-purple mb-3">뭘 할 수 있어</h2>
          <div className="grid grid-cols-2 gap-3">
            {PRODUCTS.map((p) => (
              <Link key={p.t} href={p.href} className="card flex flex-col gap-2.5">
                <span
                  className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                  style={{ background: p.bg }}
                  aria-hidden
                >
                  <Image src={p.icon} alt="" width={38} height={38} className="object-contain" />
                </span>
                <span>
                  <span className="block text-15 font-bold text-eye-purple">{p.t}</span>
                  <span className="block mt-0.5 text-12 text-text-light leading-snug">{p.d}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-gold-soft/20 border border-gold/30 p-4">
          <p className="text-14 text-eye-purple leading-relaxed">
            처음 오면 <b>별콩별 {WELCOME_BONUS_STARS}개</b>를 선물로 줘. 무료로 시작하고, 더 깊게 보고 싶으면 충전이나 패스로 이어갈 수 있어.
          </p>
        </section>

        <Link
          href="/concern"
          className="btn btn-primary btn-lg"
        >
          별콩이랑 시작하기
        </Link>
      </div>
    </main>
  );
}
