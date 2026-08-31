// scratch/inspect-cutestore-rest.mjs
const supabaseUrl = 'https://cijmdfhimlfarefpjhsm.supabase.co';
const supabaseKey = 'sb_publishable_KFvHxTlXz3gLZ5IU4Q1aCg_EWEk50SB';

async function inspectRest() {
  const storeRes = await fetch(`${supabaseUrl}/rest/v1/stores?slug=eq.cutestore&select=*`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  const stores = await storeRes.json();
  console.log('Store:', JSON.stringify(stores, null, 2));

  if (stores.length > 0) {
    const storeId = stores[0].id;
    const ordersRes = await fetch(`${supabaseUrl}/rest/v1/orders?store_id=eq.${storeId}&select=*&order=created_at.desc&limit=5`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    const orders = await ordersRes.json();
    console.log('\nRecent Orders for CuteStore:');
    console.log(JSON.stringify(orders.map(o => ({
      id: o.id,
      total_amount: o.total_amount,
      shipping_cost: o.shipping_cost,
      discount_amount: o.discount_amount,
      coupon_code: o.coupon_code,
      payment_provider: o.payment_provider,
      created_at: o.created_at
    })), null, 2));
  }
}

inspectRest().catch(console.error);
