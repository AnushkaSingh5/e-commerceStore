// scratch/test-next-env-expansion.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;

console.log('--- Testing how Next.js expands single vs double quotes ---');

// In .env.local:
// If double quotes: SHIPROCKET_PASSWORD="Vjpr1ttkD^wd*Nmv#Wj&Sy$vAFowap9C"
// Next.js sees $v and interpolates process.env['v'] which is empty!

// Let's test with single quotes:
// SHIPROCKET_PASSWORD='Vjpr1ttkD^wd*Nmv#Wj&Sy$vAFowap9C'
// In single quotes, bash and dotenv do NOT interpolate variables!

const fs = await import('fs');
const envContent = fs.readFileSync('.env.local', 'utf-8');
console.log('Current line in .env.local:');
for (const line of envContent.split('\n')) {
  if (line.includes('SHIPROCKET_PASSWORD')) {
    console.log(line);
  }
}
