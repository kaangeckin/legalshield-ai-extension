/**
 * In-Page Highlighter
 * Highlights verified quotes directly in the user's active DOM.
 */

export class PageHighlighter {
  static HIGHLIGHT_CLASS = 'legal-shield-highlight';

  /**
   * Injects CSS styles for the highlight effect if not already present.
   */
  static injectStyles() {
    if (document.getElementById('legal-shield-styles')) return;

    const style = document.createElement('style');
    style.id = 'legal-shield-styles';
    style.textContent = `
      .${this.HIGHLIGHT_CLASS} {
        background: linear-gradient(120deg, rgba(254, 224, 71, 0.6) 0%, rgba(251, 146, 60, 0.7) 100%);
        color: #0f172a !important;
        padding: 2px 4px;
        border-radius: 4px;
        box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.5), 0 4px 12px rgba(249, 115, 22, 0.2);
        transition: all 0.3s ease;
        animation: pulseHighlight 1.8s ease-in-out infinite alternate;
        font-weight: 600 !important;
        display: inline;
      }
      @keyframes pulseHighlight {
        0% { transform: scale(1); box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.4); }
        100% { transform: scale(1.02); box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.6), 0 6px 16px rgba(239, 68, 68, 0.3); }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Clears any existing highlights.
   */
  static clearHighlights() {
    const existing = document.querySelectorAll(`.${this.HIGHLIGHT_CLASS}`);
    existing.forEach(mark => {
      const parent = mark.parentNode;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      mark.remove();
    });
  }

  /**
   * Finds and highlights the quote in the DOM.
   * @param {string} quote - The verified quote to highlight
   * @returns {boolean} Whether highlighting succeeded
   */
  static highlightQuote(quote) {
    if (!quote || typeof quote !== 'string') return false;

    this.injectStyles();
    this.clearHighlights();

    const cleanQuote = quote.trim().replace(/\s+/g, ' ');
    const searchTarget = cleanQuote.length > 50 ? cleanQuote.substring(0, 50) : cleanQuote;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    let found = false;

    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      const index = text.toLowerCase().indexOf(searchTarget.toLowerCase());

      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, Math.min(text.length, index + searchTarget.length));

        const mark = document.createElement('mark');
        mark.className = this.HIGHLIGHT_CLASS;
        mark.title = 'LegalShield AI Tarafından Tespit Edilen Riskli Madde';

        try {
          range.surroundContents(mark);
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
          found = true;
          break;
        } catch (e) {
          // If range crosses elements, fallback to scrolling parent
          if (node.parentElement) {
            node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            node.parentElement.classList.add(this.HIGHLIGHT_CLASS);
            found = true;
            break;
          }
        }
      }
    }

    return found;
  }
}
