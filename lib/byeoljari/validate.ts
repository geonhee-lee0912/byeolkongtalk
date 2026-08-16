// 게스트 입력 양력 생년월일/시각 검증 — regex 형식 + 실제 캘린더 유효성.
// calcSaju 는 out-of-range 에 throw 하지 않고 잘못된 사주를 반환하므로,
// 무효 입력은 반드시 저장 전에 걸러야 한다(오답·DATE 컬럼 거부로 인한 500 방지).

export function isValidBirthDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d >= 1 && d <= daysInMonth[mo - 1];
}

export function isValidBirthTime(s: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}
