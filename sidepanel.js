/**
 * sidepanel.js - Modern Fintech/SaaS Dashboard UI Controller
 */

const btnAnalyze = document.getElementById('btn-analyze');
const injectionBanner = document.getElementById('injection-alert-banner');
const injectionDesc = document.getElementById('injection-alert-desc');
const loadingState = document.getElementById('loading-state');
const loadingText = document.getElementById('loading-text');
const resultsContainer = document.getElementById('results-container');
const emptyState = document.getElementById('empty-state');

const scoreGauge = document.getElementById('score-gauge');
const scoreValue = document.getElementById('score-value');
const riskBadge = document.getElementById('risk-badge');
const scoreTitle = document.getElementById('score-title');
const scoreSummary = document.getElementById('score-summary');
const statRate = document.getElementById('stat-rate');
const statVerified = document.getElementById('stat-verified');
const ambiguityBox = document.getElementById('ambiguity-box');
const ambiguityText = document.getElementById('ambiguity-text');
const clausesList = document.getElementById('clauses-list');

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  loadCachedAnalysis();
});

function setupEventListeners() {
  btnAnalyze.addEventListener('click', triggerAnalysis);
}

async function loadCachedAnalysis() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['lastAnalysis'], (result) => {
      if (result.lastAnalysis) {
        renderReport(result.lastAnalysis);
      }
    });
  }
}

async function triggerAnalysis() {
  emptyState.classList.add('hidden');
  resultsContainer.classList.add('hidden');
  injectionBanner.classList.add('hidden');
  loadingState.classList.remove('hidden');

  try {
    // E2E Test Harness Bridge
    if (window.parent && typeof window.parent.__e2eAnalyze === 'function') {
      const data = await window.parent.__e2eAnalyze();
      renderReport(data);
    } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'ANALYZE_CURRENT_PAGE' }, resolve);
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Analiz başarısız oldu.');
      }

      renderReport(response.data);
    } else {
      throw new Error('Aktif sayfa ortamı bulunamadı.');
    }
  } catch (err) {
    loadingState.classList.add('hidden');
    emptyState.classList.remove('hidden');
    alert(`Analiz Hatası: ${err.message}`);
  }
}

export function renderReport(report) {
  loadingState.classList.add('hidden');
  emptyState.classList.add('hidden');
  resultsContainer.classList.remove('hidden');

  // 1. Prompt Injection Alert
  if (report.prompt_injection_detected) {
    injectionBanner.classList.remove('hidden');
    if (report.security_alert) {
      injectionDesc.textContent = report.security_alert;
    }
  } else {
    injectionBanner.classList.add('hidden');
  }

  // 2. Risk Score & Color Coding
  const score = report.overall_risk_score || 0;
  scoreValue.textContent = score;

  scoreGauge.className = 'score-circle';
  riskBadge.className = 'risk-badge';

  if (score >= 71) {
    scoreGauge.classList.add('rose');
    riskBadge.classList.add('rose');
    riskBadge.textContent = 'Yüksek Risk';
    scoreTitle.textContent = 'Kritik Risk Durumu';
  } else if (score >= 36) {
    scoreGauge.classList.add('amber');
    riskBadge.classList.add('amber');
    riskBadge.textContent = 'Orta Risk';
    scoreTitle.textContent = 'Dikkat Edilmesi Gereken Şartlar';
  } else {
    scoreGauge.classList.add('emerald');
    riskBadge.classList.add('emerald');
    riskBadge.textContent = 'Düşük Risk';
    scoreTitle.textContent = 'Standart Güvenli Seviye';
  }

  scoreSummary.textContent = report.summary || 'Özet mevcut değil.';

  // 3. Stats Bar
  const stats = report.validation_stats || { total: 0, verified: 0, verificationRate: 100 };
  statRate.textContent = `%${stats.verificationRate ?? 100}`;
  statVerified.textContent = `${stats.verified ?? 0}/${stats.total ?? 0}`;

  // 4. Ambiguity Card
  if (report.ambiguity_notes && report.ambiguity_notes.trim().length > 5) {
    ambiguityBox.classList.remove('hidden');
    ambiguityText.textContent = report.ambiguity_notes;
  } else {
    ambiguityBox.classList.add('hidden');
  }

  // 5. Clauses List
  renderClauses(report.risks || []);
}

function renderClauses(risks) {
  clausesList.innerHTML = '';

  if (risks.length === 0) {
    clausesList.innerHTML = '<p style="color:var(--text-muted); font-size:11px; text-align:center; padding:16px;">Risk maddesi bulunamadı.</p>';
    return;
  }

  risks.forEach((risk, i) => {
    const card = document.createElement('div');
    card.className = `clause-card ${risk.verified ? '' : 'unverified-card'}`;
    card.id = `clause-card-${i}`;

    const categoryIcons = {
      'Gizlilik': '🔒',
      'Otomatik Yenileme': '🔄',
      'Fikri Mülkiyet': '🎨',
      'Yargı Yetkisi': '⚖️',
      'Diğer': '📋'
    };

    const confidenceLabels = {
      'high': 'Yüksek Güven',
      'medium': 'Orta Güven',
      'low': 'Düşük Güven'
    };

    const icon = categoryIcons[risk.category] || '⚠️';
    const confLabel = confidenceLabels[risk.confidence] || risk.confidence;
    const isVerified = risk.verified !== false;

    card.innerHTML = `
      <div class="clause-top">
        <span class="clause-category">${icon} ${risk.category}</span>
        <span class="confidence-badge">${confLabel}</span>
      </div>

      <p class="clause-explanation">${risk.plain_turkish || ''}</p>

      <div class="quote-box">
        <div class="quote-header">
          <span>Orijinal Alıntı</span>
          <span class="quote-tag ${isVerified ? 'verified' : 'unverified'}">
            ${isVerified ? '✅ Alıntı Doğrulandı' : '⚠️ Alıntı Doğrulanamadı'}
          </span>
        </div>
        <div class="quote-text">"${risk.exact_quote || ''}"</div>
      </div>

      <div class="clause-actions">
        <button class="btn-highlight" data-quote="${encodeURIComponent(risk.exact_quote || '')}">
          <span>🔍</span> Sayfada Göster
        </button>
      </div>
    `;

    const btnHl = card.querySelector('.btn-highlight');
    btnHl.addEventListener('click', () => {
      const quote = decodeURIComponent(btnHl.dataset.quote);
      if (window.parent && typeof window.parent.__e2eHighlight === 'function') {
        window.parent.__e2eHighlight(quote);
      } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'HIGHLIGHT_QUOTE_ON_PAGE', quote });
      }
    });

    clausesList.appendChild(card);
  });
}
