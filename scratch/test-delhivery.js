// scratch/test-delhivery.js
const token = '56cb633d26afeed53f71682609a69e38470048f5';
const apiBase = 'https://track.delhivery.com';

async function testCharges() {
  const queryParams = new URLSearchParams({
    md: 'E',
    ss: 'Delivered',
    o_pin: '481556',
    d_pin: '462022',
    cgm: '500'
  });

  // Test the new endpoint URL
  const url = `${apiBase}/api/kinko/v1/invoice/charges/.json?${queryParams.toString()}`;
  console.log(`Querying URL: ${url}`);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${token}`,
        'Accept': 'application/json'
      }
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log(`Response body: ${text}`);
  } catch (err) {
    console.error('Error querying Delhivery:', err);
  }
}

testCharges();
