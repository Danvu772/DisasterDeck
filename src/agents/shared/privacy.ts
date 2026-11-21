// Phone numbers are masked in code before any text reaches the LLM, the board or the logs.
// Matches Turkish numbers such as 0532 000 00 22, +90 (532) 000-00-22, 05320000022, 532 000 0022.
// Leaves alone years, house numbers, coordinates (38.3552), ids and quantity lists.

const PHONE = /(?<![\d.,])(?:\+?\s*90[\s./-]*|0[\s./-]*)?\(?\d{3}\)?(?:[\s./-]*\d){7}(?!\d)/g;

/** "0532 000 00 22" → "•••••••••22" (last two digits kept, as the team rules say). */
export function maskPhones(text: string): { text: string; phones: string[] } {
  const phones: string[] = [];
  const masked = text.normalize("NFKC").replace(PHONE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 10) return m;           // not a phone number
    const short = "•••••••••" + digits.slice(-2);
    phones.push(short);
    return short;
  });
  return { text: masked, phones };
}
