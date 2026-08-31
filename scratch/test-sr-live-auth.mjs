// scratch/test-sr-live-auth.mjs
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env.local');
const content = fs.readFileSync(envPath, 'utf-8');
let rawEmail = '';
let rawPassword = '';

for (const line of content.split('\n')) {
  const t = line.trim();
  if (t.startsWith('SHIPROCKET_EMAIL=')) {
    rawEmail = t.slice(t.indexOf('=') + 1).trim();
  }
  if (t.startsWith('SHIPROCKET_PASSWORD=')) {
    rawPassword = t.slice(t.indexOf('=') + 1).trim();
  }
}

const cleanedEmail = rawEmail.replace(/^["']|["']$/g, '').trim();
const cleanedPassword = rawPassword.replace(/^["']|["']$/g, '').trim();

console.log('Email length:', cleanedEmail.length);
console.log('Password length:', cleanedPassword.length);

async function testAuth(email, password, label) {
  console.log(`\n--- Testing ${label} ---`);
  try {
    const res = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    console.log('HTTP Status:', res.status);
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 && data.token) {
      console.log('🎉 SUCCESS! Token received, token length:', data.token.length);
      return true;
    } else {
      console.log('❌ Failed. Response body:', JSON.stringify(data));
      return false;
    }
  } catch (err) {
    console.log('Exception:', err.message);
    return false;
  }
}

async function run() {
  await testAuth(cleanedEmail, cleanedPassword, 'Cleaned email & password');
}

run().catch(console.error);
