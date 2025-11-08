import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response('Missing OPENAI_API_KEY', { status: 500 });
  }

  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';
  const voice = process.env.OPENAI_REALTIME_VOICE || 'verse';

  try {
    const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        voice,
        input_audio_format: 'webaudio',
        // You can customize default instructions the agent should follow
        instructions: process.env.AGENT_INSTRUCTIONS ||
          'You are a helpful, concise voice assistant for phone-like conversations. Keep responses short.',
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return new Response(text || 'Failed to create session', { status: 500 });
    }

    const json = await r.json();
    return Response.json({ client_secret: json.client_secret?.value, model });
  } catch (err: any) {
    return new Response(err?.message || 'Server error', { status: 500 });
  }
}
