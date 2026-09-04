import type { Metadata } from "next";
import ByeolmaruView from "@/components/byeolmaru/ByeolmaruView";

export const metadata: Metadata = {
  title: "별마루",
  description: "오늘부터 한 달, 너에게 맞는 날과 챙길 날을 별콩이가 짚어줄게.",
};

export default function ByeolmaruPage() {
  return <ByeolmaruView />;
}
