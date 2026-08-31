// scratch/test-next-env-loading.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { ShiprocketProvider } from '../services/shipping/shiprocketProvider.js';

const projectDir = process.cwd();
const { combinedEnv, loadedEnvFiles } = loadEnvConfig(projectDir);

console.log('Loaded Env Files:', loadedEnvFiles.map(f => f.path));

console.log('\n--- Environment Variables as parsed by Next.js ---');
const nextEmail = process.env.SHIPROCKET_EMAIL;
const nextPassword = process.env.SHIPROCKET_PASSWORD;

console.log('process.env.SHIPROCKET_EMAIL exists:', Boolean(nextEmail));
console.log('process.env.SHIPROCKET_EMAIL length:', nextEmail?.length);
console.log('process.env.SHIPROCKET_PASSWORD exists:', Boolean(nextPassword));
console.log('process.env.SHIPROCKET_PASSWORD length:', nextPassword?.length);
console.log('process.env.SHIPROCKET_PASSWORD starts with quote:', nextPassword?.startsWith('"'));
console.log('process.env.SHIPROCKET_PASSWORD ends with quote:', nextPassword?.endsWith('"'));

console.log('\n--- ShiprocketProvider Initialization Test ---');
const provider = new ShiprocketProvider();
console.log('Provider sanitized email length:', provider.email?.length);
console.log('Provider sanitized password length:', provider.password?.length);
console.log('Provider isMock:', provider.isMock);

async function testToken() {
  console.log('\n--- Invoking provider._getToken() with Next.js loaded env ---');
  try {
    const token = await provider._getToken();
    console.log('🎉 SUCCESS! Shiprocket authentication succeeded! Token length:', token.length);
  } catch (err) {
    console.error('❌ FAILED! Error:', err.message);
  }
}

testToken().catch(console.error);
