import CompatInput from "@/components/fortune/compat/CompatInput";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import { noindexMetadata } from "@/lib/seo/metadata";

// robots·canonical 은 app/fortune/layout.tsx 에서 상속 — 여기선 문구만 덮어쓴다.
export const metadata = noindexMetadata({
  title: FORTUNE_CONFIG.compat.label,
  description: FORTUNE_CONFIG.compat.tagline,
});

export default function CompatPage() {
  return <CompatInput type="compat" />;
}
