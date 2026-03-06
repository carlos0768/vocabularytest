#!/usr/bin/env node

import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function findUserByEmail(supabase, email) {
  const perPage = 200;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.length < perPage) break;
  }

  return null;
}

async function main() {
  const email = process.argv[2] ?? process.env.DEBUG_USER_EMAIL;
  if (!email) {
    console.error('Usage: node scripts/upgrade-user.mjs <email>');
    process.exit(1);
  }

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const user = await findUserByEmail(supabase, email);
  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: user.id,
        plan: 'pro',
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      },
    )
    .select();

  if (subscriptionError) throw subscriptionError;

  console.log(`Upgraded to Pro: ${user.id} ${user.email ?? ''}`.trim());
  console.log(JSON.stringify(subscription, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
