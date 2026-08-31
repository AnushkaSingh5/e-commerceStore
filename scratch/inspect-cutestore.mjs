// scratch/inspect-cutestore.mjs
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cijmdfhimlfarefpjhsm.supabase.co';
const supabaseKey = 'sb_publishable_KFvHxTlXz3gLZ5IU4Q1aCg_EWEk50SB';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectStore() {
  const { data: store, error } = await supabase
    .from('stores')
    .select('id, name, slug, theme_settings')
    .eq('slug', 'cutestore')
    .maybeSingle();

  console.log('CuteStore in DB:', JSON.stringify(store, null, 2));

  // Query recent orders
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('id, total_amount, shipping_cost, discount_amount, coupon_code, payment_provider, created_at')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\nRecent Orders for CuteStore:');
  console.log(JSON.stringify(recentOrders, null, 2));
}

inspectStore().catch(console.error);
