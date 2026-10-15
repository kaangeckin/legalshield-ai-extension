/**
 * PageAgent - Autonomous Legal DOM Understanding and Text Extraction Engine
 * Inspired by alibaba/page-agent principles.
 * 
 * Inspects page structure, scores legal relevance, prunes boilerplate DOM,
 * and extracts clean, normalized textual clauses.
 */

export class PageAgent {
  // Keywords indicating legal documents
  static LEGAL_INDICATORS = [
    'terms of service', 'terms of use', 'terms and conditions',
    'kullanım şartları', 'kullanıcı sözleşmesi', 'üyelik sözleşmesi',
    'privacy policy', 'gizlilik politikası', 'gizlilik sözleşmesi',
    'end user license agreement', 'eula', 'subscription terms',
    'abonelik şartları', 'mesafeli satış sözleşmesi', 'kvkk', 'gdpr'
  ];

  // Elements to prune as noise
  static BOILERPLATE_SELECTORS = [
    'nav', 'header', 'footer', 'aside',
    'script', 'style', 'noscript', 'iframe', 'svg',
    '.cookie-banner', '.cookie-consent', '#onetrust-consent-sdk',
    '.advertisement', '.sidebar', '.social-share', '.navbar'
  ];

  /**
   * Evaluates whether the current web page contains a legal agreement.
   * @returns {{ isLegalPage: boolean, confidence: number, detectedType: string, title: string }}
   */
  static detectLegalContext() {
    const title = document.title || '';
    const url = window.location.href.toLowerCase();
    const h1s = Array.from(document.querySelectorAll('h1, h2')).map(el => el.innerText.toLowerCase()).join(' ');

    const combinedMeta = `${title} ${url} ${h1s}`.toLowerCase();

    let matches = 0;
    let detectedType = 'Genel Hükümler';

    for (const indicator of this.LEGAL_INDICATORS) {
      if (combinedMeta.includes(indicator)) {
        matches++;
        if (indicator.includes('privacy') || indicator.includes('gizlilik') || indicator.includes('kvkk')) {
          detectedType = 'Gizlilik Politikası';
        } else if (indicator.includes('subscription') || indicator.includes('abonelik') || indicator.includes('satış')) {
          detectedType = 'Abonelik / Satış Sözleşmesi';
        } else if (indicator.includes('terms') || indicator.includes('kullanım') || indicator.includes('şart')) {
          detectedType = 'Kullanım Koşulları (ToS)';
        }
      }
    }

    const confidence = Math.min(100, matches * 35);
    const isLegalPage = confidence >= 35 || matches > 0;

    return {
      isLegalPage,
      confidence,
      detectedType,
      title
    };
  }

  /**
   * Finds the best content root element containing legal text.
   * Prioritizes <main>, <article>, scrollable modals, or body.
   * @returns {HTMLElement}
   */
  static findContentRoot() {
    // Check for open modal dialogs with legal text first
    const modalSelectors = ['[role="dialog"]', '.modal-content', '.terms-container', '#terms-content', '.legal-content'];
    for (const selector of modalSelectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText && el.innerText.length > 200) {
        return el;
      }
    }

    // Check semantic containers
    const semanticContainers = document.querySelectorAll('main, article, [role="main"], .policy-content, .tos-body');
    for (const el of semanticContainers) {
      if (el && el.innerText && el.innerText.length > 300) {
        return el;
      }
    }

    // Fallback to body
    return document.body;
  }

  /**
   * Extracts clean, normalized legal text from the DOM.
   * Filters boilerplate navigation, footers, and scripts.
   * @returns {{ text: string, wordCount: number, elementCount: number, detectedType: string }}
   */
  static extractContent() {
    const context = this.detectLegalContext();
    const root = this.findContentRoot();

    // Clone the node to manipulate without affecting user's view
    const clone = root.cloneNode(true);

    // Remove boilerplate elements from clone
    for (const selector of this.BOILERPLATE_SELECTORS) {
      const elements = clone.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    }

    // Extract text blocks
    const walker = document.createTreeWalker(
      clone,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const style = window.getComputedStyle(parent);
          if (style && (style.display === 'none' || style.visibility === 'hidden')) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.nodeValue && node.nodeValue.trim().length > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    const textSegments = [];
    let currentNode;
    while ((currentNode = walker.nextNode())) {
      const val = currentNode.nodeValue.trim();
      if (val) {
        textSegments.push(val);
      }
    }

    const fullText = textSegments.join('\n\n');
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;

    return {
      text: fullText,
      wordCount,
      elementCount: textSegments.length,
      detectedType: context.detectedType,
      isLegalPage: context.isLegalPage,
      confidence: context.confidence,
      title: context.title || document.title,
      url: window.location.href
    };
  }
}
