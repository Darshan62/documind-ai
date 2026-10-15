import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIError, generateAnswer, getAIConfig } from '../server/ai.js';

const config = { provider: 'Gemini' as const, key: 'test-only-not-a-real-key', model: 'gemini-2.5-flash-lite' };
const citations = [{ documentId: 'sample', name: 'sample.txt', passage: 'The budget is $42,000.', index: 1 }];
const reply = (body: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(body), { status });

test('Gemini takes priority, supports model overrides, and absent keys keep local mode', () => {
  assert.equal(getAIConfig({}), null);
  assert.equal(getAIConfig({ GEMINI_API_KEY: '  ' }), null);
  assert.deepEqual(getAIConfig({ GEMINI_API_KEY: ' test ', GEMINI_MODEL: 'custom-model', DOCUMIND_API_KEY: 'legacy' }), { provider: 'Gemini', key: 'test', model: 'custom-model' });
  assert.equal(getAIConfig({ GEMINI_API_KEY: 'test' })?.model, 'gemini-2.5-flash-lite');
  assert.equal(getAIConfig({ DOCUMIND_API_KEY: 'legacy' })?.provider, 'OpenAI');
});
test('Gemini request sends the key only in the header and includes numbered source excerpts', async () => {
  const request: typeof fetch = async (input, options) => {
    assert.equal(input, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent');
    assert.equal(new Headers(options?.headers).get('x-goog-api-key'), config.key);
    assert.equal(String(input).includes(config.key), false);
    const body = JSON.parse(String(options?.body));
    assert.match(body.systemInstruction.parts[0].text, /untrusted data/);
    const content = JSON.parse(body.contents[0].parts[0].text);
    assert.equal(content.question, 'What is the budget?');
    assert.deepEqual(content.excerpts, [{ number: 1, document: 'sample.txt', text: 'The budget is $42,000.' }]);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Internal thought', thought: true }, { text: 'The budget is $42,000 [1].' }] } }] }));
  };
  assert.equal(await generateAnswer(config, 'What is the budget?', citations, request), 'The budget is $42,000 [1].');
});
test('quota errors remain actionable without exposing provider payloads', async () => {
  await assert.rejects(generateAnswer(config, 'budget', citations, reply({ error: { message: config.key } }, 429)), error => {
    assert.ok(error instanceof AIError);
    assert.equal(error.status, 429);
    assert.match(error.message, /quota or rate limit/);
    assert.equal(error.message.includes(config.key), false);
    return true;
  });
});
test('authentication and model errors explain what to fix', async () => {
  for (const status of [400, 401, 403]) await assert.rejects(generateAnswer(config, 'budget', citations, reply({}, status)), /API key/);
  await assert.rejects(generateAnswer(config, 'budget', citations, reply({}, 404)), /GEMINI_MODEL/);
});
test('blocked, empty, malformed, and failed requests do not fabricate answers', async () => {
  await assert.rejects(generateAnswer(config, 'budget', citations, reply({ promptFeedback: { blockReason: 'SAFETY' } })), /content restriction/);
  await assert.rejects(generateAnswer(config, 'budget', citations, reply({ candidates: [] })), /no answer/);
  await assert.rejects(generateAnswer(config, 'budget', citations, async () => new Response('not json')), /unreadable response/);
  await assert.rejects(generateAnswer(config, 'budget', citations, async () => { throw new Error('network'); }), /could not be reached/);
});
test('existing OpenAI configuration remains supported', async () => {
  const request: typeof fetch = async (input, options) => {
    assert.equal(input, 'https://api.openai.com/v1/chat/completions');
    assert.equal(new Headers(options?.headers).get('Authorization'), `Bearer ${config.key}`);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'The budget is $42,000 [1].' } }] }));
  };
  assert.match(await generateAnswer({ ...config, provider: 'OpenAI', model: 'gpt-4.1-mini' }, 'budget', citations, request), /42,000/);
});
