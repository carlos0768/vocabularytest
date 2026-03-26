import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const perPage = 200;
let matches = [];
for (let page = 1; page <= 10; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
  if (error) throw error;
  const users = data?.users ?? [];
  for (const u of users) {
    const hay = JSON.stringify({
      email: u.email,
      user_metadata: u.user_metadata,
      app_metadata: u.app_metadata,
      identities: u.identities?.map(i => ({ provider: i.provider, identity_data: i.identity_data }))
    }).toLowerCase();
    if (hay.includes('kitsuki')) {
      matches.push({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata
      });
    }
  }
  if (users.length < perPage) break;
}
console.log(JSON.stringify(matches, null, 2));
