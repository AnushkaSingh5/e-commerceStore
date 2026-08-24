const supabaseUrl = 'https://cijmdfhimlfarefpjhsm.supabase.co';
const supabaseAnonKey = 'sb_publishable_KFvHxTlXz3gLZ5IU4Q1aCg_EWEk50SB';

async function testGetStores() {
  try {
    // Replicate direct query fallback of adminService.getStores()
    const url = `${supabaseUrl}/rest/v1/stores?select=*,creator:creator_id(email,sellers(name,verification_status))&order=created_at.desc`;
    const res = await fetch(url, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });

    if (!res.ok) {
      console.error('Error fetching stores:', res.statusText);
      return;
    }

    const storesData = await res.json();
    console.log('--- Mapped Stores Output ---');
    storesData.forEach(store => {
      console.log(`Store: ${store.name}`);
      console.log(`  Owner: ${store.creator?.sellers?.name}`);
      console.log(`  Email: ${store.creator?.email}`);
      console.log(`  Owner Verification Status: ${store.creator?.sellers?.verification_status || 'Not Submitted'}`);
      console.log(`  Store Status: ${store.status}`);
      console.log('---');
    });

  } catch (err) {
    console.error('Exception:', err.message);
  }
}

testGetStores();
