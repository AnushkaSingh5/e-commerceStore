// scratch/test-dotenv-single-quotes.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import fs from 'fs';

// Let's test with temporary .env.local variations in memory
import { ShiprocketProvider } from '../services/shipping/shiprocketProvider.js';

async function testSingleQuotes() {
  const original = fs.readFileSync('.env.local', 'utf-8');
  
  // Test Variation 1: Single quotes '...'
  const withSingleQuotes = original.replace(
    /SHIPROCKET_PASSWORD=.*/,
    "SHIPROCKET_PASSWORD='Vjpr1ttkD^wd*Nmv#Wj&Sy$vAFowap9C'"
  );
  fs.writeFileSync('.env.local', withSingleQuotes, 'utf-8');

  // Reload env with Next.js loader
  delete process.env.SHIPROCKET_PASSWORD;
  loadEnvConfig(process.cwd(), true);

  console.log('--- Variation 1: Single Quotes in .env.local ---');
  console.log('Parsed process.env.SHIPROCKET_PASSWORD length:', process.env.SHIPROCKET_PASSWORD?.length);
  
  const provider = new ShiprocketProvider();
  console.log('Provider sanitized password length:', provider.password?.length);

  try {
    const token = await provider._getToken();
    console.log('🎉 SUCCESS WITH SINGLE QUOTES! Token received, length:', token.length);
  } catch (err) {
    console.log('❌ Error with single quotes:', err.message);
  }

  // Restore original if needed
  // fs.writeFileSync('.env.local', original, 'utf-8');
}

testSingleQuotes().catch(console.error);
