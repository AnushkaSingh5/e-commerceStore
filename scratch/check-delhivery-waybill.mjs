// scratch/check-delhivery-waybill.mjs
import path from 'path';
import fs from 'fs';

function loadEnv() {
  const p = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

async function checkTracking() {
  const token = process.env.DELHIVERY_API_TOKEN;
  const waybill = '57855210000221';
  console.log(`🔍 Checking live Delhivery tracking for AWB: ${waybill}...`);

  const url = `https://track.delhivery.com/api/v1/packages/json/?waybill=${waybill}&token=${token}`;
  const res = await fetch(url);
  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('Live Delhivery API Tracking Response:', JSON.stringify(data, null, 2));
}

checkTracking().catch(console.error);
