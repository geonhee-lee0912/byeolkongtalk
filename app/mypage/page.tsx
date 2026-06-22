"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SajuBoard from "@/components/saju/SajuBoard";
import Footer from "@/components/layout/Footer";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import type { SajuResult } from "@/lib/saju/calc";
import { ELEMENT_COLORS } from "@/lib/saju/elements";

interface Me {
  user: { id: string; nickname: string; profile_img: string | null } | null;
  isAuthenticated: boolean;
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
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingSelf, setEditingSelf] = useState(false);
  const [showAddAcq, setShowAddAcq] = useState(false);
  const [editAcqId, setEditAcqId] = useState<string | null>(null);
  const [deleteAcqId, setDeleteAcqId] = useState<string | null>(null);
  const [listPage, setListPage] = useState(0);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    void (async () => {
      const [r, bal, profs] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/stars/balance", { cache: "no-store" })
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
      if (profs?.profiles) setProfiles(profs.profiles as ProfileItem[]);
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
  const acquaintances = profiles.filter((p) => !p.isPrimary);

  const LIST_PAGE_SIZE = 5;
  const totalListPages = Math.max(1, Math.ceil(acquaintances.length / LIST_PAGE_SIZE));
  const safeListPage = Math.min(listPage, totalListPages - 1);
  const pagedProfiles = acquaintances.slice(
    safeListPage * LIST_PAGE_SIZE,
    safeListPage * LIST_PAGE_SIZE + LIST_PAGE_SIZE
  );

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

      {/* 프로필 카드 (명식 통합) */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30">
          <div className="flex items-center gap-3">
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
                {self
                  ? `${self.birthDate.replace(/-/g, ". ")}${
                      self.isLunarInput ? " · 음력" : " · 양력"
                    }${
                      birthTimeToSijin(self.birthTime)
                        ? ` · ${birthTimeToSijin(self.birthTime)}`
                        : " · 시간 모름"
                    }`
                  : "카카오"}
              </div>
            </div>
            {self && !editingSelf && (
              <button
                onClick={() => setEditingSelf(true)}
                className="text-[11px] text-text-light/60 underline self-start"
              >
                수정
              </button>
            )}
          </div>

          {/* 내 명식 */}
          <div className="mt-3 pt-3 border-t border-lilac-mid/20 -mx-4">
            {self && !editingSelf ? (
              <SajuBoard saju={self.saju} showDetail={false} />
            ) : editingSelf ? (
              <div className="px-4">
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
              </div>
            ) : (
              <div className="px-4">
                <p className="text-[12px] text-text-light/70 text-center mb-3">
                  아직 내 사주를 입력하지 않았어. 명식을 보려면 먼저 입력해줘.
                </p>
                <button
                  onClick={() => setEditingSelf(true)}
                  className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
                >
                  내 사주 입력하기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 지인 사주 */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] font-bold text-eye-purple">
            지인 사주{" "}
            <span className="text-text-light/60 font-normal">{acquaintances.length}</span>
          </div>
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

        {acquaintances.length === 0 && !showAddAcq && !editAcqId ? (
          <div className="bg-cream-warm rounded-2xl border border-lilac-mid/30 px-4 py-6">
            <p className="text-[12px] text-text-light/70 text-center mb-3">
              아직 함께 보는 사주가 없어. 지인 사주를 추가하면 여기에 모아서 함께 풀어볼 수 있어.
            </p>
            <button
              onClick={() => setShowAddAcq(true)}
              className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
            >
              지인 추가하기
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pagedProfiles.map((p) => (
              <div
                key={p.id}
                className="bg-cream-warm rounded-2xl border border-lilac-mid/25 p-3 flex items-center gap-3"
              >
                <div
                  className="shrink-0 w-11 h-11 rounded-xl border border-lilac-mid/20 flex items-center justify-center"
                  style={{
                    backgroundColor: ELEMENT_COLORS[p.saju.dayElement].bg,
                    color: ELEMENT_COLORS[p.saju.dayElement].text,
                  }}
                >
                  <span className="text-[16px] font-bold leading-none">
                    {p.saju.pillars.day.hanja}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-eye-purple truncate">
                    {p.displayName}
                    <span className="ml-1.5 text-[10px] font-bold text-text-light/70 bg-lilac-soft/60 rounded-full px-1.5 py-0.5">
                      {RELATION_LABEL[p.relationType] ?? "지인"}
                    </span>
                  </div>
                  <div className="text-[11px] text-text-light/70 mt-0.5 truncate">
                    {p.saju.dayStem}
                    {p.saju.dayElement} 일간 · {p.birthDate.replace(/-/g, ". ")}
                    {birthTimeToSijin(p.birthTime)
                      ? ` · ${birthTimeToSijin(p.birthTime)}`
                      : " · 시간 모름"}
                  </div>
                </div>
                <button
                  onClick={() => setSheetId(p.id)}
                  aria-label="더보기"
                  className="shrink-0 p-1.5 rounded-lg text-text-light/60 hover:bg-lilac-soft/50"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="12" cy="19" r="1.6" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {totalListPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              onClick={() => setListPage((n) => Math.max(0, n - 1))}
              disabled={safeListPage === 0}
              aria-label="이전"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            {Array.from({ length: totalListPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setListPage(i)}
                aria-label={`${i + 1}페이지`}
                className={`w-7 h-7 rounded-lg text-[12px] font-bold ${
                  i === safeListPage
                    ? "bg-lilac-deep text-white"
                    : "text-text-light/70 hover:bg-lilac-soft/50"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setListPage((n) => Math.min(totalListPages - 1, n + 1))}
              disabled={safeListPage === totalListPages - 1}
              aria-label="다음"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 디바이더 */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div className="h-px bg-lilac-mid/30" />
      </div>

      {/* 계정·고객 메뉴 */}
      <div className="w-full max-w-md mx-auto px-5 mb-5 flex flex-col gap-2">
        <Link
          href="/mypage/support"
          className="bg-white rounded-2xl p-3.5 border border-lilac-mid/30 flex items-center justify-between"
        >
          <span className="text-[14px] text-eye-purple font-medium flex items-center gap-2">
            고객센터 / 문의
            {supportUnread > 0 && (
              <span className="relative flex h-2 w-2" aria-label="새 답변">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lilac-deep opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-lilac-deep" />
              </span>
            )}
          </span>
          <span className="text-text-light/50">›</span>
        </Link>
        <button
          onClick={() => setShowWithdrawConfirm(true)}
          className="bg-white rounded-2xl p-3.5 border border-lilac-mid/30 flex items-center justify-between"
        >
          <span className="text-[14px] text-text-light/70 font-medium">
            회원 탈퇴
          </span>
          <span className="text-text-light/50">›</span>
        </button>
      </div>

      {/* 지인 행 케밥 시트 */}
      {sheetId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
          onClick={() => setSheetId(null)}
        >
          <div
            className="bg-white rounded-t-2xl w-full max-w-md p-2 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setEditAcqId(sheetId);
                setShowAddAcq(false);
                setSheetId(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="w-full py-3.5 rounded-xl text-[14px] text-eye-purple font-medium hover:bg-lilac-soft/40"
            >
              수정
            </button>
            <button
              onClick={() => {
                setDeleteAcqId(sheetId);
                setSheetId(null);
              }}
              className="w-full py-3.5 rounded-xl text-[14px] text-rose-500 font-medium hover:bg-rose-50"
            >
              삭제
            </button>
            <button
              onClick={() => setSheetId(null)}
              className="w-full py-3.5 rounded-xl text-[14px] text-text-light/70"
            >
              취소
            </button>
          </div>
        </div>
      )}

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
                disabled={!withdrawAck}
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
