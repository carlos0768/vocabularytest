const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ryoyvpayoacgeqgoehgk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5b3l2cGF5b2FjZ2VxZ29laGdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ0ODg2OSwiZXhwIjoyMDg0NzIwODY5fQ.zXddrhDwP7p4lVfCZqgenI2pyUG2RSuLwU658Plo4sw';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function upgradeUserToPro() {
  const email = 'shizuku_may20090303@yahoo.co.jp';
  
  try {
    // 1. ユーザーを検索
    const { data: user, error: userError } = await supabase
      .from('auth.users')
      .select('id, email')
      .eq('email', email)
      .single();
    
    if (userError || !user) {
      console.error('User not found:', userError);
      
      // auth.usersは直接アクセスできない場合があるので、profilesテーブルで検索
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', email)
        .single();
      
      if (profileError || !profile) {
        console.error('Profile not found:', profileError);
        process.exit(1);
      }
      
      user = profile;
    }
    
    console.log('Found user:', user.id, user.email);
    
    // 2. Proサブスクリプションを追加/更新
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        plan: 'pro',
        status: 'active',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select();
    
    if (subError) {
      console.error('Failed to update subscription:', subError);
      process.exit(1);
    }
    
    console.log('✅ Successfully upgraded to Pro:', sub);
    
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

upgradeUserToPro();
