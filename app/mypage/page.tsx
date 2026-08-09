"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Footer from "@/components/layout/Footer";
import StorageSummary from "@/components/mypage/StorageSummary";
import SajuProfileModal from "@/components/mypage/SajuProfileModal";
import type { SajuResult } from "@/lib/saju/calc";
import { readingCategory, type ReadingCategory } from "@/lib/readings/category";

interface Me {
  user: { id: string; nickname: string; profile_img: string | null } | null;
  isAuthenticated: boolean;
}

interface ProfileItem {
  id: string;
  displayName: string;
  relationType: "self" | "family" | "friend" | "partner" | "other";
  birthDate: string | null; // P2: 생일 없는 프로필 가능
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: "male" | "female" | "other";
  isPrimary: boolean;
  saju: SajuResult | null; // birthDate 없으면 서버가 계산 스킵 (null)
}

// /api/readings 응답 항목 — 종목 집계(readingCategory)에 필요한 필드만 선언.
interface ReadingListItem {
  consultationType?: string | null;
  emotionTag?: string | null;
}

// 12시진 (자시 23~01 시작). 인덱스 0 = 자시.
const SIJIN = [
  { name: "자시", range: "23~01" },
  { name: "축시", range: "01~03" },
  { name: "인시", range: "03~05" },
  { name: "묘시", range: "05~07" },
  { name: "진시", range: "07~09" },
  { name: "사시", range: "09~11" },
  { name: "오시", range: "11~13" },
  { name: "미시", range: "13~15" },
  { name: "신시", range: "15~17" },
  { name: "유시", range: "17~19" },
  { name: "술시", range: "19~21" },
  { name: "해시", range: "21~23" },
];

// HH:MM → "미시 (13~15시)". null이면 null(시간 모름).
function birthTimeToSijin(t: string | null): string | null {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  const idx = h === 23 ? 0 : Math.floor((h + 1) / 2) % 12;
  const s = SIJIN[idx];
  return `${s.name} (${s.range}시)`;
}

export default function MyPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [withdrawAck, setWithdrawAck] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [showSajuModal, setShowSajuModal] = useState(false);
  const [relationshipProfileIds, setRelationshipProfileIds] = useState<string[]>([]);
  const [relationshipCount, setRelationshipCount] = useState(0);
  const [readings, setReadings] = useState<ReadingListItem[]>([]);
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    void (async () => {
      const [r, bal, profs, rel, readingsRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/stars/balance", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/profiles", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/relationship", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/readings", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
      ]);
      if (!r?.isAuthenticated) {
        router.replace("/login?next=/mypage");
        return;
      }
      setMe(r as Me);
      if (bal) setBalance(bal.balance ?? 0);
      if (profs?.profiles) setProfiles(profs.profiles as ProfileItem[]);
      if (rel) {
        // 새 GET shape(P2): self + relationships[] 에서 사용 중인 프로필 id 를 모은다.
        const rels = (Array.isArray(rel.relationships) ? rel.relationships : []) as {
          selfProfileId: string | null;
          partnerProfileId: string | null;
        }[];
        const ids = [
          rel.self?.id as string | null | undefined,
          ...rels.flatMap((x) => [x.selfProfileId, x.partnerProfileId]),
        ].filter((v: unknown): v is string => typeof v === "string");
        setRelationshipProfileIds(ids);
        setRelationshipCount(rels.length);
      }
      if (readingsRes?.readings) setReadings(readingsRes.readings as ReadingListItem[]);
      const unread = await fetch("/api/inquiries/unread-count", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (unread) setSupportUnread(unread.count ?? 0);
      setLoading(false);
    })();
  }, [router]);

  const reloadProfiles = async () => {
    const d = await fetch("/api/profiles", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    if (d?.profiles) setProfiles(d.profiles as ProfileItem[]);
  };

  const self = profiles.find((p) => p.isPrimary) ?? null;
  const acquaintanceCount = profiles.filter((p) => !p.isPrimary).length;

  // 마이 보관함 요약 카드용 종목별 개수. relationship 은 /api/readings 에 안 실리므로
  // (서버 .neq 필터) /api/relationship 의 relationships[] 길이를 그대로 쓴다.
  const counts: Record<ReadingCategory, number> = {
    tarot: 0,
    fortune: 0,
    sim: 0,
    relationship: relationshipCount,
  };
  for (const item of readings) {
    const cat = readingCategory({
      consultationType: item.consultationType,
      emotionTag: item.emotionTag,
    });
    if (cat !== "relationship") counts[cat]++;
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    if (typeof window !== "undefined") {
      localStorage.removeItem("byeolkong_user");
      localStorage.removeItem("byeolkong_token");
      sessionStorage.removeItem("byeolkong:auth-sync");
    }
    router.replace("/");
  };

  const handleWithdraw = async () => {
    // 연타 시 동시 POST 2건 → 두 번째가 카카오 -101 + account_withdrawals 중복 기록
    if (!withdrawAck || withdrawing) return;
    setWithdrawing(true);
    try {
      const r = await fetch("/api/auth/withdraw", { method: "POST" });
      if (r.ok) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("byeolkong_user");
          localStorage.removeItem("byeolkong_token");
        }
        router.replace("/");
      } else {
        const d = await r.json().catch(() => ({}));
        alert(d?.error || "탈퇴에 실패했어. 잠시 후 다시 시도해줘.");
      }
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading || !me?.user) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      {/* 별 잔액 + 결제·별 내역 */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <div className="bg-gradient-to-br from-eye-purple via-lilac-deep to-eye-purple rounded-2xl p-4 shadow-lg shadow-lilac-deep/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-white/75 mb-1">내 별 잔액</div>
              <div className="text-[22px] font-bold text-gold-soft">
                ⭐ {balance ?? 0}별
              </div>
            </div>
            <Link
              href="/shop"
              className="px-4 py-2 rounded-xl bg-white text-eye-purple font-bold text-[12px]"
            >
              충전
            </Link>
          </div>
          <Link
            href="/mypage/payments"
            className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-[12px] text-white/85"
          >
            <span>결제 · 별 내역 보기</span>
            <span className="text-white/60">›</span>
          </Link>
        </div>
      </div>

      {/* 내 보관함 — 종목별 요약 4카드 (별 잔액과 사주판 사이) */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <StorageSummary counts={counts} />
      </div>

      {/* 프로필 카드 (명식 통합) */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/20 shadow-sm shadow-lilac-deep/10">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-lilac-soft overflow-hidden flex items-center justify-center ring-1 ring-lilac-mid/50">
              {me.user.profile_img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.user.profile_img}
                  alt="프로필"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Image
                  src="/byeolkong-main.png"
                  alt="별콩이"
                  width={56}
                  height={56}
                />
              )}
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-bold text-eye-purple">
                {me.user.nickname}
              </div>
              <div className="text-[11px] text-text-light/70 mt-0.5">
                {self
                  ? self.birthDate
                    ? `${self.birthDate.replace(/-/g, ". ")}${
                        self.isLunarInput ? " · 음력" : " · 양력"
                      }${
                        birthTimeToSijin(self.birthTime)
                          ? ` · ${birthTimeToSijin(self.birthTime)}`
                          : " · 시간 모름"
                      }`
                    : "생일 미입력"
                  : "카카오"}
              </div>
            </div>
            {self && (
              <button
                onClick={() => setShowSajuModal(true)}
                className="text-[11px] text-text-light/60 underline self-start"
              >
                수정
              </button>
            )}
          </div>

          {/* 내 사주 요약 — 상세 편집·지인 관리는 모달에서 */}
          <div className="mt-3 pt-3 border-t border-lilac-mid/20 flex items-center justify-between gap-3">
            <div className="text-[12px] text-text-light">
              {self?.saju ? (
                <>
                  <span className="font-bold text-eye-purple">
                    {self.saju.pillars.day.stem}
                    {self.saju.pillars.day.branch}
                  </span>{" "}
                  일주
                </>
              ) : (
                "생일 미입력"
              )}
              <span className="mx-1.5 text-lilac-mid/60">·</span>
              지인 {acquaintanceCount}명
            </div>
            <button
              onClick={() => setShowSajuModal(true)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-lilac-soft/60 text-eye-purple text-[11px] font-bold"
            >
              관리
            </button>
          </div>
        </div>
      </div>

      {showSajuModal && (
        <SajuProfileModal
          profiles={profiles}
          relationshipProfileIds={relationshipProfileIds}
          selfDisplayName={me.user.nickname}
          onReload={reloadProfiles}
          onClose={() => setShowSajuModal(false)}
        />
      )}

      {/* 계정 */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div className="text-[12px] font-bold text-eye-purple mb-3 flex items-center">
          <span className="inline-block w-[7px] h-[7px] rounded-full bg-lilac-deep mr-1.5" aria-hidden />
          계정
        </div>
        <div className="bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)] overflow-hidden divide-y divide-lilac-mid/15">
          <Link href="/mypage/support" className="flex items-center gap-3 p-3.5">
            <span className="shrink-0 w-[30px] h-[30px] rounded-[9px] bg-lilac-soft flex items-center justify-center">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className="text-lilac-deep" aria-hidden>
                <path d="M12,1C7,1 3,5 3,10V17A3,3 0 0,0 6,20H9V12H5V10A7,7 0 0,1 12,3A7,7 0 0,1 19,10V12H15V20H19A3,3 0 0,0 22,17V10C22,5 17,1 12,1Z" />
              </svg>
            </span>
            <span className="flex-1 text-[14px] text-eye-purple font-medium flex items-center gap-2">
              고객센터 / 문의
              {supportUnread > 0 && (
                <span className="relative flex h-2 w-2" aria-label="새 답변">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lilac-deep opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-lilac-deep" />
                </span>
              )}
            </span>
            <span className="text-text-light/40">›</span>
          </Link>
          <button
            onClick={() => setShowWithdrawConfirm(true)}
            className="w-full flex items-center gap-3 p-3.5"
          >
            <span className="shrink-0 w-[30px] h-[30px] rounded-[9px] bg-lilac-soft/60 flex items-center justify-center">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className="text-text-light/70" aria-hidden>
                <path d="M15,14C12.33,14 7,15.33 7,18V20H23V18C23,15.33 17.67,14 15,14M6,10V7H4V10H1V12H4V15H6V12H9V10M15,12A4,4 0 0,0 19,8A4,4 0 0,0 15,4A4,4 0 0,0 11,8A4,4 0 0,0 15,12Z" />
              </svg>
            </span>
            <span className="flex-1 text-left text-[14px] text-text-light/70 font-medium">
              회원 탈퇴
            </span>
            <span className="text-text-light/40">›</span>
          </button>
        </div>
      </div>

      {/* 로그아웃 */}
      <div className="w-full max-w-md mx-auto px-5 mb-24">
        <div className="h-px bg-lilac-mid/30 mb-5" />
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl bg-eye-purple text-white font-bold text-[14px]"
        >
          로그아웃
        </button>
      </div>

      {/* 회원 탈퇴 확인 모달 */}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
            <p className="text-[14px] font-bold text-eye-purple mb-2">
              정말 떠나려고?
            </p>
            <p className="text-[12px] text-text-light leading-relaxed mb-3">
              탈퇴하면 너의 사주 풀이, 별 잔액, 모든 기록이 영구적으로 삭제돼.
              되돌릴 수 없어.
            </p>
            <label className="flex items-center gap-2 text-[12px] text-text-light mb-4">
              <input
                type="checkbox"
                checked={withdrawAck}
                onChange={(e) => setWithdrawAck(e.target.checked)}
                className="w-4 h-4 accent-rose-500"
              />
              위 내용에 동의해
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowWithdrawConfirm(false);
                  setWithdrawAck(false);
                }}
                className="flex-1 py-2 rounded-xl border border-lilac-mid text-eye-purple text-[12px]"
              >
                취소
              </button>
              <button
                onClick={handleWithdraw}
                disabled={!withdrawAck || withdrawing}
                className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                탈퇴하기
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </main>
  );
}
