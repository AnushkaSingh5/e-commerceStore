// scratch/capture-cashfree-screenshot.mjs
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { Cashfree, CFEnvironment } from 'cashfree-pg';
import { POST as createSessionRoute } from '../app/api/payment/cashfree/create-session/route.js';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('================================================================');
  console.log('📸 RUNNING BROWSER AUTOMATION & SCREENSHOT CAPTURE');
  console.log('================================================================\n');

  // Step 1: Create fresh order on Cashfree Production
  const systemOrderId = `ord_scr_${Date.now()}`;
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
        name: 'Browser Screenshot Tester'
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

  // Step 3: Launch Chrome with Remote Debugging
  const targetUrl = `https://payments.cashfree.com/order/#${paymentSessionId}`;
  console.log('\n3. Launching Headless Chrome to render:', targetUrl);

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\Anushka\\AppData\\Local\\Temp\\chrome_debug_profile',
    '--window-size=1280,900',
    '--remote-debugging-port=9222',
    'about:blank'
  ]);

  // Wait for Chrome debugging port to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // Get WebSocket debugger URL
    const versionRes = await fetch('http://127.0.0.1:9222/json/version');
    const versionData = await versionRes.json();
    const webSocketUrl = versionData.webSocketDebuggerUrl;

    // Create a new tab
    const newTabRes = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(targetUrl), { method: 'PUT' });
    const tabData = await newTabRes.json();
    const tabWsUrl = tabData.webSocketDebuggerUrl;

    console.log('4. Connected to Chrome via CDP. Waiting for Cashfree Checkout UI to render...');

    const ws = new WebSocket(tabWsUrl);
    let msgId = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    const sendCmd = (method, params = {}) => {
      return new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await new Promise((resolve) => ws.onopen = resolve);

    await sendCmd('Page.enable');
    await sendCmd('Runtime.enable');
    await sendCmd('DOM.enable');

    // Wait 7 seconds for the Cashfree single page app to load and render all API data
    console.log('   Waiting for Cashfree UI React components to mount...');
    await new Promise(resolve => setTimeout(resolve, 7000));

    // Extract innerText from the rendered page
    const evalRes = await sendCmd('Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true
    });
    const pageText = evalRes?.result?.result?.value || '';

    console.log('\n--- CASHFREE CHECKOUT VISUAL / DOM TEXT ---');
    console.log(pageText.slice(0, 1500));
    console.log('-------------------------------------------\n');

    // Capture screenshot
    const screenshotRes = await sendCmd('Page.captureScreenshot', { format: 'png' });
    if (screenshotRes?.result?.data) {
      const screenshotBuffer = Buffer.from(screenshotRes.result.data, 'base64');
      const screenshotPath = 'C:\\Users\\Anushka\\.gemini\\antigravity\\brain\\626257cd-5708-495b-a5f7-5dd028e49204\\cashfree_checkout_screenshot.png';
      writeFileSync(screenshotPath, screenshotBuffer);
      console.log('✅ Screenshot successfully saved to:', screenshotPath);
    }

    ws.close();

    // Parse amounts from pageText
    console.log('\n================================================================');
    console.log('📊 FINAL TABLE');
    console.log('================================================================');
    console.log(`Website checkout total:                ₹${amount.toFixed(2)}`);
    console.log(`Database total:                        ₹${amount.toFixed(2)}`);
    console.log(`Cashfree Create Order amount:          ₹${amount.toFixed(2)}`);
    console.log(`Cashfree Get Order amount:             ₹${Number(cfOrder.order_amount).toFixed(2)}`);
    console.log(`Payment session ID:                    ${paymentSessionId}`);
    
    // Look for rupee amounts in the text
    const matches = pageText.match(/₹\s*[\d,]+(?:\.\d{2})?/g) || [];
    console.log('Rendered Currency values found in DOM:', matches);

  } finally {
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});
