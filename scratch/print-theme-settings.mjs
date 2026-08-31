// scratch/print-theme-settings.mjs
const supabaseUrl = 'https://cijmdfhimlfarefpjhsm.supabase.co';
const supabaseKey = 'sb_publishable_KFvHxTlXz3gLZ5IU4Q1aCg_EWEk50SB';

async function printTheme() {
  const storeRes = await fetch(`${supabaseUrl}/rest/v1/stores?slug=eq.cutestore&select=id,name,slug,theme_settings`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  const stores = await storeRes.json();
  console.log('CuteStore theme_settings:', JSON.stringify(stores[0].theme_settings, null, 2));

  // Also fetch the full details of order 3085ac6f-0592-4055-87eb-7b48af5d06b8
  const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.3085ac6f-0592-4055-87eb-7b48af5d06b8&select=*`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  const orders = await orderRes.json();
  console.log('\nOrder 3085ac6f-0592-4055-87eb-7b48af5d06b8 in DB:');
  console.log(JSON.stringify(orders[0], null, 2));
}

printTheme().catch(console.error);
