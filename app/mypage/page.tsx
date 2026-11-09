"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Footer from "@/components/layout/Footer";
import StorageSummary from "@/components/mypage/StorageSummary";
import SajuBoard from "@/components/saju/SajuBoard";
import SelfSajuEditModal from "@/components/mypage/SelfSajuEditModal";
import AcquaintanceListModal from "@/components/mypage/AcquaintanceListModal";
import Dialog from "@/components/common/Dialog";
import OverlayCloseButton from "@/components/common/OverlayCloseButton";
import { readingCategory, type ReadingCategory } from "@/lib/readings/category";
import { clearPendingDraw } from "@/lib/tarot/pending-draw";
import { postToApp } from "@/lib/app-context";
import { appSupportsPush } from "@/lib/app-push";
import { useAppInfo } from "@/lib/use-app-info";
import { type ProfileItem } from "@/components/mypage/sajuShared";
import { useScreenCache } from "@/lib/screen-cache";

interface Me {
  user: { id: string; nickname: string; profile_img: string | null } | null;
  isAuthenticated: boolean;
}

// /api/readings 응답 항목 — 종목 집계(readingCategory)에 필요한 필드만 선언.
interface ReadingListItem {
  consultationType?: string | null;
  emotionTag?: string | null;
}

// 화면 기억(lib/screen-cache) — 다시 열면 '잠시만…' 대신 마지막 모습을 바로 그리고 새로 불러와 바꾼다
interface MyPageSnapshot {
  me: Me;
  balance: number | null;
  profiles: ProfileItem[];
  relationshipProfileIds: string[];
  relationshipCount: number;
  relationshipPassActive: boolean;
  readings: ReadingListItem[];
  supportUnread: number;
}
const CACHE_KEY = "mypage";

export default function MyPage() {
  const router = useRouter();
  const { ready: appReady } = useAppInfo();
  const { cached, save } = useScreenCache<MyPageSnapshot>(CACHE_KEY);
  const [me, setMe] = useState<Me | null>(cached?.me ?? null);
  const [balance, setBalance] = useState<number | null>(cached?.balance ?? null);
  const [loading, setLoading] = useState(!cached);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [withdrawAck, setWithdrawAck] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [profiles, setProfiles] = useState<ProfileItem[]>(cached?.profiles ?? []);
  const [showSelfEdit, setShowSelfEdit] = useState(false);
  const [showAcqModal, setShowAcqModal] = useState(false);
  const [relationshipProfileIds, setRelationshipProfileIds] = useState<string[]>(cached?.relationshipProfileIds ?? []);
  const [relationshipCount, setRelationshipCount] = useState(cached?.relationshipCount ?? 0);
  const [relationshipPassActive, setRelationshipPassActive] = useState(cached?.relationshipPassActive ?? false);
  const [readings, setReadings] = useState<ReadingListItem[]>(cached?.readings ?? []);
  const [supportUnread, setSupportUnread] = useState(cached?.supportUnread ?? 0);

  useEffect(() => {
    if (loading || !me?.user) return;
    save({
      me,
      balance,
      profiles,
      relationshipProfileIds,
      relationshipCount,
      relationshipPassActive,
      readings,
      supportUnread,
    } satisfies MyPageSnapshot);
  }, [save, loading, me, balance, profiles, relationshipProfileIds, relationshipCount, relationshipPassActive, readings, supportUnread]);

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
        // 우리 사이 ON/OFF = 최근 관계의 활성 연애 패스 유무 (GET 이 pass 반환)
        setRelationshipPassActive(rel.pass != null);
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
    // 앱 안이면 앱도 로그아웃(그 기기 토큰 폐기) — 브라우저에선 아무것도 안 한다(스펙 2026-10-12-앱-1 §5)
    postToApp("auth.loggedOut");
    if (typeof window !== "undefined") {
      localStorage.removeItem("byeolkong_user");
      localStorage.removeItem("byeolkong_token");
      sessionStorage.removeItem("byeolkong:auth-sync");
      // 입구 반반 때 남은 진행 저장(고민 원문)도 지운다(공용 기기 — lib/tarot/pending-draw.ts)
      clearPendingDraw(localStorage);
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
        // 앱 안이면 앱도 로그아웃(기기 토큰 정리) — 서버 쪽 앱 토큰은 회원 삭제로 이미 지워졌다
        postToApp("auth.loggedOut");
        if (typeof window !== "undefined") {
          localStorage.removeItem("byeolkong_user");
          localStorage.removeItem("byeolkong_token");
          // 입구 반반 때 남은 진행 저장(고민 원문)도 지운다(공용 기기 — lib/tarot/pending-draw.ts)
          clearPendingDraw(localStorage);
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
        <p className="text-text-light text-14">잠시만…</p>
      </main>
    );
  }

  return (
    <main className={`flex flex-1 flex-col items-center py-8 w-full ${cached ? "" : "animate-fade-in"}`}>
      {/* 프로필 헤더 — 프사·닉네임·별 잔액·충전 (결제·별 내역은 계정 블록으로 이동) */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <div className="bg-gradient-to-br from-night-deep via-eye-purple to-lilac-deep rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-lilac-soft overflow-hidden flex items-center justify-center ring-1 ring-white/30 shrink-0">
              {me.user.profile_img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.user.profile_img}
                  alt="프로필"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Image src="/byeolkong-main.png" alt="별콩이" width={56} height={56} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-14 font-bold text-white truncate">
                {me.user.nickname}
              </div>
              <div className="text-20 font-bold text-gold-soft mt-0.5">
                ⭐ {balance ?? 0}별
              </div>
            </div>
            <Link
              href="/shop"
              className="shrink-0 px-4 py-2 rounded-xl bg-white text-eye-purple font-bold text-12"
            >
              충전
            </Link>
          </div>
        </div>
      </div>

      {/* 보관함 — 종목별 요약 (한 박스 가로 4분할) */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <div className="text-12 font-bold text-eye-purple mb-3 flex items-center">
          <span className="inline-block w-[7px] h-[7px] rounded-full bg-lilac-deep mr-1.5" aria-hidden />
          보관함
        </div>
        <StorageSummary counts={counts} relationshipPassActive={relationshipPassActive} />
      </div>

      {/* 내 사주 — 명식 인라인 노출, 편집·지인은 모달 */}
      <div className="w-full max-w-md mx-auto px-5 mb-7">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-12 font-bold text-eye-purple flex items-center">
            <span className="inline-block w-[7px] h-[7px] rounded-full bg-lilac-deep mr-1.5" aria-hidden />
            내 사주
          </div>
          {self?.saju && (
            <button
              onClick={() => setShowSelfEdit(true)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-lilac-soft/60 text-eye-purple text-11 font-bold"
            >
              수정
            </button>
          )}
        </div>

        {self?.saju ? (
          <div className="bg-cream-warm rounded-2xl border border-lilac-mid/20 shadow-card py-4">
            <SajuBoard saju={self.saju} />
          </div>
        ) : (
          <div className="bg-cream-warm rounded-2xl border border-lilac-mid/20 shadow-card px-4 py-6 text-center">
            <p className="text-12 text-text-light/70 mb-3">
              {self
                ? "생일을 알려주면 사주도 보여줄게."
                : "아직 내 사주를 입력하지 않았어. 명식을 보려면 먼저 입력해줘."}
            </p>
            <button
              onClick={() => setShowSelfEdit(true)}
              className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-14"
            >
              {self ? "생일 추가하기" : "내 사주 입력하기"}
            </button>
          </div>
        )}

        {/* 지인 사주 → 팝업 */}
        <button
          onClick={() => setShowAcqModal(true)}
          className="mt-2.5 w-full flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-lilac-mid/20 shadow-card"
        >
          <span
            className="shrink-0 w-[30px] h-[30px] rounded-lg bg-lilac-soft flex items-center justify-center text-15"
            aria-hidden
          >
            👥
          </span>
          <span className="flex-1 text-left text-14 text-eye-purple font-medium">
            지인 사주 <span className="text-text-light">{acquaintanceCount}명</span>
          </span>
          <span className="shrink-0 px-3 py-1.5 rounded-lg bg-lilac-soft/60 text-eye-purple text-11 font-bold">
            관리
          </span>
        </button>
      </div>

      {showSelfEdit && (
        <SelfSajuEditModal
          self={self}
          selfDisplayName={me.user.nickname}
          onReload={reloadProfiles}
          onClose={() => setShowSelfEdit(false)}
        />
      )}
      {showAcqModal && (
        <AcquaintanceListModal
          profiles={profiles}
          relationshipProfileIds={relationshipProfileIds}
          onReload={reloadProfiles}
          onClose={() => setShowAcqModal(false)}
        />
      )}

      {/* 계정 */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div className="text-12 font-bold text-eye-purple mb-3 flex items-center">
          <span className="inline-block w-[7px] h-[7px] rounded-full bg-lilac-deep mr-1.5" aria-hidden />
          계정
        </div>
        <div className="bg-white rounded-2xl border border-lilac-mid/20 shadow-card overflow-hidden divide-y divide-lilac-mid/15">
          <Link href="/mypage/support" className="flex items-center gap-3 p-3.5">
            <span className="shrink-0 w-[30px] h-[30px] rounded-lg bg-lilac-soft flex items-center justify-center">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className="text-lilac-deep" aria-hidden>
                <path d="M12,1C7,1 3,5 3,10V17A3,3 0 0,0 6,20H9V12H5V10A7,7 0 0,1 12,3A7,7 0 0,1 19,10V12H15V20H19A3,3 0 0,0 22,17V10C22,5 17,1 12,1Z" />
              </svg>
            </span>
            <span className="flex-1 text-14 text-eye-purple font-medium flex items-center gap-2">
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
          <Link href="/mypage/payments" className="flex items-center gap-3 p-3.5">
            <span className="shrink-0 w-[30px] h-[30px] rounded-lg bg-lilac-soft flex items-center justify-center">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className="text-lilac-deep" aria-hidden>
                <path d="M20,8H4V6H20M20,18H4V12H20M20,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6C22,4.89 21.1,4 20,4Z" />
              </svg>
            </span>
            <span className="flex-1 text-14 text-eye-purple font-medium">
              결제 · 별 내역
            </span>
            <span className="text-text-light/40">›</span>
          </Link>
          {appReady && appSupportsPush() && (
            <Link href="/mypage/notifications" className="flex items-center gap-3 p-3.5">
              <span className="shrink-0 w-[30px] h-[30px] rounded-lg bg-lilac-soft flex items-center justify-center">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className="text-lilac-deep" aria-hidden>
                  <path d="M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21" />
                </svg>
              </span>
              <span className="flex-1 text-14 text-eye-purple font-medium">알림 설정</span>
              <span className="text-text-light/40">›</span>
            </Link>
          )}
          {/* 앱에서만 — 앱은 푸터를 숨기므로 약관·사업자 정보를 여기서 연다(스펙 2026-11-07-앱-화면 §9) */}
          <Link href="/mypage/legal" className="app-only flex items-center gap-3 p-3.5">
            <span className="shrink-0 w-[30px] h-[30px] rounded-lg bg-lilac-soft flex items-center justify-center">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className="text-lilac-deep" aria-hidden>
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
              </svg>
            </span>
            <span className="flex-1 text-14 text-eye-purple font-medium">약관·사업자 정보</span>
            <span className="text-text-light/40">›</span>
          </Link>
          <button
            onClick={() => setShowWithdrawConfirm(true)}
            className="w-full flex items-center gap-3 p-3.5"
          >
            <span className="shrink-0 w-[30px] h-[30px] rounded-lg bg-lilac-soft/60 flex items-center justify-center">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className="text-text-light/70" aria-hidden>
                <path d="M15,14C12.33,14 7,15.33 7,18V20H23V18C23,15.33 17.67,14 15,14M6,10V7H4V10H1V12H4V15H6V12H9V10M15,12A4,4 0 0,0 19,8A4,4 0 0,0 15,4A4,4 0 0,0 11,8A4,4 0 0,0 15,12Z" />
              </svg>
            </span>
            <span className="flex-1 text-left text-14 text-text-light/70 font-medium">
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
          className="w-full py-3 rounded-xl bg-eye-purple text-white font-bold text-14"
        >
          로그아웃
        </button>
      </div>

      {/* 회원 탈퇴 확인 모달 — 버튼으로만 닫힌다. body 포털(Dialog)이라 <main> 의 fade 에 위치가 묶이지 않는다 */}
      {showWithdrawConfirm && (
        <Dialog
          label="회원 탈퇴 확인"
          role="alertdialog"
          dismissible={false}
          onClose={() => {
            setShowWithdrawConfirm(false);
            setWithdrawAck(false);
          }}
          z={50}
          widthClassName="max-w-xs"
          gutterClassName="px-5"
          backdropClassName="bg-black/30"
        >
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
            <p className="text-14 font-bold text-eye-purple mb-2">
              정말 떠나려고?
            </p>
            <p className="text-12 text-text-light leading-relaxed mb-3">
              탈퇴하면 너의 사주 풀이, 별 잔액, 모든 기록이 영구적으로 삭제돼.
              되돌릴 수 없어.
            </p>
            <label className="flex items-center gap-2 text-12 text-text-light mb-4">
              <input
                type="checkbox"
                checked={withdrawAck}
                onChange={(e) => setWithdrawAck(e.target.checked)}
                className="w-4 h-4 accent-rose-500"
              />
              위 내용에 동의해
            </label>
            <div className="flex gap-2">
              <OverlayCloseButton className="flex-1 py-2 rounded-xl border border-lilac-mid text-eye-purple text-12">
                취소
              </OverlayCloseButton>
              <button
                onClick={handleWithdraw}
                disabled={!withdrawAck || withdrawing}
                className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-12 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                탈퇴하기
              </button>
            </div>
          </div>
        </Dialog>
      )}

      <Footer />
    </main>
  );
}
