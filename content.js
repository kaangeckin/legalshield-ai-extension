/**
 * content.js - DOM Çıkarıcı & Canlı Sayfa Vurgulayıcı
 * alibaba/page-agent ilkeleriyle DOM anlama, gürültü temizleme ve metin çıkarma.
 */

class PageAgentDOM {
  static LEGAL_INDICATORS = [
    'terms of service', 'terms of use', 'terms and conditions',
    'kullanım şartları', 'kullanıcı sözleşmesi', 'üyelik sözleşmesi',
    'privacy policy', 'gizlilik politikası', 'gizlilik sözleşmesi',
    'end user license agreement', 'eula', 'subscription terms',
    'abonelik şartları', 'mesafeli satış sözleşmesi', 'kvkk', 'gdpr'
  ];

  static BOILERPLATE = [
    'nav', 'header', 'footer', 'aside',
    'script', 'style', 'noscript', 'iframe', 'svg',
    '.cookie-banner', '.cookie-consent', '#onetrust-consent-sdk',
    '.advertisement', '.sidebar', '.social-share', '.navbar'
  ];

  static detectContext() {
    const title = document.title || '';
    const url = window.location.href.toLowerCase();
    const h1s = Array.from(document.querySelectorAll('h1, h2')).map(el => el.innerText.toLowerCase()).join(' ');
    const combined = `${title} ${url} ${h1s}`.toLowerCase();

    let matches = 0;
    let detectedType = 'Genel Hükümler';

    for (const ind of this.LEGAL_INDICATORS) {
      if (combined.includes(ind)) {
        matches++;
        if (ind.includes('privacy') || ind.includes('gizlilik')) detectedType = 'Gizlilik Politikası';
        else if (ind.includes('subscription') || ind.includes('abonelik')) detectedType = 'Abonelik Şartları';
        else if (ind.includes('terms') || ind.includes('kullanım')) detectedType = 'Kullanım Koşulları (ToS)';
      }
    }

    return {
      isLegalPage: matches > 0,
      detectedType,
      title
    };
  }

  static findContentContainer() {
    const selectors = ['[role="dialog"]', '.terms-container', '#terms-content', 'main', 'article', '[role="main"]', '.policy-body'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.length > 250) return el;
    }
    return document.body;
  }

  static extract() {
    const context = this.detectContext();
    const container = this.findContentContainer();
    const clone = container.cloneNode(true);

    for (const sel of this.BOILERPLATE) {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    }

    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const val = node.nodeValue?.trim();
        return (val && val.length > 0) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    const segments = [];
    let current;
    while ((current = walker.nextNode())) {
      segments.push(current.nodeValue.trim());
    }

    const fullText = segments.join('\n\n');
    return {
      text: fullText,
      wordCount: fullText.split(/\s+/).filter(Boolean).length,
      detectedType: context.detectedType,
      isLegalPage: context.isLegalPage,
      title: context.title || document.title,
      url: window.location.href
    };
  }
}

class InPageHighlighter {
  static HIGHLIGHT_CLASS = 'legal-shield-highlight';

  static injectStyles() {
    if (document.getElementById('legal-shield-styles')) return;
    const style = document.createElement('style');
    style.id = 'legal-shield-styles';
    style.textContent = `
      .${this.HIGHLIGHT_CLASS} {
        background: linear-gradient(120deg, rgba(254, 240, 138, 0.8) 0%, rgba(251, 146, 60, 0.7) 100%) !important;
        color: #0f172a !important;
        padding: 2px 4px !important;
        border-radius: 4px !important;
        box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.6) !important;
        animation: lsPulse 1.6s ease-in-out infinite alternate !important;
        display: inline !important;
      }
      @keyframes lsPulse {
        0% { box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.4); }
        100% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.7); }
      }
    `;
    document.head.appendChild(style);
  }

  static clear() {
    document.querySelectorAll(`.${this.HIGHLIGHT_CLASS}`).forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        mark.remove();
      }
    });
  }

  static highlight(quote) {
    if (!quote || typeof quote !== 'string') return false;
    this.injectStyles();
    this.clear();

    const clean = quote.trim().replace(/\s+/g, ' ');
    const searchTarget = clean.length > 40 ? clean.substring(0, 40) : clean;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.nodeValue.toLowerCase().indexOf(searchTarget.toLowerCase());
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, Math.min(node.nodeValue.length, idx + searchTarget.length));
        const mark = document.createElement('mark');
        mark.className = this.HIGHLIGHT_CLASS;
        mark.title = 'LegalShield AI Tarafından Tespit Edilen Risk';
        try {
          range.surroundContents(mark);
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        } catch (e) {
          if (node.parentElement) {
            node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            node.parentElement.classList.add(this.HIGHLIGHT_CLASS);
            return true;
          }
        }
      }
    }
    return false;
  }
}

// Runtime Listener
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_CONTENT') {
      const data = PageAgentDOM.extract();
      sendResponse({ success: true, data });
      return true;
    }
    if (request.action === 'HIGHLIGHT_QUOTE') {
      const success = InPageHighlighter.highlight(request.quote);
      sendResponse({ success });
      return true;
    }
    if (request.action === 'PING') {
      sendResponse({ success: true, status: 'ready' });
      return true;
    }
  });
}
