// scratch/test-dotenv-escape.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import fs from 'fs';
import { ShiprocketProvider } from '../services/shipping/shiprocketProvider.js';

async function testEscape() {
  const original = fs.readFileSync('.env.local', 'utf-8');
  
  // In dotenv-expand: to get a literal $, you write \$ or \\$
  // Let's test "Vjpr1ttkD^wd*Nmv#Wj&Sy\$vAFowap9C"
  const escapedContent = original.replace(
    /SHIPROCKET_PASSWORD=.*/,
    'SHIPROCKET_PASSWORD="Vjpr1ttkD^wd*Nmv#Wj&Sy\\$vAFowap9C"'
  );
  fs.writeFileSync('.env.local', escapedContent, 'utf-8');

  delete process.env.SHIPROCKET_PASSWORD;
  loadEnvConfig(process.cwd(), true);

  console.log('--- Variation 2: Escaped \\$ in .env.local ---');
  console.log('Parsed process.env.SHIPROCKET_PASSWORD length:', process.env.SHIPROCKET_PASSWORD?.length);
  
  const provider = new ShiprocketProvider();
  console.log('Provider sanitized password length:', provider.password?.length);

  try {
    const token = await provider._getToken();
    console.log('🎉🎉🎉 SUCCESS WITH ESCAPED $! Token received, length:', token.length);
  } catch (err) {
    console.log('❌ Error with escaped $:', err.message);
  }
}

testEscape().catch(console.error);
