"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SajuBoard from "@/components/saju/SajuBoard";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import type { SajuResult } from "@/lib/saju/calc";

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

interface ProfileItem {
  id: string;
  displayName: string;
  relationType: "self" | "family" | "friend" | "partner" | "other";
  birthDate: string;
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: "male" | "female" | "other";
  isPrimary: boolean;
  saju: SajuResult;
}

const RELATION_LABEL: Record<string, string> = {
  family: "가족",
  friend: "친구",
  partner: "연인",
  other: "기타",
};

// HH:MM → HOUR_BRANCHES 시작 hour (prefill용). null이면 null(시간 모름).
function birthTimeToBranchHour(t: string | null): number | null {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  // 자시 23-01 → 0, 이후 2시간 단위. 23시는 자시(0)로.
  if (h === 23) return 0;
  return h - (h % 2);
}

export default function MyPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [readings, setReadings] = useState<ReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [withdrawAck, setWithdrawAck] = useState(false);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingSelf, setEditingSelf] = useState(false);
  const [showAddAcq, setShowAddAcq] = useState(false);
  const [editAcqId, setEditAcqId] = useState<string | null>(null);
  const [deleteAcqId, setDeleteAcqId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [r, bal, list, profs] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/stars/balance", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/readings", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/profiles", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
      ]);
      if (!r?.isAuthenticated) {
        router.replace("/login?next=/mypage");
        return;
      }
      setMe(r as Me);
      if (bal) setBalance(bal.balance ?? 0);
      if (list?.readings) setReadings(list.readings);
      if (profs?.profiles) setProfiles(profs.profiles as ProfileItem[]);
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
  const acquaintances = profiles.filter((p) => !p.isPrimary);

  const saveSelf = async (payload: ProfilePayload) => {
    setSavingProfile(true);
    try {
      const url = self ? `/api/profiles/${self.id}` : "/api/profiles";
      const method = self ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await reloadProfiles();
        setEditingSelf(false);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const saveAcquaintance = async (payload: ProfilePayload, editId: string | null) => {
    setSavingProfile(true);
    try {
      const url = editId ? `/api/profiles/${editId}` : "/api/profiles";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await reloadProfiles();
        setShowAddAcq(false);
        setEditAcqId(null);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const deleteAcquaintance = async (id: string) => {
    const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
    if (res.ok) {
      await reloadProfiles();
      setDeleteAcqId(null);
    }
  };

  const toInitial = (p: ProfileItem) => ({
    year: Number(p.birthDate.slice(0, 4)),
    month: Number(p.birthDate.slice(5, 7)),
    day: Number(p.birthDate.slice(8, 10)),
    hour: birthTimeToBranchHour(p.birthTime),
    isLunar: p.isLunarInput,
    isLeapMonth: p.isLeapMonth,
    gender: p.gender,
  });

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

      {/* 계정 사주 (프로필 카드 영역) */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] font-bold text-eye-purple">내 사주</div>
          {self && !editingSelf && (
            <button
              onClick={() => setEditingSelf(true)}
              className="text-[11px] text-text-light/60 underline"
            >
              수정
            </button>
          )}
        </div>

        {self && !editingSelf ? (
          <>
            <SajuBoard saju={self.saju} />
            <p className="text-[11px] text-text-light/70 text-center mt-2">
              {self.birthDate.replace(/-/g, ". ")}
              {self.isLunarInput ? " · 음력" : " · 양력"}
              {self.birthTime ? ` · ${self.birthTime}` : " · 시간 모름"}
            </p>
          </>
        ) : editingSelf ? (
          <>
            <ProfileForm
              mode="self"
              initial={self ? toInitial(self) : undefined}
              defaultSelfName={me.user.nickname}
              submitLabel="저장하기"
              loading={savingProfile}
              onSubmit={saveSelf}
            />
            <button
              onClick={() => setEditingSelf(false)}
              className="mx-auto mt-3 block text-[12px] text-text-light/60 underline"
            >
              취소
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditingSelf(true)}
            className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
          >
            내 사주 입력하기
          </button>
        )}
      </div>

      {/* 지인 사주 목록 */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] font-bold text-eye-purple">지인 사주</div>
          {!showAddAcq && !editAcqId && (
            <button
              onClick={() => setShowAddAcq(true)}
              className="text-[11px] text-lilac-deep font-bold underline"
            >
              + 지인 추가
            </button>
          )}
        </div>

        {(showAddAcq || editAcqId) && (
          <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30 mb-3">
            <ProfileForm
              mode="acquaintance"
              initial={
                editAcqId
                  ? toInitial(acquaintances.find((a) => a.id === editAcqId)!)
                  : undefined
              }
              initialName={
                editAcqId
                  ? acquaintances.find((a) => a.id === editAcqId)?.displayName
                  : undefined
              }
              initialRelation={
                editAcqId
                  ? (acquaintances.find((a) => a.id === editAcqId)
                      ?.relationType as Exclude<ProfileItem["relationType"], "self">)
                  : undefined
              }
              submitLabel={editAcqId ? "수정하기" : "추가하기"}
              loading={savingProfile}
              onSubmit={(payload) => saveAcquaintance(payload, editAcqId)}
            />
            <button
              onClick={() => {
                setShowAddAcq(false);
                setEditAcqId(null);
              }}
              className="mx-auto mt-3 block text-[12px] text-text-light/60 underline"
            >
              취소
            </button>
          </div>
        )}

        {acquaintances.length === 0 && !showAddAcq ? (
          <p className="text-[12px] text-text-light/70 text-center py-4">
            아직 등록한 지인 사주가 없어
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {acquaintances.map((a) => (
              <div
                key={a.id}
                className="bg-cream-warm rounded-2xl p-3 border border-lilac-mid/30 flex items-center justify-between"
              >
                <div>
                  <div className="text-[14px] font-bold text-eye-purple">
                    {a.displayName}
                    <span className="ml-2 text-[11px] text-text-light/70 font-normal">
                      {RELATION_LABEL[a.relationType] ?? ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-text-light/70 mt-0.5">
                    {a.birthDate.replace(/-/g, ". ")}
                    {a.isLunarInput ? " · 음력" : " · 양력"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditAcqId(a.id);
                      setShowAddAcq(false);
                    }}
                    className="text-[11px] text-text-light/60 underline"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => setDeleteAcqId(a.id)}
                    className="text-[11px] text-rose-400 underline"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 지인 삭제 확인 모달 */}
      {deleteAcqId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
            <p className="text-[14px] font-bold text-eye-purple mb-2">지인 사주 삭제</p>
            <p className="text-[12px] text-text-light leading-relaxed mb-4">
              이 지인 사주를 삭제할까? 과거 풀이 기록은 그대로 남아.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteAcqId(null)}
                className="flex-1 py-2 rounded-xl border border-lilac-mid text-eye-purple text-[12px]"
              >
                취소
              </button>
              <button
                onClick={() => deleteAcquaintance(deleteAcqId)}
                className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-[12px] font-bold"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

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
