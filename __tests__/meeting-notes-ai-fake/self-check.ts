// Setup self-check of the meeting-notes fake AI server (T16): one scripted
// success per protocol endpoint (anthropic, openai, kimi, glm) over real HTTP,
// then the recorded request is read back. Any mismatch throws, failing the
// runner's setup loudly. Leaves the server reset.
import { FAKE_AI_PROVIDERS, FAKE_AI_PROVIDER_PATHS, type FakeAiProvider } from './config';
import { MeetingNotesFakeAiControl } from './control-client';

/** Canary credentials (not real keys); only their last 4 characters may be recorded. */
const SELF_CHECK_KEYS: Readonly<Record<FakeAiProvider, string>> = {
  anthropic: 'fake-self-check-anthropic-canary-a001',
  openai: 'fake-self-check-openai-canary-o002',
  kimi: 'fake-self-check-kimi-canary-k003',
  glm: 'fake-self-check-glm-canary-g004',
};

function fail(provider: FakeAiProvider, what: string): never {
  throw new Error(`Fake AI self-check (${provider}): ${what}`);
}

function modelText(provider: FakeAiProvider, payload: unknown): string {
  if (provider === 'anthropic') {
    const content = (payload as { content?: Array<{ type: string; text?: string }> }).content ?? [];
    return content.find((block) => block.type === 'text')?.text ?? fail(provider, 'response has no text block');
  }
  const choice = (payload as { choices?: Array<{ message?: { content?: string | null } }> }).choices?.[0];
  return choice?.message?.content ?? fail(provider, 'response has no choices[0].message.content');
}

export async function runMeetingNotesFakeAiSelfCheck(baseUrl: string): Promise<string[]> {
  const control = new MeetingNotesFakeAiControl(baseUrl);
  await control.reset();
  const lines: string[] = [];
  try {
    for (const provider of FAKE_AI_PROVIDERS) {
      const draft = { selfCheck: provider, summary: { keyPoints: ['ok'] }, actionItems: [] };
      await control.script(provider, { kind: 'success', draft });
      const key = SELF_CHECK_KEYS[provider];
      const headers: Record<string, string> =
        provider === 'anthropic'
          ? { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }
          : { 'content-type': 'application/json', authorization: `Bearer ${key}` };
      const model = `self-check-${provider}-model`;
      const response = await fetch(`${baseUrl}${FAKE_AI_PROVIDER_PATHS[provider]}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, max_tokens: 64, messages: [{ role: 'user', content: 'self-check transcript' }] }),
      });
      if (response.status !== 200) fail(provider, `expected 200, got ${response.status}: ${await response.text()}`);
      const text = modelText(provider, await response.json());
      if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(draft)) fail(provider, `draft mismatch: ${text}`);

      const { requests, received } = await control.requests(provider);
      if (received[provider] !== 1 || requests.length !== 1) {
        fail(provider, `expected exactly 1 recorded request, got ${received[provider]}`);
      }
      const [recorded] = requests;
      if (recorded.path !== FAKE_AI_PROVIDER_PATHS[provider]) fail(provider, `recorded path ${recorded.path}`);
      if ((recorded.body as { model?: unknown } | null)?.model !== model) fail(provider, 'recorded body lacks the model');
      if (recorded.outcome !== 'success') fail(provider, `recorded outcome ${recorded.outcome}`);
      if (recorded.credential?.last4 !== key.slice(-4)) fail(provider, 'credential last 4 not recorded');
      if (JSON.stringify(recorded).includes(key)) fail(provider, 'the full credential was stored');
      lines.push(`${provider}: POST ${recorded.path} → 200 draft ok; recorded #${recorded.seq} (${recorded.credential.header} …${recorded.credential.last4})`);
    }
  } finally {
    await control.reset();
  }
  return lines;
}
