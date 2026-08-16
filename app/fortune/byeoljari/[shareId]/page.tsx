"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// P2 뼈대 — 게스트 참여 폼 + 조회. 별자리 시각은 P3.
export default function ByeoljariGuestPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [joined, setJoined] = useState(false);
  const [graph, setGraph] = useState<unknown>(null);

  async function load() {
    const res = await fetch(`/api/fortune/byeoljari/${shareId}`);
    const data = await res.json();
    if (data.ok) setGraph(data);
  }
  useEffect(() => {
    load();
  }, [shareId]);

  async function join() {
    const res = await fetch(`/api/fortune/byeoljari/${shareId}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: name, birthDate: birth, relationType: "friend" }),
    });
    const data = await res.json();
    if (data.ok) {
      setJoined(true);
      load();
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>이 별자리를 채워줘</h1>
      {!joined && (
        <>
          <input placeholder="내 이름" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
          <button disabled={!name || !birth} onClick={join}>
            내 별 놓기
          </button>
        </>
      )}
      {/* P3: 아래 graph 를 별자리 SVG 로 렌더 */}
      <pre style={{ fontSize: 11, color: "#7A6BA0" }}>{JSON.stringify(graph, null, 2)}</pre>
    </main>
  );
}
