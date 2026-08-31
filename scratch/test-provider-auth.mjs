// scratch/test-provider-auth.mjs
import path from 'path';
import fs from 'fs';

// Load .env.local exactly as it is in the filesystem
const p = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(p)) {
  const lines = fs.readFileSync(p, 'utf-8').split('\n');
  for (const l of lines) {
    const trimmed = l.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq !== -1) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      process.env[key] = val;
    }
  }
}

import { ShiprocketProvider } from '../services/shipping/shiprocketProvider.js';

async function run() {
  console.log('Testing ShiprocketProvider._getToken() with raw env...');
  const providerRaw = new ShiprocketProvider();
  
  // Test with raw env (which has quotes in password)
  try {
    const token = await providerRaw._getToken();
    console.log('Raw result: Token length =', token.length);
  } catch (err) {
    console.log('Raw attempt error:', err.message);
  }

  // Now sanitize in code and test
  console.log('\nTesting ShiprocketProvider._getToken() after cleaning quotes...');
  const cleanEmail = (process.env.SHIPROCKET_EMAIL || '').trim().replace(/^["']|["']$/g, '');
  const cleanPassword = (process.env.SHIPROCKET_PASSWORD || '').trim().replace(/^["']|["']$/g, '');
  
  const providerClean = new ShiprocketProvider();
  providerClean.email = cleanEmail;
  providerClean.password = cleanPassword;
  providerClean.isMock = false;

  try {
    const token = await providerClean._getToken();
    console.log('✅ Clean attempt SUCCESS! Token received, length =', token.length);
  } catch (err) {
    console.log('❌ Clean attempt error:', err.message);
  }
}

run().catch(console.error);
