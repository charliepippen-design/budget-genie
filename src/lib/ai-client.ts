const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const edgeFunction = async (name: string, body: object) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase URL or anon key is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.'
    );
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Edge function "${name}" failed (${res.status}): ${errText.slice(0, 500)}`
    );
  }
  return res.json();
};

export const genieChat = (messages: object[], system: string) =>
  edgeFunction('genie-chat', { messages, system }) as Promise<{ text: string }>;

export const generatePlan = (prompt: string) => edgeFunction('generate-plan', { prompt });

export const generateNarrative = (prompt: string) => edgeFunction('generate-narrative', { prompt });
