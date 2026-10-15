import { spawn } from 'child_process';
import http from 'http';
import path from 'path';

const PORT = 3000;

function waitForServer(retries = 30, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://localhost:${PORT}/sidepanel/sidepanel.html`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts >= retries) {
          reject(new Error(`Sunucu 200 dönmedi: ${res.statusCode}`));
        } else {
          setTimeout(check, interval);
        }
      });

      req.on('error', () => {
        if (attempts >= retries) {
          reject(new Error('Sunucu başlatılamadı.'));
        } else {
          setTimeout(check, interval);
        }
      });
    };
    check();
  });
}

async function main() {
  console.log('🚀 1. Test sunucusu başlatılıyor...');
  const server = spawn('node', ['scripts/serve.js'], {
    stdio: 'inherit',
    shell: true
  });

  try {
    await waitForServer();
    console.log('✅ Sunucu hazır! Cypress E2E testleri başlatılıyor...\n');

    const cypressArgs = ['cypress', 'run', ...process.argv.slice(2)];
    const cypressProcess = spawn('npx', cypressArgs, {
      stdio: 'inherit',
      shell: true
    });

    cypressProcess.on('exit', (code) => {
      console.log(`\n🛑 Cypress tamamlandı (Çıkış Kodu: ${code}). Sunucu kapatılıyor...`);
      server.kill();
      process.exit(code || 0);
    });
  } catch (err) {
    console.error('Hata:', err);
    server.kill();
    process.exit(1);
  }
}

main();
