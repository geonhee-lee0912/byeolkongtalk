"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  EMOTION_OPTIONS,
  normalizeEmotionTag,
  type PendingConsultation,
} from "@/lib/emotions";
import {
  SPREAD_INFO,
  EMOTION_TO_CATEGORY,
  getSpreadOptionsForTag,
  getSpreadDescription,
  type SpreadType,
} from "@/lib/tarot/spreads";
import { CONCERN_REWRITE_HREF, TAROT_SPREAD_KEY, type TarotSpreadSelection } from "@/lib/tarot/session";
import { tarotPrice } from "@/lib/tarot/pricing";
import { spreadAmountLine } from "@/lib/tarot/spread-facts";
import Icon from "@/components/common/Icon";

// 타로톡 스프레드 고르기 — 2026-10-09 이전 app/tarot/page.tsx 를 그대로 옮겼다(메뉴판 반반은 2026-10-25 판정에서 이 화면이 이겼다).
// 가격은 서버 차감과 같은 tarotPrice(= SPREAD_INFO.starCost)로 읽는다.
// 추천 기능은 0697771에서 제품 결정으로 제거 — 자동선택·추천 뱃지 없이 유저가 직접 고른다.
export default function SpreadPicker({ pending }: { pending: PendingConsultation }) {
  const router = useRouter();
  const [selected, setSelected] = useState<SpreadType | null>(null);

  const category = useMemo(() => {
    const tag = normalizeEmotionTag(pending.emotion);
    return tag ? EMOTION_TO_CATEGORY[tag] : "default";
  }, [pending]);
  const options = useMemo(() => getSpreadOptionsForTag(pending.emotion), [pending]);

  const normalizedTag = normalizeEmotionTag(pending.emotion);
  const displayTag = normalizedTag ?? pending.emotion;
  const option = EMOTION_OPTIONS.find((o) => o.tag === displayTag);

  const handleStart = () => {
    if (!selected) return;
    const payload: TarotSpreadSelection = {
      spreadType: selected,
      spreadCategory: category,
      emotion: pending.emotion,
      concern: pending.concern,
    };
    sessionStorage.setItem(TAROT_SPREAD_KEY, JSON.stringify(payload));
    router.push("/tarot/draw");
  };

  // break-keep — 한글 단어 중간에서 줄이 끊기지 않게(320px 에서 "봐줄/게"·"깊/이"·"1,000원부/터", 사용자 2026-10-25).
  // break-words — 띄어쓰기 없는 긴 고민 글은 그래도 칸을 넘치지 않게 끊는다
  // text-pretty — 마지막 줄에 단어 하나만 남지 않게(지원 안 하는 브라우저는 그냥 break-keep 로 끊긴다)
  return (
    <main className="flex flex-1 flex-col items-center pb-8 w-full animate-fade-in break-keep break-words text-pretty">
      {/* 별콩이 + 타이틀 + 설명 (히어로 대체) */}
      <div className="w-full max-w-md mx-auto px-5 flex flex-col items-center mt-2 mb-5">
        <Image
          src="/byeolkong-tarot.png"
          alt="별콩이"
          width={120}
          height={120}
          priority
          className="drop-shadow-lg"
        />
        <h1 className="font-display text-22 text-eye-purple text-center mt-4 tracking-wide leading-snug text-balance">
          너의 고민을 내가 해결해 줄게
        </h1>
        <p className="text-12 text-text-light text-center mt-1">
          카드를 몇 장으로 깊이 볼지는 네가 골라봐
        </p>
      </div>

      {/* 고민 내용 — 밤 카드(card-night). 카드 뒷면 밤보라와 같은 색 — 옛 자주 그라데이션 판만 색이 따로 놀았다(디자인 다듬기 ② /tarot 운영자 C안 11-12) */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div className="card-night">
          <div className="flex items-center gap-2 mb-2">
            {option && <img src={option.icon} alt="" width={22} height={22} className="object-contain" />}
            <span className="text-13 font-bold text-gold-soft">
              {pending.emotion}
            </span>
          </div>
          <p className="text-13 text-white/75 leading-relaxed line-clamp-3">
            {pending.concern}
          </p>
          {/* 고민 다시 적기 — 맨 위 '‹' 링크였던 것을 고민 글 아래로(앱 헤더 ‹ 와 뒤로가 둘로 보였다). 이어가기(새 카드)로 바로 온 사람은
              헤더 ‹ 가 지난 풀이로 가서 고민을 고칠 길이 이것뿐이라 웹·앱 다 남긴다(디자인 다듬기 ② /tarot 운영자 11-12) */}
          <div className="flex justify-end mt-1 -mb-1">
            <Link
              href={CONCERN_REWRITE_HREF}
              className="inline-flex items-center gap-0.5 py-1 text-11 font-medium text-white/45 hover:text-white/70 transition-colors"
            >
              고민 다시 적기
              <Icon name="chev_r" size={10} />
            </Link>
          </div>
        </div>
      </div>

      {/* 디바이더 — 리딩 방법 고르기 */}
      <div className="w-full max-w-md mx-auto px-5 mb-4 flex items-center gap-3">
        <span className="flex-1 h-px bg-lilac-mid/30" />
        <span className="text-11 font-bold text-text-light tracking-[0.15em]">
          리딩 방법 고르기
        </span>
        <span className="flex-1 h-px bg-lilac-mid/30" />
      </div>

      {/* 스프레드 카드 */}
      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-2.5">
        {options.map((type) => {
          const info = SPREAD_INFO[type];
          const isSelected = selected === type;
          return (
            <button
              key={type}
              onClick={() => setSelected(type)}
              aria-pressed={isSelected}
              // 고르면 주 버튼과 같은 보라 테두리 하나 — 스프레드마다 다른 색은 뺐다(디자인 다듬기 ② /tarot 운영자 B안 11-12)
              className={`card flex items-center gap-3.5 text-left transition-all ${
                isSelected ? "border-2 border-accent ring-3 ring-accent/15" : "border border-lilac-soft"
              }`}
            >
              {/* 카드 미니어처 — 밤보라 뒷면 + 금테 + 반짝임. 실제 뒷면 그림은 작게 줄이면 검은 덩어리로 보였다(디자인 다듬기 ② /tarot 운영자 D2안 11-12) */}
              <div className="flex flex-shrink-0 items-center -space-x-3.5 w-[58px] justify-center">
                {Array.from({ length: info.cardCount }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[26px] aspect-[2/3] rounded-lg bg-night border border-gold ring-1 ring-white flex items-center justify-center"
                    style={{ transform: `rotate(${(i - (info.cardCount - 1) / 2) * 6}deg)` }}
                  >
                    <Icon name="sparkle" size={10} className="text-gold" />
                  </div>
                ))}
              </div>

              <div className="flex-1 min-w-0">
                {/* 배지·가격은 각각 쪼개지 않는다 — 한 줄에 안 들어가면 가격이 통째로 다음 줄로(320px 7장 "가능성 스프레드 · / 7카드"·"⭐ / 55별") */}
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mb-1">
                  {/* 이름은 판 없이 굵은 글자로(운영자 B안 11-12) — 색 이름표 5개가 무지개처럼 섞여 보였다 */}
                  <span className="text-15 font-extrabold text-eye-purple whitespace-nowrap">
                    {info.label}
                    {info.cardCount > 3 && ` · ${info.cardCount}카드`}
                  </span>
                  <span className="text-11 font-bold text-text-light whitespace-nowrap">
                    <Icon name="star" size={14} className="inline align-[-2px] mr-0.5" />{tarotPrice(type)}별
                  </span>
                </div>
                {/* 분량 안내 — 첫 답 길이 + 자연 마무리까지 받는 질문 수(spec 2026-10-25-타로-원투카드-마무리-안내줄 §2-1) */}
                <p className="text-11 font-medium text-eye-purple/85 mb-1">
                  {spreadAmountLine(type)}
                </p>
                {/* 설명 한 줄이 '뭘 보는지'를 맡는다 — 자리 이름 줄은 지웠다(1~3장은 설명과 같은 말 · 5장 이상은 설명을 길게 써서 대신,
                    spec 2026-10-25 §11 사용자 결정). 자리 이름은 뽑기 화면 칸마다 나온다 */}
                <p className="text-12 text-text-light leading-snug">
                  {getSpreadDescription(type, category, pending.emotion)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 크로스링크 */}
      <div className="w-full max-w-md mx-auto px-5 mt-4 flex flex-col gap-2">
        {normalizedTag === "직장·학교에서 사람이 어려워" && (
          <Link
            href="/fortune/compat-social"
            className="flex items-center justify-between p-3.5 rounded-2xl border border-dashed border-lilac-mid/60 bg-cream/50"
          >
            <span className="text-13 text-eye-purple">
              두 사람 사주로 보는 <b>인간관계 궁합</b>도 있어
            </span>
            <span className="text-text-light text-12"><Icon name="chev_r" size={16} /></span>
          </Link>
        )}
      </div>

      {/* 시작 버튼 — 고르면 아래 탭 바로 위에 붙어 나타난다. 맨 위 카드를 골라도 버튼이 화면 밖이라 끝까지 내려야 했다
          (디자인 다듬기 ② /tarot 운영자 B안 11-12). 고르기 전엔 버튼이 없다 */}
      {selected && (
        <div className="sticky z-30 bottom-[calc(4rem+env(safe-area-inset-bottom))] w-full max-w-md mx-auto mt-2 px-5 py-3 bg-cream shadow-float-up animate-fade-in">
          <button onClick={handleStart} className="btn btn-primary btn-lg">
            {`${SPREAD_INFO[selected].label}로 카드 뽑으러 가기`}
          </button>
        </div>
      )}
    </main>
  );
}
