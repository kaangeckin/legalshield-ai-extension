/**
 * Content Script - Bridge between web page DOM and Extension Background/Sidepanel
 */

// Inlined PageAgent logic for guaranteed self-contained execution in browser tabs
class PageAgent {
  static LEGAL_INDICATORS = [
    'terms of service', 'terms of use', 'terms and conditions',
    'kullanım şartları', 'kullanıcı sözleşmesi', 'üyelik sözleşmesi',
    'privacy policy', 'gizlilik politikası', 'gizlilik sözleşmesi',
    'end user license agreement', 'eula', 'subscription terms',
    'abonelik şartları', 'mesafeli satış sözleşmesi', 'kvkk', 'gdpr'
  ];

  static BOILERPLATE_SELECTORS = [
    'nav', 'header', 'footer', 'aside',
    'script', 'style', 'noscript', 'iframe', 'svg',
    '.cookie-banner', '.cookie-consent', '#onetrust-consent-sdk',
    '.advertisement', '.sidebar', '.social-share', '.navbar'
  ];

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

    return { isLegalPage, confidence, detectedType, title };
  }

  static findContentRoot() {
    const modalSelectors = ['[role="dialog"]', '.modal-content', '.terms-container', '#terms-content', '.legal-content'];
    for (const selector of modalSelectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText && el.innerText.length > 200) return el;
    }

    const semanticContainers = document.querySelectorAll('main, article, [role="main"], .policy-content, .tos-body');
    for (const el of semanticContainers) {
      if (el && el.innerText && el.innerText.length > 300) return el;
    }

    return document.body;
  }

  static extractContent() {
    const context = this.detectLegalContext();
    const root = this.findContentRoot();
    const clone = root.cloneNode(true);

    for (const selector of this.BOILERPLATE_SELECTORS) {
      const elements = clone.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    }

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

class PageHighlighter {
  static HIGHLIGHT_CLASS = 'legal-shield-highlight';

  static injectStyles() {
    if (document.getElementById('legal-shield-styles')) return;

    const style = document.createElement('style');
    style.id = 'legal-shield-styles';
    style.textContent = `
      .${this.HIGHLIGHT_CLASS} {
        background: linear-gradient(120deg, rgba(254, 224, 71, 0.7) 0%, rgba(251, 146, 60, 0.8) 100%) !important;
        color: #0f172a !important;
        padding: 3px 6px !important;
        border-radius: 4px !important;
        box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.6), 0 4px 12px rgba(249, 115, 22, 0.3) !important;
        transition: all 0.3s ease !important;
        animation: pulseHighlight 1.8s ease-in-out infinite alternate !important;
        font-weight: 600 !important;
        display: inline !important;
      }
      @keyframes pulseHighlight {
        0% { transform: scale(1); box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.5); }
        100% { transform: scale(1.02); box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.7), 0 6px 16px rgba(239, 68, 68, 0.4); }
      }
    `;
    document.head.appendChild(style);
  }

  static clearHighlights() {
    const existing = document.querySelectorAll(`.${this.HIGHLIGHT_CLASS}`);
    existing.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        mark.remove();
      }
    });
  }

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

// Runtime messaging listener
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_CONTENT') {
      const extracted = PageAgent.extractContent();
      sendResponse({ success: true, data: extracted });
      return true;
    }

    if (request.action === 'HIGHLIGHT_QUOTE') {
      const result = PageHighlighter.highlightQuote(request.quote);
      sendResponse({ success: result });
      return true;
    }

    if (request.action === 'CLEAR_HIGHLIGHTS') {
      PageHighlighter.clearHighlights();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'PING') {
      sendResponse({ success: true, status: 'ready' });
      return true;
    }
  });
}
