// 별콩이 마무리 한마디 자동 추출 — result 페이지 + OG 이미지 description 노출용.
// 페르소나 가이드: 응답 끝에 "별콩이가 응원할게" 류 응원 한마디 포함.
// 마지막 assistant 메시지의 마지막 문단을 그대로 사용.
import { stripRecoMarkers } from "@/lib/reco-utils";

// 종료 턴의 "초대/작별" 문단 식별 패턴.
// forceEnd 턴은 "유저 답변 → 요약 → 언제든 다시 와" 구조라 마지막 문단은 보통 초대 문구.
// excludeInvite 옵션이 켜지면 이 패턴 문단을 건너뛰고 요약 문단을 한마디로 노출.
const INVITE_PATTERN =
  /(펼치러\s*와|여기 있을|여기서 기다릴|돌아와|기다릴게|별콩이는 항상|네 곁에|언제든 다시)/;

// 타로 결과 카드에 떼어 놓으면 어색한 두 가지 — 운영 40건 중 약 1/3(디자인 다듬기 /tarot/result ④ 운영자 11-14).
// ① 끝의 "다음엔 … 이어서 보자" 다음 상담 안내·"오늘은 여기까지 …" 마무리 문장 ② 맨 앞의 마지막 질문에 대한 대답 말투("알겠어." "응…" "ㅠㅠ")
const NEXT_TIME_SENTENCE = /다음(?:엔|에는|에)?\s[^.!?…]*이어서|^오늘은 여기까지/;
const REPLY_OPENER = /^(?:(?:알겠어|응|그래|맞아|그렇구나|좋아)[.…!~,]+|[ㅠㅜ]+[.…!~]*)\s*/;

function trimForCard(paragraph: string): string {
  const sentences = paragraph.replace(REPLY_OPENER, "").split(/(?<=[.!?…])\s+/);
  while (sentences.length > 0 && NEXT_TIME_SENTENCE.test(sentences[sentences.length - 1])) {
    sentences.pop();
  }
  return sentences.join(" ").trim();
}

export function extractClosingLine(
  messages: { role: "user" | "assistant"; content: string }[],
  options?: { excludeInvite?: boolean }
): string | null {
  // 마지막 assistant 메시지 찾기
  let last: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      last = messages[i].content;
      break;
    }
  }
  if (!last) return null;

  // [END] + [RECO:] 마커 제거 (OG 이미지·공유 카피에 마커 노출 방지)
  const cleaned = stripRecoMarkers(last.replace(/\[END\]\s*$/, "")).trim();
  if (!cleaned) return null;

  // 마지막 문단 추출 (빈 줄로 분리된 블록)
  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;

  // 기본은 마지막 문단. excludeInvite 면 뒤에서부터 초대 문구가 아닌 첫 문단(=요약)을 선택.
  // 그 문단도 끝의 '다음엔 … 이어서 보자'·앞의 대답 말투를 떼고, 남는 게 없으면 앞 문단으로 간다.
  let chosen = paragraphs[paragraphs.length - 1];
  if (options?.excludeInvite) {
    for (let i = paragraphs.length - 1; i >= 0; i--) {
      if (INVITE_PATTERN.test(paragraphs[i])) continue;
      const trimmed = trimForCard(paragraphs[i]);
      if (trimmed) {
        chosen = trimmed;
        break;
      }
    }
  }

  // 너무 길면 첫 2~3 문장만 (250자 cap)
  if (chosen.length <= 250) return chosen;
  const sentences = chosen.split(/(?<=[.!?…])\s+/);
  let acc = "";
  for (const s of sentences) {
    if (acc.length + s.length > 250) break;
    acc += (acc ? " " : "") + s;
  }
  return acc || chosen.slice(0, 250);
}
