import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const { data, error } = await supabase
      .from('questions')
      .select('year, description, path, rubric');

    if (error) throw error;

    return Response.json(data);
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: 'Failed to fetch questions' }, { status: 500 });
  }
} 