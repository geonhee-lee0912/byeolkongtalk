import type { AxisKey, Pole } from "./constants.ts";

export interface QuestionOption {
  id: string; // 안정 id — 채점은 위치가 아니라 id 로(셔플 안전)
  text: string;
  weights: Partial<Record<Pole, number>>; // 주축 +2, 부축 흘림 +1
}
export interface Question {
  id: string;
  axis: AxisKey; // 주축
  prompt: string;
  options: QuestionOption[]; // 4개
}

export const QUESTIONS: Question[] = [
  { id: "q1", axis: "yinYang", prompt: "마을 잔칫날. 마당엔 풍물패, 사랑방엔 서너 명.", options: [
    { id: "q1a", text: "마당 한복판에서 얼쑤", weights: { 양: 2 } },
    { id: "q1b", text: "아는 얼굴마다 인사", weights: { 양: 2, 생: 1 } },
    { id: "q1c", text: "사랑방에서 서넛과 밤새 이야기꽃", weights: { 음: 2 } },
    { id: "q1d", text: "슬쩍 빠져나와 달구경", weights: { 음: 2, 인: 1 } },
  ] },
  { id: "q2", axis: "yinYang", prompt: "닷새 만에 열린 장터, 바글바글.", options: [
    { id: "q2a", text: "여기저기 기웃, 흥정 구경까지", weights: { 양: 2 } },
    { id: "q2b", text: "사람들 틈에서 에너지 참", weights: { 양: 2, 재: 1 } },
    { id: "q2c", text: "살 것만 사서 빠른 이탈", weights: { 음: 2, 재: 1 } },
    { id: "q2d", text: "장터 끝 국밥집에서 사람 구경", weights: { 음: 2 } },
  ] },
  { id: "q3", axis: "yinYang", prompt: "사흘 밤낮 큰일 후 회복법은?", options: [
    { id: "q3a", text: "사람들 불러 뒤풀이", weights: { 양: 2 } },
    { id: "q3b", text: "바로 다음 판 궁리", weights: { 양: 2, 강: 1 } },
    { id: "q3c", text: "방문 잠그고 사흘 동면", weights: { 음: 2 } },
    { id: "q3d", text: "혼자 뒷산에서 생각 정리", weights: { 음: 2, 인: 1 } },
  ] },
  { id: "q4", axis: "strength", prompt: "잔치 준비 맡을 사람이 없다. 서로 눈치만.", options: [
    { id: "q4a", text: "내가 맡는다, 판부터 짬", weights: { 강: 2 } },
    { id: "q4b", text: "잘할 사람 추대하고 밀어줌", weights: { 강: 2, 생: 1 } },
    { id: "q4c", text: "정해지면 손발이 되어 도움", weights: { 유: 2, 생: 1 } },
    { id: "q4d", text: "빈 구멍 보이면 그때 메움", weights: { 유: 2 } },
  ] },
  { id: "q5", axis: "strength", prompt: "장 갈 채비 끝났는데 소나기로 장이 파했다.", options: [
    { id: "q5a", text: "즉시 계획 수정, 밀린 일 처리", weights: { 강: 2 } },
    { id: "q5b", text: "비 그칠 시각 가늠해 오후 재설계", weights: { 강: 2, 단: 1 } },
    { id: "q5c", text: "오히려 좋아, 툇마루에서 늘어짐", weights: { 유: 2 } },
    { id: "q5d", text: "비 오면 비 오는 대로", weights: { 유: 2, 인: 1 } },
  ] },
  { id: "q6", axis: "strength", prompt: "마을 공동 모내기 날, 나는 어느새—", options: [
    { id: "q6a", text: "줄 맞춰라 지휘 중", weights: { 강: 2 } },
    { id: "q6b", text: "내 구역은 내 방식대로, 간섭 사절", weights: { 강: 2, 음: 1 } },
    { id: "q6c", text: "옆 사람 속도 맞추며 분위기 살림", weights: { 유: 2, 생: 1 } },
    { id: "q6d", text: "시키는 것 착실히, 끝나면 조용히 귀가", weights: { 유: 2 } },
  ] },
  { id: "q7", axis: "wealth", prompt: "이웃의 동업 제안, 어딘가 사기꾼 냄새.", options: [
    { id: "q7a", text: "밑천·수익 셈부터", weights: { 재: 2 } },
    { id: "q7b", text: "작게 발 담가보고 되면 키움", weights: { 재: 2, 유: 1 } },
    { id: "q7c", text: "돈보다 재미가 먼저", weights: { 인: 2 } },
    { id: "q7d", text: "그 사람 됨됨이·뜻을 먼저 겪어봄", weights: { 인: 2, 생: 1 } },
  ] },
  { id: "q8", axis: "wealth", prompt: "하늘이 주는 것 하나 고르기.", options: [
    { id: "q8a", text: "마르지 않는 쌀 곳간", weights: { 재: 2 } },
    { id: "q8b", text: "만지면 값 오르는 손", weights: { 재: 2, 강: 1 } },
    { id: "q8c", text: "세상 모든 책이 든 서고", weights: { 인: 2 } },
    { id: "q8d", text: "사람 속마음이 들리는 귀", weights: { 인: 2, 음: 1 } },
  ] },
  { id: "q9", axis: "wealth", prompt: "장에 두 자리가 났다.", options: [
    { id: "q9a", text: "잘 팔리는 국밥 좌판, 남는 게 실리", weights: { 재: 2 } },
    { id: "q9b", text: "목 좋은 자리부터 잡아 키운다", weights: { 재: 2, 강: 1 } },
    { id: "q9c", text: "벌이는 적어도 아이들 글 가르치는 서당이 뜻있다", weights: { 인: 2 } },
    { id: "q9d", text: "좌판 하며 틈틈이 아이들도 가르친다", weights: { 인: 2, 유: 1 } },
  ] },
  { id: "q10", axis: "nurture", prompt: "벗이 흥정 손해로 울상.", options: [
    { id: "q10a", text: "국밥부터, \"다음엔 잘될 거다\"", weights: { 생: 2 } },
    { id: "q10b", text: "밤새 들어주고 편들기", weights: { 생: 2, 음: 1 } },
    { id: "q10c", text: "위로 한 술 + \"어디서 잘못됐는지 보자\"", weights: { 단: 2, 인: 1 } },
    { id: "q10d", text: "\"네가 서두른 탓이 맞다, 다음엔 이렇게\"", weights: { 단: 2 } },
  ] },
  { id: "q11", axis: "nurture", prompt: "이웃의 첫 된장, 맛이 영 아니다.", options: [
    { id: "q11a", text: "\"첫 장이 이 정도면 대단하지!\"", weights: { 생: 2 } },
    { id: "q11b", text: "좋은 점 크게, 아쉬운 점 살짝", weights: { 생: 2, 유: 1 } },
    { id: "q11c", text: "\"간이 세니 소금 줄여보게\" 담백하게", weights: { 단: 2 } },
    { id: "q11d", text: "물어보면 말해줌, 안 물으면 안 함", weights: { 단: 2, 음: 1 } },
  ] },
  { id: "q12", axis: "nurture", prompt: "호랑이 소문, 대책 회의에서 의견 갈림.", options: [
    { id: "q12a", text: "갈라진 마음부터 하나로", weights: { 생: 2 } },
    { id: "q12b", text: "겁먹은 사람들 챙기기 먼저", weights: { 생: 2, 유: 1 } },
    { id: "q12c", text: "소문 근거부터 따짐, 발자국은 봤는가", weights: { 단: 2, 인: 1 } },
    { id: "q12d", text: "결론을 내가 내림", weights: { 단: 2, 강: 1 } },
  ] },
];
