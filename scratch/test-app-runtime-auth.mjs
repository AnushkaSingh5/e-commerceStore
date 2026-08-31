// scratch/test-app-runtime-auth.mjs
import path from 'path';
import fs from 'fs';

// Load .env.local exactly like Next.js runtime does
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
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

import { shippingFactory } from '../services/shipping/shippingFactory.js';
import { shippingService } from '../services/shipping/shippingService.js';

async function testRuntimeAuth() {
  console.log('====================================================');
  console.log('🧪 TESTING SHIPROCKET AUTH VIA ACTUAL APPLICATION PATH');
  console.log('====================================================\n');

  // 1. Resolve Shiprocket provider from shippingFactory
  const provider = shippingFactory.getProvider('Shiprocket');

  console.log('Provider Class Name:', provider.constructor.name);
  console.log('Provider isMock:', provider.isMock);
  console.log('Provider sanitized email length:', provider.email?.length);
  console.log('Provider sanitized password length:', provider.password?.length);
  console.log('Email ends with "@gmail.com":', provider.email?.endsWith('@gmail.com'));
  console.log('Password has quotes:', provider.password?.includes('"') || provider.password?.includes("'"));

  // 2. Execute _getToken() through the real application provider instance
  console.log('\nInvoking provider._getToken()...');
  try {
    const token = await provider._getToken();
    if (token && typeof token === 'string' && token.length > 50) {
      console.log('\n🎉 RESULT: Shiprocket authentication from application runtime = SUCCESS');
      console.log('Token Length:', token.length);
      console.log('Token Expiry:', new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString());
    } else {
      console.error('\n❌ RESULT: Shiprocket authentication from application runtime = FAILED (Token empty or invalid)');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ RESULT: Shiprocket authentication from application runtime = FAILED');
    console.error('Error Details:', err.message);
    process.exit(1);
  }
}

testRuntimeAuth().catch(console.error);
