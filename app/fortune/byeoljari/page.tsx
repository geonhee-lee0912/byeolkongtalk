"use client";
import { useEffect, useState } from "react";

// P2 뼈대 — 최소 만들기 폼 + 진입 시 claim 트리거. 시각(별자리 SVG)은 P3.
export default function ByeoljariPage() {
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [shareId, setShareId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 로그인 상태면 이 브라우저로 만든 미소유 지도 승계(무해: 미로그인/없으면 0).
  useEffect(() => {
    fetch("/api/fortune/byeoljari/claim", { method: "POST" }).catch(() => {});
  }, []);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/fortune/byeoljari", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name, birthDate: birth }),
      });
      const data = await res.json();
      if (data.ok) setShareId(data.shareId);
    } finally {
      setBusy(false);
    }
  }

  if (shareId) {
    const link = `${location.origin}/fortune/byeoljari/${shareId}`;
    return (
      <main style={{ padding: 24 }}>
        <h1>내 별자리가 생겼어</h1>
        <p>친구에게 이 링크를 보내 채워달라고 해봐:</p>
        <code>{link}</code>
        <p style={{ marginTop: 16, fontSize: 13, color: "#7A6BA0" }}>
          로그인하면 이 별자리를 영구 보관해요. 안 하면 이 기기에서만 볼 수 있어요.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>별자리 만들기</h1>
      <input placeholder="내 이름" value={name} onChange={(e) => setName(e.target.value)} />
      <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
      <button disabled={busy || !name || !birth} onClick={create}>
        만들기
      </button>
    </main>
  );
}
