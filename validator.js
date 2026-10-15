/**
 * validator.js - Deterministik Doğrulayıcı (Anti-Hallucination Pipeline)
 * 
 * LLM tarafından üretilen her 'exact_quote' metnini orijinal sayfa içeriğinde
 * katı ve normalize edilmiş string eşleşmesiyle kontrol eder.
 * Eşleşmeyen uydurma iddiaları filtreleyip "Alıntı Doğrulanamadı" etiketiyle işaretler.
 */

export class DeterministicValidator {
  /**
   * Unicode NFKC, boşluk ve tırnak işaretlerini normalize eder.
   * @param {string} str 
   * @returns {string}
   */
  static normalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .normalize('NFKC')
      // Akıllı tırnak ve kesme işaretlerini standartlaştır
      .replace(/[\u2018\u2019\u201A\u201B']/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F"]/g, '"')
      // Tire ve uzun çizgileri standartlaştır
      .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
      // Kırılmaz boşlukları ve egzotik boşlukları temizle
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      // Çoklu boşlukları tek boşluğa indir
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Orijinal metin içinde alıntıyı arar.
   * @param {string} originalText 
   * @param {string} quote 
   * @returns {{ found: boolean, startIndex: number, endIndex: number, matchedSubstring: string | null }}
   */
  static findQuoteInText(originalText, quote) {
    if (!originalText || !quote) {
      return { found: false, startIndex: -1, endIndex: -1, matchedSubstring: null };
    }

    const normOriginal = this.normalize(originalText);
    const normQuote = this.normalize(quote);

    if (normQuote.length === 0) {
      return { found: false, startIndex: -1, endIndex: -1, matchedSubstring: null };
    }

    // 1. Kademe: Birebir normalize edilmiş alt metin eşleşmesi
    let idx = normOriginal.indexOf(normQuote);
    if (idx !== -1) {
      return {
        found: true,
        startIndex: idx,
        endIndex: idx + normQuote.length,
        matchedSubstring: normOriginal.substring(idx, idx + normQuote.length)
      };
    }

    // 2. Kademe: Büyük/Küçük harf duyarsız normalize eşleşme
    const lowerOriginal = normOriginal.toLowerCase();
    const lowerQuote = normQuote.toLowerCase();
    idx = lowerOriginal.indexOf(lowerQuote);
    if (idx !== -1) {
      return {
        found: true,
        startIndex: idx,
        endIndex: idx + normQuote.length,
        matchedSubstring: normOriginal.substring(idx, idx + normQuote.length)
      };
    }

    // 3. Kademe: Token dizisi eşleşmesi (satır kırılmaları veya noktalama farklılıkları için)
    const quoteTokens = normQuote.split(/\s+/).filter(t => t.length > 2);
    if (quoteTokens.length >= 4) {
      const escapedTokens = quoteTokens.slice(0, 10).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const tokenRegex = new RegExp(escapedTokens.join('[\\s\\W]+'), 'i');
      const match = normOriginal.match(tokenRegex);
      if (match && match.index !== undefined) {
        return {
          found: true,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedSubstring: match[0]
        };
      }
    }

    return { found: false, startIndex: -1, endIndex: -1, matchedSubstring: null };
  }

  /**
   * Risk maddelerini doğrular.
   * @param {string} originalText 
   * @param {Array} rawRisks 
   * @returns {{ validatedRisks: Array, stats: { total: number, verified: number, unverified: number, verificationRate: number } }}
   */
  static validateRisks(originalText, rawRisks = []) {
    if (!Array.isArray(rawRisks)) {
      return {
        validatedRisks: [],
        stats: { total: 0, verified: 0, unverified: 0, verificationRate: 0 }
      };
    }

    const validatedRisks = [];
    let verifiedCount = 0;
    let unverifiedCount = 0;

    for (const item of rawRisks) {
      const quote = item.exact_quote || item.quote || '';
      const matchResult = this.findQuoteInText(originalText, quote);

      if (matchResult.found) {
        verifiedCount++;
        validatedRisks.push({
          ...item,
          exact_quote: matchResult.matchedSubstring || quote,
          verified: true,
          match_start: matchResult.startIndex,
          match_end: matchResult.endIndex,
          verification_label: 'Alıntı Doğrulandı',
          verification_status: 'verified'
        });
      } else {
        unverifiedCount++;
        validatedRisks.push({
          ...item,
          verified: false,
          match_start: -1,
          match_end: -1,
          verification_label: 'Alıntı Doğrulanamadı',
          verification_status: 'unverified',
          unverified_warning: 'DİKKAT: Bu alıntı orijinal sözleşme metninde bulunamadı. Yapay zeka halüsinasyonu olabilir.'
        });
      }
    }

    const total = rawRisks.length;
    const verificationRate = total > 0 ? Math.round((verifiedCount / total) * 100) : 100;

    return {
      validatedRisks,
      stats: {
        total,
        verified: verifiedCount,
        unverified: unverifiedCount,
        verificationRate
      }
    };
  }
}
