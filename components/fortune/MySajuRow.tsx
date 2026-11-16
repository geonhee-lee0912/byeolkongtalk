"use client";

// 운세 목록 맨 위 '내 사주' 칸 — 큰 노을 배너('사주 운세' 제목이 머리와 두 번·생일이 있어도 '생일 등록하기')를 대신한다
// (디자인 다듬기 묶음 4 운세 목록 B·R1, 운영자 11-15). 무엇으로 볼지를 바로 보이고, 상품 목록이 첫 화면에 더 들어온다.
//  - 생일 있음: 일주 칸(바탕 = 내 일간 오행 색) · '내 사주' · 일간·생일 · 바꾸기 › / 둘째 줄 일간 한 줄 + 오행 분포
//  - 생일 없음(로그인): ? 칸 · '생일을 알려줘' · 등록 › / 둘째 줄 무엇이 생기는지 + 빈 오행 알약
//  - 비로그인: 카드 한 칸 전체가 로그인 하나 — '카카오로 시작하면 별 N개 선물'. 따로 있던 웰컴 별 배너와 합쳤다
//    (둘 다 같은 로그인으로 갔다 — 운영자 M2 11-15)
// 생일 등록·수정은 마이페이지와 같은 팝업(BirthPromptButton).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { WELCOME_BONUS_STARS } from "@/lib/constants";
import BirthPromptButton from "@/components/saju/BirthPromptButton";
import SajuIdentityRow, { sajuCaption } from "@/components/saju/SajuIdentityRow";
import type { ProfileItem } from "@/components/mypage/sajuShared";
import { BIRTH_PROMPT_SURFACE } from "@/lib/analytics/birth-prompt-surface";
import SajuGlance from "@/components/saju/SajuGlance";
import type { FiveElement } from "@/lib/saju/elements";
import Icon from "@/components/common/Icon";

const ELEMENTS: FiveElement[] = ["목", "화", "토", "금", "수"];

export default function MySajuRow() {
  // undefined = 아직 모름(자리만 잡아 둔다), "anon" = 비로그인이 확실, null = 생일 없음
  const [self, setSelf] = useState<ProfileItem | null | undefined | "anon">(undefined);

  const load = useCallback(async () => {
    try {
      const [me, r] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        fetch("/api/profiles", { cache: "no-store" }),
      ]);
      // 🔴 비로그인이 확실할 때만(=== false) 선물 칸 — 확인 실패면 '생일을 알려줘'(로그인 유저에게 선물을 약속하지 않게)
      if (me?.isAuthenticated === false) {
        setSelf("anon");
        return;
      }
      const list = r.ok ? ((await r.json()).profiles as ProfileItem[] | undefined) : undefined;
      const primary = list?.find((p) => p.isPrimary) ?? null;
      setSelf(primary?.saju ? primary : null);
    } catch {
      setSelf(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const action = (label: string) => (
    <BirthPromptButton
      surface={BIRTH_PROMPT_SURFACE.fortuneHeader}
      loginNext="/fortune"
      onSaved={load}
      className="shrink-0 flex items-center gap-0.5 text-13 font-bold text-accent disabled:opacity-60"
    >
      {label}
      <Icon name="chev_r" size={14} />
    </BirthPromptButton>
  );

  if (self === "anon") {
    return (
      <section className="w-full max-w-md mx-auto px-5 pt-4">
        <Link href="/login?next=%2Ffortune" className="card px-4 py-3.5 flex items-center gap-3 active:scale-[0.99] transition">
          <span className="shrink-0 w-11 h-11 rounded-xl bg-gold-wash flex items-center justify-center text-[#C9962F]">
            <Icon name="gift" size={22} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-14 font-bold text-eye-purple">카카오로 시작하면 별 {WELCOME_BONUS_STARS}개 선물</span>
            <span className="block text-12 text-text-light mt-0.5">사주 리포트 하나는 바로 볼 수 있어</span>
          </span>
          <span className="shrink-0 flex items-center gap-0.5 text-13 font-bold text-accent">
            시작
            <Icon name="chev_r" size={14} />
          </span>
        </Link>
      </section>
    );
  }

  return (
    <section className="w-full max-w-md mx-auto px-5 pt-4">
      <div className="card px-4 py-3.5 min-h-[124px]">
        {self === undefined ? null : self?.saju ? (
          <>
            <div className="flex items-center gap-3">
              <SajuIdentityRow
                saju={self.saju}
                title="내 사주"
                caption={sajuCaption(self.saju, { birthDate: self.birthDate, birthTime: self.birthTime })}
              />
              {action("바꾸기")}
            </div>
            <SajuGlance saju={self.saju} />
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="shrink-0 w-11 h-11 rounded-xl bg-lilac-soft flex items-center justify-center text-accent text-20 font-extrabold">
                ?
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-14 font-bold text-eye-purple">생일을 알려줘</p>
                <p className="text-12 text-text-light mt-0.5">한 번만 알려주면 바로 볼 수 있어</p>
              </div>
              {action("등록")}
            </div>
            <div className="border-t border-lilac-mid/30 mt-3 pt-2.5">
              <p className="text-12 text-text-light">알려주면 내 일간과 오행부터 바로 보여줄게</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {ELEMENTS.map((el) => (
                  <span key={el} className="text-11 font-bold text-lilac-mid px-2 py-0.5 rounded-full border border-dashed border-lilac-mid/60 bg-cream">
                    {el} ?
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
