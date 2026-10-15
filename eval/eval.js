/**
 * LegalShield AI - Evaluation Pipeline (eval.js)
 * Evaluates model predictions against 5 ground-truth legal policy benchmarks.
 * Computes True Positives (TP), False Positives (FP), False Negatives (FN),
 * Precision, Recall, and F1-Score.
 */

import fs from 'fs';
import path from 'path';
import { LLMService } from '../lib/llm_service.js';
import { DeterministicValidator } from '../lib/validator.js';

// Parse command line arguments
const args = process.argv.slice(2);
let provider = 'mock';
let apiKey = process.env.API_KEY || '';
let model = '';

for (const arg of args) {
  if (arg.startsWith('--provider=')) provider = arg.split('=')[1];
  if (arg.startsWith('--api-key=')) apiKey = arg.split('=')[1];
  if (arg.startsWith('--model=')) model = arg.split('=')[1];
}

console.log('='.repeat(70));
console.log('🛡️  LEGALSHIELD AI - DEĞERLENDİRME (EVALUATION) TESTİ');
console.log(`Sağlayıcı: ${provider.toUpperCase()}`);
if (model) console.log(`Model: ${model}`);
console.log('='.repeat(70));

const benchmarksPath = path.resolve('eval/benchmarks.json');
const benchmarks = JSON.parse(fs.readFileSync(benchmarksPath, 'utf-8'));

async function runEvaluation() {
  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;
  let totalHallucinatedDropped = 0;

  const resultsTable = [];

  for (let i = 0; i < benchmarks.length; i++) {
    const item = benchmarks[i];
    console.log(`\n[${i + 1}/${benchmarks.length}] Test Ediliyor: ${item.name}...`);

    // Step 1: AI Model Analysis
    const aiOutput = await LLMService.analyzeDocument(item.text, { provider, apiKey, model });
    const rawRisks = aiOutput.risks || [];

    // Step 2: Deterministic Anti-Hallucination Validation
    const validation = DeterministicValidator.validateRisks(item.text, rawRisks);
    const validatedRisks = validation.validatedRisks.filter(r => r.verified === true);
    const unverifiedRisks = validation.validatedRisks.filter(r => r.verified === false);

    totalHallucinatedDropped += unverifiedRisks.length;

    // Step 3: Match predicted risks against ground truth
    const groundTruth = item.ground_truth_risks;
    let tp = 0;
    let fp = 0;
    let fn = 0;

    const matchedGT = new Set();

    for (const pred of validatedRisks) {
      let matched = false;
      for (let gIdx = 0; gIdx < groundTruth.length; gIdx++) {
        if (matchedGT.has(gIdx)) continue;
        const gt = groundTruth[gIdx];

        const catMatch = pred.category.toLowerCase() === gt.category.toLowerCase();
        const normPredQuote = DeterministicValidator.normalize(pred.exact_quote || '').toLowerCase();
        const normGTKey = DeterministicValidator.normalize(gt.key_phrase).toLowerCase();
        const phraseMatch = normPredQuote.includes(normGTKey) || normGTKey.includes(normPredQuote);

        if (catMatch && phraseMatch) {
          matched = true;
          matchedGT.add(gIdx);
          break;
        }
      }

      if (matched) {
        tp++;
      } else {
        fp++;
      }
    }

    fn = groundTruth.length - matchedGT.size;

    totalTP += tp;
    totalFP += fp;
    totalFN += fn;

    const prec = (tp + fp) > 0 ? (tp / (tp + fp)) : 0;
    const rec = (tp + fn) > 0 ? (tp / (tp + fn)) : 0;
    const f1 = (prec + rec) > 0 ? (2 * prec * rec) / (prec + rec) : 0;

    resultsTable.push({
      Benchmark: item.name.substring(0, 32) + '...',
      TP: tp,
      FP: fp,
      FN: fn,
      'Precision (%)': (prec * 100).toFixed(1),
      'Recall (%)': (rec * 100).toFixed(1),
      'F1 (%)': (f1 * 100).toFixed(1),
      'Alıntı Doğrulama': `${validation.stats.verified}/${validation.stats.total}`
    });
  }

  // Print results table
  console.log('\n' + '='.repeat(70));
  console.log('📊 DETAYLI PERFORMANS TABLOSU:');
  console.table(resultsTable);

  // Overall Metrics Calculation
  const overallPrecision = (totalTP + totalFP) > 0 ? totalTP / (totalTP + totalFP) : 0;
  const overallRecall = (totalTP + totalFN) > 0 ? totalTP / (totalTP + totalFN) : 0;
  const overallF1 = (overallPrecision + overallRecall) > 0
    ? (2 * overallPrecision * overallRecall) / (overallPrecision + overallRecall)
    : 0;

  console.log('='.repeat(70));
  console.log('🏆 GENEL (OVERALL) DEĞERLENDİRME SONUÇLARI:');
  console.log(`- Toplam True Positive (TP) : ${totalTP}`);
  console.log(`- Toplam False Positive (FP): ${totalFP}`);
  console.log(`- Toplam False Negative (FN): ${totalFN}`);
  console.log(`- Elenen/İşaretlenen Halüsinasyon: ${totalHallucinatedDropped}`);
  console.log(`- Global Precision           : %${(overallPrecision * 100).toFixed(2)}`);
  console.log(`- Global Recall              : %${(overallRecall * 100).toFixed(2)}`);
  console.log(`- Global F1-Score            : %${(overallF1 * 100).toFixed(2)}`);
  console.log('='.repeat(70));

  if (overallF1 >= 0.80) {
    console.log('✅ BAŞARILI: Model performansı ve deterministik doğrulayıcı kıstasları karşıladı!');
    process.exit(0);
  } else {
    console.warn('⚠️ UYARI: F1-Score hedeflenen %80 seviyesinin altında kaldı.');
    process.exit(1);
  }
}

runEvaluation().catch(err => {
  console.error('Eval Hatası:', err);
  process.exit(1);
});
