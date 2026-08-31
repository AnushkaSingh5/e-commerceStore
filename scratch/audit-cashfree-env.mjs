// scratch/audit-cashfree-env.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('🔍 CASHFREE ENVIRONMENT & CONFIGURATION AUDIT');
console.log('====================================================\n');

// 1. Inspect raw .env.local safely
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key.includes('CASHFREE') || key.includes('PAYMENT')) {
        const cleanedVal = val.replace(/^["']|["']$/g, '');
        const prefix = cleanedVal.length >= 12 ? cleanedVal.slice(0, 12) + '...' : cleanedVal;
        console.log(`Line ${i + 1}: Key="${key}"`);
        console.log(`  Raw Length: ${val.length}`);
        console.log(`  Cleaned Length: ${cleanedVal.length}`);
        console.log(`  Safe Prefix / Value: ${key === 'CASHFREE_CLIENT_SECRET' ? prefix : (key === 'CASHFREE_CLIENT_ID' ? prefix : cleanedVal)}`);
        console.log(`  Starts with quote: ${val.startsWith('"') || val.startsWith("'")}`);
        console.log(`  Ends with quote: ${val.endsWith('"') || val.endsWith("'")}`);
        console.log(`  Contains $: ${val.includes('$')}`);
        console.log(`  Contains \\: ${val.includes('\\')}`);
        console.log(`  Contains spaces: ${val.includes(' ')}`);
      }
    }
  }
}

// 2. Inspect process.env as loaded by Next.js
console.log('\n--- process.env values as parsed by Next.js ---');
const clientId = process.env.CASHFREE_CLIENT_ID;
const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
const cashfreeEnv = process.env.CASHFREE_ENV;
const activeProvider = process.env.NEXT_PUBLIC_ACTIVE_PAYMENT_PROVIDER;

console.log('CASHFREE_CLIENT_ID:');
console.log(`  Present: ${Boolean(clientId)}`);
console.log(`  Length: ${clientId?.length || 0}`);
console.log(`  Prefix: ${clientId ? clientId.slice(0, 10) + '...' : 'N/A'}`);

console.log('CASHFREE_CLIENT_SECRET:');
console.log(`  Present: ${Boolean(clientSecret)}`);
console.log(`  Length: ${clientSecret?.length || 0}`);
console.log(`  Prefix: ${clientSecret ? clientSecret.slice(0, 15) + '...' : 'N/A'}`);

console.log('CASHFREE_ENV:');
console.log(`  Value: "${cashfreeEnv}"`);

console.log('NEXT_PUBLIC_ACTIVE_PAYMENT_PROVIDER:');
console.log(`  Value: "${activeProvider}"`);
