"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface Me {
  user: { id: string; nickname: string; profile_img: string | null } | null;
  isAuthenticated: boolean;
}

interface ReadingItem {
  id: string;
  question: string;
  sajuData: {
    dayStem: string;
    dayElement: string;
  };
  starsSpent: number;
  hasSensitive: boolean;
  createdAt: string;
  profile: { display_name: string; relation_type: string } | null;
}

export default function MyPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [readings, setReadings] = useState<ReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [withdrawAck, setWithdrawAck] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/auth/me", { cache: "no-store" }).then((x) =>
        x.ok ? x.json() : null
      );
      if (!r?.isAuthenticated) {
        router.replace("/login?next=/mypage");
        return;
      }
      setMe(r as Me);

      const [bal, list] = await Promise.all([
        fetch("/api/stars/balance", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/readings", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
      ]);
      if (bal) setBalance(bal.balance ?? 0);
      if (list?.readings) setReadings(list.readings);
      setLoading(false);
    })();
  }, [router]);

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
    if (!withdrawAck) return;
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
      <div className="w-full max-w-md mx-auto px-5 mb-5 flex items-center justify-between">
        <Link href="/" className="text-[12px] text-text-light/70">
          ‹ 홈으로
        </Link>
        <button onClick={handleLogout} className="text-[12px] text-text-light/70">
          로그아웃
        </button>
      </div>

      {/* 프로필 카드 */}
      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30 flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-lilac-soft overflow-hidden flex items-center justify-center">
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
              카카오 · 풀이 {readings.length}회
            </div>
          </div>
        </div>
      </div>

      {/* 별 잔액 */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div className="bg-gradient-to-br from-gold-soft/30 via-cream-warm to-lilac-soft/40 rounded-2xl p-4 border border-gold-soft/40 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-text-light/80 mb-1">내 별 잔액</div>
            <div className="text-[20px] font-bold text-eye-purple">
              ⭐ {balance ?? 0}별
            </div>
          </div>
          <Link
            href="/shop"
            className="px-4 py-2 rounded-xl bg-lilac-deep text-white font-bold text-[12px]"
          >
            충전
          </Link>
        </div>
      </div>

      {/* 리딩 히스토리 */}
      <div className="w-full max-w-md mx-auto px-5">
        <div className="text-[12px] font-bold text-eye-purple mb-2">
          나의 사주 풀이 ({readings.length})
        </div>
        {readings.length === 0 ? (
          <div className="bg-cream-warm rounded-2xl p-6 border border-lilac-mid/30 text-center">
            <p className="text-[13px] text-text-light leading-relaxed">
              아직 풀이가 없어.
              <br />첫 사주를 별콩이랑 펼쳐볼까?
            </p>
            <Link
              href="/saju"
              className="mt-3 inline-block px-5 py-2 rounded-xl bg-lilac-deep text-white text-[12px] font-bold"
            >
              사주 보러가기
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {readings.map((r) => (
              <Link
                key={r.id}
                href={`/saju/result?id=${r.id}`}
                className="bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex items-center gap-3 hover:border-lilac-deep/50 transition"
              >
                <div className="w-10 h-10 rounded-lg bg-gold-soft/30 flex items-center justify-center text-[13px] font-bold text-eye-purple">
                  {r.sajuData?.dayStem ?? "-"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-eye-purple line-clamp-1 font-medium">
                    {r.question}
                  </div>
                  <div className="text-[11px] text-text-light/70 mt-0.5 flex items-center gap-1.5">
                    <span>
                      {new Date(r.createdAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span>·</span>
                    <span>⭐ {r.starsSpent}</span>
                    {r.hasSensitive && (
                      <>
                        <span>·</span>
                        <span className="text-rose-400">🤍</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-text-light/40 text-sm">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 회원 탈퇴 */}
      <div className="w-full max-w-md mx-auto px-5 mt-10 pt-5 border-t border-lilac-mid/20">
        {!showWithdrawConfirm ? (
          <button
            onClick={() => setShowWithdrawConfirm(true)}
            className="text-[11px] text-text-light/50 underline"
          >
            회원 탈퇴
          </button>
        ) : (
          <div className="bg-cream-warm rounded-2xl p-4 border border-rose-200">
            <p className="text-[13px] text-eye-purple mb-2 font-bold">
              정말 떠나려고?
            </p>
            <p className="text-[11px] text-text-light leading-relaxed mb-3">
              탈퇴하면 너의 사주 풀이, 별 잔액, 모든 기록이 영구적으로 삭제돼.
              되돌릴 수 없어.
            </p>
            <label className="flex items-center gap-2 text-[12px] text-text-light mb-3">
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
                disabled={!withdrawAck}
                className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                탈퇴하기
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
