import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mount } from '@/test/mount';
import { NarrativePrompt } from './NarrativePrompt';

afterEach(cleanup);

const render = (error: Parameters<typeof NarrativePrompt>[0]['error']) =>
  mount(<NarrativePrompt loading={false} error={error} onGenerate={() => undefined} />);
const links = (el: HTMLElement) => [...el.querySelectorAll('[role="alert"] a')].map((a) => `${a.textContent?.trim()} -> ${a.getAttribute('href')}`);

describe('NarrativePrompt AI errors', () => {
  it('offers the own key first when the shared trial ran out', async () => {
    const el = await render({ message: 'The shared AI trial has reached its limit.', limit: true, connectKey: true });
    expect(links(el)).toEqual(['Connect your key -> /settings#ai-connection', 'See plans -> /pricing']);
  });

  it('points at the key when the user key failed, with no plan link', async () => {
    const el = await render({ message: 'Google rejected your Gemini key.', limit: false, fixKey: true });
    expect(links(el)).toEqual(['Check your key -> /settings#ai-connection']);
  });

  it('shows no link for an ordinary failure', async () => {
    const el = await render({ message: 'The AI is busy, try again in a moment.', limit: false });
    expect(links(el)).toEqual([]);
  });
});
