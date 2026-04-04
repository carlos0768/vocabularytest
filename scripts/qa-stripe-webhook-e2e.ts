/**
 * Stripe Webhook E2E QA Script
 *
 * Prerequisites:
 *   1. Install Stripe CLI: https://docs.stripe.com/stripe-cli
 *   2. Login: stripe login
 *   3. Forward webhooks: stripe listen --forward-to localhost:3000/api/subscription/webhook
 *   4. Set STRIPE_WEBHOOK_SECRET from the CLI output in your .env.local
 *
 * Usage:
 *   npx tsx scripts/qa-stripe-webhook-e2e.ts
 *
 * This script triggers Stripe CLI test events and verifies DB state changes.
 */

import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
);

async function triggerStripeEvent(eventType: string): Promise<string> {
  const output = execSync(`stripe trigger ${eventType}`, { encoding: 'utf8' });
  console.log(`[Stripe CLI] Triggered ${eventType}:`, output.trim());
  return output;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Stripe Webhook E2E QA ===\n');

  console.log('Step 1: Triggering checkout.session.completed...');
  await triggerStripeEvent('checkout.session.completed');
  await sleep(3000);

  console.log('\nStep 2: Triggering invoice.paid...');
  await triggerStripeEvent('invoice.paid');
  await sleep(3000);

  console.log('\nStep 3: Triggering customer.subscription.updated...');
  await triggerStripeEvent('customer.subscription.updated');
  await sleep(3000);

  console.log('\nStep 4: Triggering customer.subscription.deleted...');
  await triggerStripeEvent('customer.subscription.deleted');
  await sleep(3000);

  console.log('\nStep 5: Triggering invoice.payment_failed...');
  await triggerStripeEvent('invoice.payment_failed');
  await sleep(3000);

  console.log('\nStep 6: Triggering charge.refunded...');
  await triggerStripeEvent('charge.refunded');
  await sleep(3000);

  console.log('\n=== All events triggered. Check webhook_events table for processing status. ===');

  const { data: events, error } = await supabase
    .from('webhook_events')
    .select('id, type, status, attempt_count, processed_at')
    .order('received_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Failed to query webhook_events:', error.message);
  } else {
    console.log('\nRecent webhook events:');
    console.table(events);
  }
}

main().catch((err) => {
  console.error('QA script failed:', err);
  process.exit(1);
});
