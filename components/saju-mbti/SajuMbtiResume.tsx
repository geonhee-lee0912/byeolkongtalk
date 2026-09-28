"use client";

// 랜딩에 도착했는데 이미 결과 세션이 있으면 플로우로 보낸다 — "결과 다시 보기" 경로를 지킨다.
// 크롤러는 sessionStorage 가 없으니 색인엔 영향이 없다.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SajuMbtiResume() {
  const router = useRouter();
  useEffect(() => {
    try {
      if (sessionStorage.getItem("saju-mbti:session")) router.replace("/fortune/saju-mbti?start=1");
    } catch {
      /* storage 차단 — 랜딩에 머문다 */
    }
  }, [router]);
  return null;
}
