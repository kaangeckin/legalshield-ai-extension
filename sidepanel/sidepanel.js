/**
 * SidePanel UI Controller
 * Manages user interactions, displays risk scores, renders verified clauses,
 * handles prompt injection alerts, and coordinates in-page highlighting.
 */

// UI Elements
const btnAnalyze = document.getElementById('btn-analyze');
const btnSettings = document.getElementById('btn-settings');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsModal = document.getElementById('settings-modal');

const pageContextText = document.getElementById('page-context-text');
const injectionBanner = document.getElementById('injection-alert-banner');
const injectionDesc = document.getElementById('injection-alert-desc');
const loadingState = document.getElementById('loading-state');
const loadingStepText = document.getElementById('loading-step-text');
const resultsContainer = document.getElementById('results-container');
const emptyState = document.getElementById('empty-state');

const scoreGauge = document.getElementById('score-gauge');
const scoreValue = document.getElementById('score-value');
const riskBadge = document.getElementById('risk-badge');
const docSummary = document.getElementById('doc-summary');
const statRate = document.getElementById('stat-rate');
const statVerified = document.getElementById('stat-verified');
const clausesList = document.getElementById('clauses-list');
const ambiguityBox = document.getElementById('ambiguity-box');
const ambiguityText = document.getElementById('ambiguity-text');

const providerSelect = document.getElementById('provider-select');
const apiKeyInput = document.getElementById('api-key-input');
const modelInput = document.getElementById('model-input');

let currentReport = null;
let activeFilter = 'all';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await checkActiveTabContext();
  await loadCachedReport();
  setupEventListeners();
});

function setupEventListeners() {
  btnAnalyze.addEventListener('click', triggerAnalysis);

  btnSettings.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });

  btnCloseModal.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  btnSaveSettings.addEventListener('click', async () => {
    const provider = providerSelect.value;
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ provider, apiKey, model });
    }
    settingsModal.classList.add('hidden');
  });

  // Category filter clicks
  const filtersContainer = document.getElementById('category-filters');
  if (filtersContainer) {
    filtersContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;

      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.dataset.category;
      renderClausesList();
    });
  }
}

async function loadSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const config = await chrome.storage.local.get(['provider', 'apiKey', 'model']);
    if (config.provider) providerSelect.value = config.provider;
    if (config.apiKey) apiKeyInput.value = config.apiKey;
    if (config.model) modelInput.value = config.model;
  }
}

async function checkActiveTabContext() {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    pageContextText.textContent = 'Test / Geliştirici Modu Aktif';
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const url = new URL(tab.url || 'about:blank');
      pageContextText.textContent = `${tab.title?.substring(0, 32) || url.hostname} incelenmeye hazır`;
    }
  } catch (e) {
    pageContextText.textContent = 'Sayfa hazır';
  }
}

async function loadCachedReport() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const { lastAnalysis } = await chrome.storage.local.get(['lastAnalysis']);
    if (lastAnalysis) {
      renderReport(lastAnalysis);
    }
  }
}

async function triggerAnalysis() {
  emptyState.classList.add('hidden');
  resultsContainer.classList.add('hidden');
  injectionBanner.classList.add('hidden');
  loadingState.classList.remove('hidden');

  loadingStepText.textContent = 'DOM metni taranıyor (alibaba/page-agent)...';

  try {
    if (window.parent && typeof window.parent.__e2eAnalyze === 'function') {
      setTimeout(() => {
        if (!loadingState.classList.contains('hidden')) {
          loadingStepText.textContent = 'Prompt Injection ve güvenlik kontrolü yapılıyor...';
        }
      }, 300);

      const data = await window.parent.__e2eAnalyze();
      renderReport(data);
    } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      setTimeout(() => {
        if (!loadingState.classList.contains('hidden')) {
          loadingStepText.textContent = 'Prompt Injection ve güvenlik kontrolü yapılıyor...';
        }
      }, 500);

      setTimeout(() => {
        if (!loadingState.classList.contains('hidden')) {
          loadingStepText.textContent = 'Deterministik alıntı doğrulama (Anti-Hallucination)...';
        }
      }, 1000);

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'ANALYZE_CURRENT_PAGE' }, (resp) => {
          resolve(resp);
        });
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Analiz başarısız oldu.');
      }

      renderReport(response.data);
    } else {
      throw new Error('Aktif sayfa veya uzantı ortamı bulunamadı.');
    }
  } catch (err) {
    loadingState.classList.add('hidden');
    emptyState.classList.remove('hidden');
    alert(`Analiz Hatası: ${err.message}`);
  }
}

export function renderReport(report) {
  currentReport = report;
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

  // 2. Risk Score & Gauge
  const score = report.overall_risk_score || 0;
  scoreValue.textContent = score;

  scoreGauge.className = 'score-gauge';
  riskBadge.className = 'risk-badge';

  if (score >= 71) {
    scoreGauge.classList.add('risk-high');
    riskBadge.classList.add('badge-high');
    riskBadge.textContent = 'Yüksek Risk';
  } else if (score >= 36) {
    scoreGauge.classList.add('risk-medium');
    riskBadge.classList.add('badge-medium');
    riskBadge.textContent = 'Orta Risk';
  } else {
    scoreGauge.classList.add('risk-low');
    riskBadge.classList.add('badge-low');
    riskBadge.textContent = 'Düşük Risk';
  }

  docSummary.textContent = report.summary || 'Özet mevcut değil.';

  // 3. Verification Stats
  const stats = report.validation_stats || { total: 0, verified: 0, verificationRate: 100 };
  statRate.textContent = `%${stats.verificationRate || 100}`;
  statVerified.textContent = `${stats.verified || 0}/${stats.total || 0}`;

  // 4. Update Filter Counts
  updateFilterCounts(report.risks || []);

  // 5. Render Clauses
  renderClausesList();

  // 6. Ambiguity Notes
  if (report.ambiguity_notes && report.ambiguity_notes.trim().length > 5) {
    ambiguityBox.classList.remove('hidden');
    ambiguityText.textContent = report.ambiguity_notes;
  } else {
    ambiguityBox.classList.add('hidden');
  }
}

function updateFilterCounts(risks) {
  document.getElementById('count-all').textContent = risks.length;
  document.getElementById('count-gizlilik').textContent = risks.filter(r => r.category === 'Gizlilik').length;
  document.getElementById('count-abonelik').textContent = risks.filter(r => r.category === 'Otomatik Yenileme').length;
  document.getElementById('count-telif').textContent = risks.filter(r => r.category === 'Fikri Mülkiyet').length;
  document.getElementById('count-yargi').textContent = risks.filter(r => r.category === 'Yargı Yetkisi').length;
}

function renderClausesList() {
  if (!currentReport || !currentReport.risks) return;

  clausesList.innerHTML = '';
  const filtered = activeFilter === 'all'
    ? currentReport.risks
    : currentReport.risks.filter(r => r.category === activeFilter);

  if (filtered.length === 0) {
    clausesList.innerHTML = '<p style="font-size:12px; color:var(--text-secondary); text-align:center; padding: 20px;">Bu kategoride tespit edilen riskli madde bulunmamaktadır.</p>';
    return;
  }

  filtered.forEach((risk, index) => {
    const card = document.createElement('div');
    card.className = `clause-card ${risk.verified ? '' : 'unverified-card'}`;
    card.id = `clause-card-${index}`;

    const categoryIcons = {
      'Gizlilik': '🔒',
      'Otomatik Yenileme': '🔄',
      'Fikri Mülkiyet': '🎨',
      'Yargı Yetkisi': '⚖️',
      'Diğer': '📋'
    };

    const icon = categoryIcons[risk.category] || '⚠️';
    const confidenceLabel = {
      'high': 'Yüksek Güven',
      'medium': 'Orta Güven',
      'low': 'Düşük Güven'
    }[risk.confidence] || risk.confidence;

    card.innerHTML = `
      <div class="clause-header">
        <span class="clause-category">${icon} ${risk.category}</span>
        <div class="clause-meta">
          <span class="confidence-tag">${confidenceLabel}</span>
        </div>
      </div>

      <p class="clause-explanation">${risk.plain_turkish || ''}</p>

      <div class="quote-box">
        <div class="quote-label">
          <span>Orijinal Alıntı (Exact Quote)</span>
          <span class="verified-indicator ${risk.verified ? 'is-verified' : 'is-unverified'}">
            ${risk.verified ? '✅ Doğrulandı' : '⚠️ Doğrulanamadı'}
          </span>
        </div>
        <div class="quote-content">"${risk.exact_quote || ''}"</div>
      </div>

      <div class="clause-actions">
        <button class="btn-highlight" data-quote="${encodeURIComponent(risk.exact_quote || '')}">
          <span>🔍</span> Sayfada Göster
        </button>
      </div>
    `;

    // Highlight button event
    const btnHighlight = card.querySelector('.btn-highlight');
    btnHighlight.addEventListener('click', () => {
      const quote = decodeURIComponent(btnHighlight.dataset.quote);
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'HIGHLIGHT_QUOTE_ON_PAGE', quote }, (res) => {
          if (!res?.success) {
            console.warn('Alıntı sayfada doğrudan vurgulanamadı.');
          }
        });
      } else if (window.parent && typeof window.parent.__e2eHighlight === 'function') {
        window.parent.__e2eHighlight(quote);
      } else {
        console.log('Highlight tetiklendi:', quote);
      }
    });

    clausesList.appendChild(card);
  });
}
