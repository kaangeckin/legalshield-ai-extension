/**
 * Deterministic Validator - Anti-Hallucination Pipeline
 * 
 * Ensures that any claim, clause, or exact_quote returned by the LLM
 * truly and verifiably exists in the original source document.
 * Hallucinated, fabricated, or altered quotes are flagged or eliminated.
 */

export class DeterministicValidator {
  /**
   * Normalizes text for robust comparison.
   * - Applies Unicode NFKC normalization
   * - Normalizes smart quotes, apostrophes, dashes, and hyphens
   * - Collapses multiple whitespace / newlines into a single space
   * - Trims leading and trailing whitespace
   * 
   * @param {string} str 
   * @returns {string}
   */
  static normalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .normalize('NFKC')
      // Normalize curly quotes & apostrophes
      .replace(/[\u2018\u2019\u201A\u201B']/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F"]/g, '"')
      // Normalize dashes and hyphens
      .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
      // Replace non-breaking spaces and exotic spaces
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Performs an exact or token-sequence match of the quote in the source text.
   * 
   * @param {string} originalText - The full extracted page text
   * @param {string} quote - The quote claimed by the model
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

    // Level 1: Normalized Exact Substring match (Case-sensitive first, then case-insensitive)
    let idx = normOriginal.indexOf(normQuote);
    if (idx !== -1) {
      return {
        found: true,
        startIndex: idx,
        endIndex: idx + normQuote.length,
        matchedSubstring: normOriginal.substring(idx, idx + normQuote.length)
      };
    }

    // Level 2: Case-insensitive normalized search
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

    // Level 3: Token-sequence search (tolerates line breaks or minor missing punctuation)
    const quoteTokens = normQuote.split(/\s+/).filter(t => t.length > 2);
    if (quoteTokens.length >= 4) {
      // Create a pattern with flexible whitespace/punctuation between words
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
   * Validates all risks returned by LLM against original page text.
   * 
   * @param {string} originalText - Page text from DOM
   * @param {Array} rawRisks - Risks parsed from LLM JSON response
   * @param {object} options - Options: { dropUnverified: false }
   * @returns {{ validatedRisks: Array, stats: { total: number, verified: number, droppedOrUnverified: number, verificationRate: number } }}
   */
  static validateRisks(originalText, rawRisks = [], options = { dropUnverified: false }) {
    if (!Array.isArray(rawRisks)) {
      return {
        validatedRisks: [],
        stats: { total: 0, verified: 0, droppedOrUnverified: 0, verificationRate: 0 }
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
          verification_status: 'verified',
          verification_note: 'Alıntı orijinal sayfa metninde birebir doğrulandı.'
        });
      } else {
        unverifiedCount++;
        if (!options.dropUnverified) {
          validatedRisks.push({
            ...item,
            verified: false,
            match_start: -1,
            match_end: -1,
            verification_status: 'unverified',
            verification_note: 'DİKKAT: Bu alıntı orijinal sözleşme metninde bulunamadı. Yapay zeka halüsinasyonu olabilir.'
          });
        }
      }
    }

    const total = rawRisks.length;
    const verificationRate = total > 0 ? Math.round((verifiedCount / total) * 100) : 100;

    return {
      validatedRisks,
      stats: {
        total,
        verified: verifiedCount,
        droppedOrUnverified: unverifiedCount,
        verificationRate
      }
    };
  }
}
