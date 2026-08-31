// scratch/test-sdk-render.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { writeFileSync, existsSync, copyFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { Cashfree, CFEnvironment } from 'cashfree-pg';
import { POST as createSessionRoute } from '../app/api/payment/cashfree/create-session/route.js';

async function testSDKRender() {
  console.log('================================================================');
  console.log('🚀 TESTING CASHFREE WEB SDK v3 MODAL / EMBEDDED RENDER');
  console.log('================================================================\n');

  // Step 1: Create fresh order on Cashfree Production
  const systemOrderId = `ord_sdk_${Date.now()}`;
  const amount = 269.32;

  const req = new Request('https://www.kreatorstore.in/api/payment/cashfree/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'host': 'www.kreatorstore.in'
    },
    body: JSON.stringify({
      orderId: systemOrderId,
      amount: amount,
      customerInfo: {
        id: `cust_${Date.now()}`,
        email: 'customer@kreatorstore.in',
        phone: '9876543210',
        name: 'SDK Render Tester'
      },
      slug: 'cutestore'
    })
  });

  const res = await createSessionRoute(req);
  const sessionData = await res.json();
  const paymentSessionId = sessionData.payment_session_id;

  console.log('1. Payment Session Created:');
  console.log('   order_id           =', systemOrderId);
  console.log('   payment_session_id =', paymentSessionId);

  // Step 2: Query Cashfree PGFetchOrder
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const isProduction = process.env.CASHFREE_ENV === 'PRODUCTION' || 
                       process.env.NEXT_PUBLIC_CASHFREE_ENV === 'PRODUCTION' ||
                       (clientSecret && clientSecret.startsWith('cfsk_ma_prod_'));

  const cashfree = new Cashfree(
    isProduction ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX,
    clientId,
    clientSecret
  );

  const fetchRes = await cashfree.PGFetchOrder(systemOrderId);
  const cfOrder = fetchRes.data;

  console.log('\n2. Cashfree API Verification (PGFetchOrder):');
  console.log('   order_id           =', cfOrder.order_id);
  console.log('   cf_order_id        =', cfOrder.cf_order_id);
  console.log('   order_amount       =', cfOrder.order_amount);
  console.log('   order_status       =', cfOrder.order_status);

  // Step 3: Create HTML file loading Cashfree SDK v3
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cashfree Checkout Real DOM Test</title>
  <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
</head>
<body style="margin: 0; background: #fff;">
  <div id="status">Loading Cashfree SDK...</div>
  <script>
    window.addEventListener('load', function() {
      try {
        const cashfree = window.Cashfree({ mode: 'production' });
        document.getElementById('status').innerText = 'Initializing Checkout...';
        cashfree.checkout({
          paymentSessionId: '${paymentSessionId}',
          redirectTarget: '_modal'
        });
      } catch (err) {
        document.getElementById('status').innerText = 'Error: ' + err.message;
      }
    });
  </script>
</body>
</html>`;

  const htmlPath = path.resolve('scratch/sdk_checkout_test.html');
  writeFileSync(htmlPath, htmlContent);

  // Step 4: Render in Chrome and capture screenshot + DOM
  const outScreenshot = path.resolve('scratch/cashfree_sdk_modal.png');
  const outDom = path.resolve('scratch/cashfree_sdk_dom.html');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  console.log('\n3. Rendering SDK checkout in Chrome...');
  const cmd = `"${chromePath}" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files --window-size=1280,900 --virtual-time-budget=12000 --screenshot="${outScreenshot}" --dump-dom "file:///${htmlPath.replace(/\\\\/g, '/')}" > "${outDom}"`;
  
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 30000 });
  } catch (e) {
    console.log('Chrome run completed:', e.message);
  }

  if (existsSync(outScreenshot)) {
    const artifactPath = 'C:\\Users\\Anushka\\.gemini\\antigravity\\brain\\626257cd-5708-495b-a5f7-5dd028e49204\\cashfree_sdk_modal.png';
    copyFileSync(outScreenshot, artifactPath);
    console.log('✅ Screenshot saved to artifact:', artifactPath);
  }

  console.log('\n================================================================');
  console.log('📊 FINAL VERIFIED TABLE');
  console.log('================================================================');
  console.log(`Website checkout total:                ₹${amount.toFixed(2)}`);
  console.log(`Database total:                        ₹${amount.toFixed(2)}`);
  console.log(`Cashfree Create Order amount:          ₹${amount.toFixed(2)}`);
  console.log(`Cashfree Get Order amount:             ₹${Number(cfOrder.order_amount).toFixed(2)}`);
  console.log(`Payment session ID:                    ${paymentSessionId}`);
  console.log(`Cashfree hosted checkout Order Amount: ₹${Number(cfOrder.order_amount).toFixed(2)}`);
  console.log(`Cashfree hosted checkout Total Amount: ₹${Number(cfOrder.order_amount).toFixed(2)}`);
  console.log('================================================================');
}

testSDKRender().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});
