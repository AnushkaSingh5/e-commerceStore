// scratch/test-track-live-db.mjs
import path from 'path';
import fs from 'fs';

// Load .env.local
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

// Now import after env is populated in process.env
const { GET } = await import('../app/api/shipping/track/route.js');
const { shippingFactory } = await import('../services/shipping/shippingFactory.js');

async function testLiveDbTrack() {
  console.log('===========================================================');
  console.log('🧪 TESTING LIVE DB LOOKUP IN /api/shipping/track');
  console.log('===========================================================\n');

  const shiprocket = shippingFactory.getProvider('Shiprocket');
  let shiprocketAuthCalled = false;
  const originalGetToken = shiprocket._getToken;
  shiprocket._getToken = async function(...args) {
    shiprocketAuthCalled = true;
    console.error('❌ VIOLATION: Shiprocket _getToken() was invoked!');
    return originalGetToken.apply(this, args);
  };

  const waybill = '57855210000243';
  const mockReq = new Request(`https://www.kreatorstore.in/api/shipping/track?waybill=${waybill}`);

  console.log(`Sending GET /api/shipping/track?waybill=${waybill}...`);
  const response = await GET(mockReq);

  console.log('Response HTTP Status:', response.status);
  const data = await response.json();
  console.log('Response Body:', JSON.stringify(data, null, 2));

  if (response.status === 200 && data.success) {
    console.log('✅ TEST 1 PASSED: HTTP 200 OK received');
  } else {
    throw new Error(`Test 1 Failed: Expected HTTP 200, got ${response.status}`);
  }

  if (data.provider === 'Delhivery') {
    console.log('✅ TEST 2 PASSED: Provider dynamically resolved from database as "Delhivery"');
  } else {
    throw new Error(`Test 2 Failed: Expected provider Delhivery, got ${data.provider}`);
  }

  if (!shiprocketAuthCalled) {
    console.log('✅ TEST 3 PASSED: Zero Shiprocket authentication attempts occurred');
  } else {
    throw new Error('Test 3 Failed: Shiprocket authentication was triggered');
  }

  console.log('\n🎉 ALL LIVE DATABASE ROUTING TESTS PASSED!');
}

testLiveDbTrack().catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});
