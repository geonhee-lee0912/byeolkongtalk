"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BirthdaySelect from "@/components/byeoljari/BirthdaySelect";

// 만들기 → memberId 저장(뷰어 식별) → 개인 별자리로 이동. 진입 시 claim 트리거 유지.
export default function ByeoljariCreatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [namePublic, setNamePublic] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/fortune/byeoljari/claim", { method: "POST" }).catch(() => {});
  }, []);

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

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-2 text-center font-display text-2xl text-eye-purple">인연 별자리 만들기</h1>
      <p className="mb-6 text-center text-sm text-text-light">
        생일만 넣으면 내 별이 뜨고, 친구를 부를수록 별자리가 자라나.
      </p>
      <div className="space-y-3">
        <input
          className="w-full rounded-lg border border-lilac px-3 py-2"
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
      <p className="mt-6 text-center text-xs text-text-light">
        로그인하면 이 별자리를 영구 보관해요. 안 하면 이 기기에서만 볼 수 있어요.
      </p>
    </main>
  );
}
