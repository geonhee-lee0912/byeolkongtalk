"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BirthdaySelect from "@/components/byeoljari/BirthdaySelect";
import ConstellationPreview from "@/components/byeoljari/ConstellationPreview";

// 만들기 → memberId 저장(뷰어 식별) → 개인 별자리로 이동. 진입 시 claim 트리거 유지.
export default function ByeoljariCreatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [namePublic, setNamePublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem("byeolkong_user"));
    let cancelled = false;
    (async () => {
      // claim(익명 맵을 로그인 계정으로 이관) 먼저 → 그래야 owner_user_id 로 내 맵이 잡힌다.
      await fetch("/api/fortune/byeoljari/claim", { method: "POST" }).catch(() => {});
      const res = await fetch("/api/fortune/byeoljari").then((r) => r.json()).catch(() => null);
      if (cancelled) return;
      if (res?.map?.shareId) {
        if (res.map.memberId) {
          localStorage.setItem(`byeoljari:me:${res.map.shareId}`, res.map.memberId);
        }
        router.replace(`/fortune/byeoljari/${res.map.shareId}`);
        return; // redirect 중이므로 checking 유지(폼 안 보임)
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/fortune/byeoljari", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name, birthDate: birth, namePublic }),
      });
      const data = await res.json();
      if (data.ok && data.shareId) {
        if (data.memberId) localStorage.setItem(`byeoljari:me:${data.shareId}`, data.memberId);
        router.push(`/fortune/byeoljari/${data.shareId}`);
      }
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center text-text-light">
        <p className="animate-star-twinkle text-2xl">✨</p>
        <p className="mt-3 text-sm">별자리를 불러오는 중…</p>
      </main>
    );
  }

  return (
    // w-full — body flex-col 안에서 mx-auto 가 stretch 를 무효화해 내용물 폭으로 줄어드는 것 방지([shareId] 지도 폭 출렁임과 동일 결함)
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="mb-2 text-center font-display text-2xl text-eye-purple">인연 별자리 만들기</h1>
      <div className="mb-5 space-y-1.5 text-center text-sm text-text-light">
        <p>🌟 생일을 넣으면 네 별이 가운데 떠</p>
        <p>💞 친구를 부르면 궁합 관계를 별자리로 볼 수 있어</p>
        <p>✨ 관계 속에 유난히 잘 맞는 특별한 인연도 찾아줄게</p>
      </div>
      <ConstellationPreview />
      <p className="mt-4 mb-5 text-center text-xs text-text-light/60">친구를 부를수록 이렇게 자라나</p>
      <div className="space-y-3">
        <input
          className="w-full rounded-lg border border-lilac bg-white px-3 py-2"
          placeholder="내 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <BirthdaySelect value={birth} onChange={setBirth} />
        <label className="flex items-center gap-2 text-sm text-text-light">
          <input
            type="checkbox"
            checked={namePublic}
            onChange={(e) => setNamePublic(e.target.checked)}
            className="h-4 w-4 accent-lilac-deep"
          />
          별자리에 내 이름 보이기
        </label>
        <button
          disabled={busy || !name || !birth}
          onClick={create}
          className="w-full rounded-xl bg-lilac-deep py-3 text-white disabled:opacity-50"
        >
          {busy ? "만드는 중…" : "만들기"}
        </button>
      </div>
      {!loggedIn && (
        <a
          href="/login?next=/fortune/byeoljari"
          className="mt-3 block w-full rounded-xl border border-lilac-deep py-3 text-center font-medium text-lilac-deep transition active:scale-[0.99]"
        >
          로그인하고 시작하기
        </a>
      )}
      <p className="mt-6 text-center text-xs text-text-light">
        로그인하면 이 별자리를 영구 보관해요. 안 하면 이 기기에서만 볼 수 있어요.
      </p>
    </main>
  );
}
