"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileForm, { type ProfilePayload } from "@/components/saju/ProfileForm";
import {
  RELATIONSHIP_STATUS_LABELS,
  type RelationshipStatus,
} from "@/lib/relationship/types";

const STATUS_OPTIONS: RelationshipStatus[] = [
  "crush",
  "dating",
  "breakup",
  "onesided",
];

interface MyProfileSummary {
  id: string;
  birthDate: string;
  isLunarInput: boolean;
}

// 서버가 partnerProfile 에 relationType:'partner' 를 주입하므로 클라는 보내지 않음
type PartnerProfileInput = Omit<ProfilePayload, "relationType">;

export interface RegisterOnboardingProps {
  /** 등록 성공 후 부모가 관계 상태를 다시 조회하도록 알림 */
  onRegistered: () => void;
  /** 1단계에서 "취소" 클릭 시 콜드스타트로 복귀 */
  onCancel?: () => void;
}

export default function RegisterOnboarding({
  onRegistered,
  onCancel,
}: RegisterOnboardingProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<RelationshipStatus | null>(null);

  const [myProfile, setMyProfile] = useState<MyProfileSummary | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [useMyProfile, setUseMyProfile] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 3단계 진입 시 필요한 "기존 primary 프로필 있는지"만 가볍게 조회
  useEffect(() => {
    void (async () => {
      const d = await fetch("/api/profiles", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const profiles = (d?.profiles ?? []) as {
        id: string;
        birthDate: string;
        isLunarInput: boolean;
        isPrimary: boolean;
      }[];
      const primary = profiles.find((p) => p.isPrimary);
      if (primary) {
        setMyProfile({
          id: primary.id,
          birthDate: primary.birthDate,
          isLunarInput: primary.isLunarInput,
        });
      }
      setProfilesLoading(false);
    })();
  }, []);

  const trimmedLabel = label.trim();
  const labelValid = trimmedLabel.length >= 1 && trimmedLabel.length <= 50;

  const register = async (partnerProfile: PartnerProfileInput | null) => {
    if (!status || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { label: trimmedLabel, status };
      if (myProfile && useMyProfile) body.selfProfileId = myProfile.id;
      if (partnerProfile) body.partnerProfile = partnerProfile;

      const res = await fetch("/api/relationship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        router.push("/login?next=/relationship");
        return;
      }
      if (!res.ok) {
        setError("등록에 실패했어. 잠시 후 다시 시도해줘.");
        return;
      }
      onRegistered();
    } catch {
      setError("네트워크 오류야. 잠시 후 다시 시도해줘.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePartnerSubmit = (payload: ProfilePayload) => {
    const { displayName, birthDate, birthTime, isLunarInput, isLeapMonth, gender } =
      payload;
    void register({ displayName, birthDate, birthTime, isLunarInput, isLeapMonth, gender });
  };

  return (
    <div className="w-full">
      <div className="px-5 flex items-center justify-between mb-5">
        <button
          type="button"
          onClick={() =>
            step === 1 ? onCancel?.() : setStep((s) => (s === 3 ? 2 : 1))
          }
          className="text-[12px] text-text-light/70 underline"
        >
          {step === 1 ? "취소" : "이전"}
        </button>
        <span className="text-[11px] font-bold text-lilac-deep">{step} / 3</span>
      </div>

      {step === 1 && (
        <div className="px-5">
          <h2 className="text-[16px] font-bold text-eye-purple mb-1">
            상대를 뭐라고 부를까?
          </h2>
          <p className="text-[12.5px] text-text-light mb-4 leading-relaxed">
            앞으로 별콩이가 이 관계를 이야기할 때 쓸 호칭이야.
          </p>
          <input
            type="text"
            value={label}
            maxLength={50}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="예: 민준, 자기, 우리 애기"
            className="w-full px-3 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] mb-5"
          />
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!labelValid}
            className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            다음
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="px-5">
          <h2 className="text-[16px] font-bold text-eye-purple mb-1">
            지금 두 사람은 어떤 사이야?
          </h2>
          <p className="text-[12.5px] text-text-light mb-4 leading-relaxed">
            지금 상황에 가장 가까운 걸 골라줘.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`py-3 rounded-xl text-[14px] font-bold transition ${
                  status === s
                    ? "bg-lilac-deep text-white"
                    : "bg-cream-warm text-text-light border border-lilac-mid/40"
                }`}
              >
                {RELATIONSHIP_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep(3)}
            disabled={!status}
            className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            다음
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="px-5">
            <h2 className="text-[16px] font-bold text-eye-purple mb-1">
              생년월일시도 알려줄래?
            </h2>
            <p className="text-[12.5px] text-text-light mb-4 leading-relaxed">
              나중에 궁합을 볼 때 필요해 — 지금 몰라도 괜찮아, 나중에 추가할 수 있어.
            </p>

            {!profilesLoading && myProfile && (
              <label className="flex items-start gap-2.5 mb-5 p-3.5 rounded-2xl bg-cream-warm border border-lilac-mid/30">
                <input
                  type="checkbox"
                  checked={useMyProfile}
                  onChange={(e) => setUseMyProfile(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-lilac-deep"
                />
                <span className="text-[13px] text-eye-purple">
                  <span className="font-bold">내 사주 정보 함께 등록하기</span>
                  <br />
                  <span className="text-[11.5px] text-text-light/80">
                    {myProfile.birthDate.replace(/-/g, ". ")}
                    {myProfile.isLunarInput ? " · 음력" : " · 양력"} (이미 등록된 정보)
                  </span>
                </span>
              </label>
            )}
            {!profilesLoading && !myProfile && (
              <p className="text-[11.5px] text-text-light/70 mb-5 leading-relaxed">
                아직 등록된 내 사주가 없어 — 마이페이지에서 추가하면 다음부터 자동으로
                함께 볼 수 있어.
              </p>
            )}

            <p className="text-[13px] font-bold text-eye-purple mb-2">
              {trimmedLabel || "상대"}의 생년월일시
            </p>
          </div>

          <ProfileForm
            mode="self"
            defaultSelfName={trimmedLabel}
            submitLabel="등록 완료하기"
            loading={submitting}
            onSubmit={handlePartnerSubmit}
          />

          <div className="px-5">
            {error && (
              <p className="mt-3 text-[12px] text-rose-500 text-center">{error}</p>
            )}
            <button
              type="button"
              onClick={() => void register(null)}
              disabled={submitting}
              className="mx-auto mt-4 block text-[12.5px] text-text-light/70 underline disabled:opacity-50"
            >
              나중에 추가할래 — 건너뛰고 시작하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
