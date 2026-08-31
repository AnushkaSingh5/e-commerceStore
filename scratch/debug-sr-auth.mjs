// scratch/debug-sr-auth.mjs
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env.local');
const content = fs.readFileSync(envPath, 'utf-8');
let rawEmail = '';
let rawPassword = '';
for (const l of content.split('\n')) {
  const t = l.trim();
  if (t.startsWith('SHIPROCKET_EMAIL=')) rawEmail = t.split('=')[1].trim();
  if (t.startsWith('SHIPROCKET_PASSWORD=')) rawPassword = t.slice(t.indexOf('=') + 1).trim();
}

console.log('Raw Email in .env.local:', rawEmail);
console.log('Raw Password in .env.local (length):', rawPassword.length);
console.log('Raw Password starts with quote:', rawPassword.startsWith('"'));
console.log('Raw Password ends with quote:', rawPassword.endsWith('"'));

const cleanedPassword = rawPassword.replace(/^["']|["']$/g, '').trim();
console.log('Cleaned Password length:', cleanedPassword.length);

async function testBoth() {
  console.log('\n--- 1. Testing with Cleaned Password ---');
  const res1 = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: rawEmail, password: cleanedPassword })
  });
  console.log('Status 1:', res1.status);
  const text1 = await res1.text();
  console.log('Body 1:', text1);

  console.log('\n--- 2. Testing with Raw Password ---');
  const res2 = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: rawEmail, password: rawPassword })
  });
  console.log('Status 2:', res2.status);
  const text2 = await res2.text();
  console.log('Body 2:', text2);
}

testBoth().catch(console.error);
