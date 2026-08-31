// scratch/test-fetch-cashfree-payments-url.mjs
const sessionId = 'session_9CCF8t8CToKJe7Du5dd01VGFKT5OZJFWbOYUuG9M80g9Xibn5PMJSXzS3r5ZmQYlFyuVxpRz7yndMx5UdDrW5TCcJthQCHgXPG9qu6CrfGu-FIM7mKX2Z6NYEXVh';

async function testPaymentsUrl() {
  const url = `https://payments.cashfree.com/order/#${sessionId}`;
  console.log('Testing URL:', url);
  const res = await fetch(`https://payments.cashfree.com/order/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  console.log('payments.cashfree.com status:', res.status);
  const text = await res.text();
  console.log('payments.cashfree.com title/html snippet:', text.slice(0, 400));
}

testPaymentsUrl().catch(console.error);
