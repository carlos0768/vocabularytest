const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  'https://ryoyvpayoacgeqgoehgk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function run() {
  // Get all words without embedding
  const { data: words, error, count } = await supabase
    .from('words')
    .select('id, english, japanese', { count: 'exact' })
    .is('embedding', null)
    .limit(2000);

  if (error) { console.error(error); return; }
  console.log(`Found ${count} words without embedding, processing ${words.length}...`);

  const BATCH = 100;
  let success = 0;

  for (let i = 0; i < words.length; i += BATCH) {
    const batch = words.slice(i, i + BATCH);
    const texts = batch.map(w => `${w.english} - ${w.japanese}`);

    try {
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });

      for (let j = 0; j < batch.length; j++) {
        const { error: updateErr } = await supabase.rpc('update_word_embedding', {
          word_id: batch[j].id,
          new_embedding: res.data[j].embedding,
        });
        if (updateErr) console.error(`Failed ${batch[j].english}:`, updateErr.message);
        else success++;
      }
      console.log(`Processed ${Math.min(i + BATCH, words.length)}/${words.length} (${success} ok)`);
    } catch (e) {
      console.error(`Batch ${i} failed:`, e.message);
    }
  }
  console.log(`Done! ${success}/${words.length} embeddings generated.`);
}

run();
