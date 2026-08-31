// scratch/take-real-screenshot.mjs
import { execSync } from 'child_process';
import { existsSync, copyFileSync } from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sessionId = 'session_G2zkMolnS5Pizm6HRRJwJOBnxzDzmYpMQWEudZQUf3eAReGpesLhw5Jd3lq66jYuCKavVNqiV-A1GUO7JAYYnJ-4l5z-9jso02wZNdGgV7WSGAeWA8CFpltLyNdR';
const targetUrl = `https://payments.cashfree.com/order/#${sessionId}`;
const outScreenshot = path.resolve('scratch/cashfree_live_checkout.png');
const outDom = path.resolve('scratch/cashfree_live_dom.html');

console.log('Running Chrome to capture screenshot and DOM...');
try {
  const cmd = `"${chromePath}" --headless=new --disable-gpu --no-sandbox --window-size=1280,900 --virtual-time-budget=12000 --screenshot="${outScreenshot}" --dump-dom "${targetUrl}" > "${outDom}"`;
  console.log('Executing:', cmd);
  execSync(cmd, { stdio: 'inherit', timeout: 30000 });
} catch (e) {
  console.log('Command finished with:', e.message);
}

if (existsSync(outScreenshot)) {
  console.log('✅ Screenshot created:', outScreenshot);
  const artifactPath = 'C:\\Users\\Anushka\\.gemini\\antigravity\\brain\\626257cd-5708-495b-a5f7-5dd028e49204\\cashfree_live_checkout.png';
  copyFileSync(outScreenshot, artifactPath);
  console.log('✅ Copied to artifact:', artifactPath);
} else {
  console.log('❌ Screenshot not found at', outScreenshot);
}
