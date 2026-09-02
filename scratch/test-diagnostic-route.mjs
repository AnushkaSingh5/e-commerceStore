import fs from 'fs';
import path from 'path';

function loadEnv() {
  try {
    const envPath = path.resolve('.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    }
  } catch (e) {
    console.error('Failed to load .env.local', e);
  }
}

loadEnv();

async function testDiagnosticRoute() {
  console.log('Testing GET /api/admin/shipping/diagnostic route logic directly...\n');
  const { GET } = await import('../app/api/admin/shipping/diagnostic/route.js');
  const req = new Request('http://localhost:3000/api/admin/shipping/diagnostic');
  const res = await GET(req);
  const data = await res.json();
  console.log('Summary:', data.summary);
  console.log(`\nStores Report (${data.stores?.length} stores):`);
  data.stores?.forEach((s, idx) => {
    console.log(`[${idx+1}] Store: "${s.storeName}" (${s.storeSlug})`);
    console.log(`    Seller: ${s.sellerName} (${s.sellerEmail})`);
    console.log(`    Status: ${s.verificationStatus} | Pincode: ${s.pincode}`);
    console.log(`    Stored ID: ${s.storedPickupId} (Legacy: ${s.isLegacyId})`);
    console.log(`    Reason: ${s.problemReason}\n`);
  });
}

testDiagnosticRoute();
