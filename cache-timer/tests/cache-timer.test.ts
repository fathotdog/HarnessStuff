import type { On, TurnStepResult, TurnUsage } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const MINUTE_MS = 60_000

const HIT: TurnUsage = {
  model: 'claude-opus-5-5',
  input_tokens: 10,
  output_tokens: 10,
  cache_read_input_tokens: 1000,
  cache_creation_input_tokens: 0,
}

const MISS: TurnUsage = { ...HIT, cache_read_input_tokens: 0, cache_creation_input_tokens: 1000 }

// What sits beneath the plugin: records the status line and toasts, answers steps with `usage`.
const beneath = (on: On) => {
  const seen = { statuses: [] as (string | undefined)[], toasts: [] as string[], usage: HIT }

  on('ui.status', ($, e) => {
    seen.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* ($, e): AsyncGenerator<never, TurnStepResult> {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: seen.usage }
  })
  on('classic.PostModelSwitch', () => ({}))
  on('classic.PostCompact', () => ({}))
  on('command.register', (_, e) => ({ value: { command: e.name } }))

  return seen
}

// Records what the plugin submits; each one is answered by a main-thread step,
// as the engine would run the turn it starts.
const submissions = ($: Engine, on: On) => {
  const texts: string[] = []
  on('prompt.submit', async (_, e) => {
    if (e.origin?.kind === 'plugin') {
      texts.push(e.text)
      await step($)
    }
    return { text: e.text }
  })
  return texts
}

const keepAlive = ($: Engine, args = '') => $.command.run({ command: 'cache-keepalive', args })

const userPrompt = ($: Engine) => $.prompt.submit({ text: 'hi' })

const ttlToasts = (seen: { toasts: string[] }) => seen.toasts.filter(text => text.includes('TTL'))

const start = ($: Engine) => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

const step = async ($: Engine, agentId?: string) => {
  const stream = $.turn.step({
    turnId: 't1',
    index: 0,
    model: 'claude-opus-5-5',
    messageCount: 3,
    ...(agentId === undefined ? {} : { agentId }),
  })
  for await (const _ of stream) {
    // drain
  }
  return stream.result
}

const switchModel = ($: Engine, cacheTtl: '5m' | '1h') =>
  $.classic.PostModelSwitch({
    from_model: 'claude-opus-5-5',
    to_model: 'claude-sonnet-5-5',
    requested_model: 'sonnet',
    source: 'command',
    context_tokens: 1000,
    prompt_cache_warm: true,
    cache_ttl: cacheTtl,
    estimated_cache_write_usd: 0.01,
    pricing: 'catalog',
  })

const compact = ($: Engine, agentId?: string) =>
  $.classic.PostCompact({
    trigger: 'manual',
    compact_summary: 'summary',
    ...(agentId === undefined ? {} : { agent_id: agentId }),
  })

describe('cache-timer', () => {
  test('counts down from 60 minutes and warns once at 10 left', async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($)
    expect(seen.statuses.at(-1)).toBe('快取剩 60 分')

    await clock.advance(50 * MINUTE_MS)
    expect(seen.statuses.at(-1)).toBe('快取剩 10 分')
    expect(seen.toasts).toHaveLength(1)
    expect(seen.toasts[0]).toContain('10 分鐘過期')

    await clock.advance(5 * MINUTE_MS)
    expect(seen.toasts).toHaveLength(1)

    await clock.advance(5 * MINUTE_MS)
    expect(seen.statuses.at(-1)).toBe('快取已過期')
  })

  test('a new main-thread request restarts the countdown and re-arms the warning', async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($)
    await clock.advance(51 * MINUTE_MS)
    expect(seen.toasts).toHaveLength(1)

    await step($)
    expect(seen.statuses.at(-1)).toBe('快取剩 60 分')

    await clock.advance(50 * MINUTE_MS)
    expect(seen.toasts).toHaveLength(2)
  })

  test('a subagent request leaves the countdown alone', async ($, on) => {
    mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($, 'agent-1')
    expect(seen.statuses.filter(text => text !== undefined)).toHaveLength(0)
  })

  test('a 5 minute TTL counts from 5 and skips the 10 minute warning', { options: { ttl: '5m' } }, async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($)
    expect(seen.statuses.at(-1)).toBe('快取剩 5 分')

    await clock.advance(5 * MINUTE_MS)
    expect(seen.statuses.at(-1)).toBe('快取已過期')
    expect(seen.toasts).toHaveLength(0)
  })

  test('the TTL a model switch reports replaces the setting', async ($, on) => {
    mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($)
    await switchModel($, '5m')
    expect(seen.statuses.at(-1)).toBe('快取剩 5 分')

    await switchModel($, '1h')
    expect(seen.statuses.at(-1)).toBe('快取剩 60 分')
  })

  test('a cache read well past 5 idle minutes confirms 1h over a 5m setting', { options: { ttl: '5m' } }, async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($)
    await clock.advance(20 * MINUTE_MS)
    await step($)
    expect(seen.statuses.at(-1)).toBe('快取剩 60 分')
  })

  test('a cache read inside the margin proves nothing', { options: { ttl: '5m' } }, async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($)
    await clock.advance(6 * MINUTE_MS)
    await step($)
    expect(seen.statuses.at(-1)).toBe('快取剩 5 分')
  })

  test('a miss while the 1h countdown runs warns once, keeps the countdown, and a read re-arms it', async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($)
    await clock.advance(20 * MINUTE_MS)
    seen.usage = MISS
    await step($)
    expect(ttlToasts(seen)).toHaveLength(1)
    expect(ttlToasts(seen)[0]).toContain('閒置 20 分鐘')
    expect(seen.statuses.at(-1)).toBe('快取剩 60 分')

    await clock.advance(20 * MINUTE_MS)
    await step($)
    expect(ttlToasts(seen)).toHaveLength(1)

    await clock.advance(20 * MINUTE_MS)
    seen.usage = HIT
    await step($)
    await clock.advance(20 * MINUTE_MS)
    seen.usage = MISS
    await step($)
    expect(ttlToasts(seen)).toHaveLength(2)
  })

  test('a miss after a model change or a compaction says nothing, once', async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($)
    await clock.advance(20 * MINUTE_MS)
    seen.usage = { ...MISS, model: 'claude-sonnet-5-5' }
    await step($)
    expect(ttlToasts(seen)).toHaveLength(0)

    await clock.advance(20 * MINUTE_MS)
    await compact($)
    await step($)
    expect(ttlToasts(seen)).toHaveLength(0)

    await clock.advance(20 * MINUTE_MS)
    await step($)
    expect(ttlToasts(seen)).toHaveLength(1)
  })

  test("a subagent's compaction leaves the probe alone", async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($)
    await clock.advance(20 * MINUTE_MS)
    await compact($, 'agent-1')
    seen.usage = MISS
    await step($)
    expect(ttlToasts(seen)).toHaveLength(1)
  })

  test('keep-alive is off until toggled, then resends before expiry', async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    const sent = submissions($, on)
    await start($)

    await step($)
    await clock.advance(59 * MINUTE_MS)
    expect(sent).toHaveLength(0)

    await step($)
    const reply = await keepAlive($)
    expect(reply.text).toContain('已開啟')
    expect(seen.statuses.at(-1)).toBe('快取剩 60 分 · 自動續命')

    await clock.advance(57 * MINUTE_MS)
    expect(sent).toHaveLength(0)

    await clock.advance(1 * MINUTE_MS)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('cache-timer')
    expect(seen.statuses.at(-1)).toBe('快取剩 60 分 · 自動續命')
  })

  test('keep-alive sends once per countdown and toggles off', async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    const sent: string[] = []
    on('prompt.submit', (_, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    await start($)

    await step($)
    await keepAlive($, 'on')
    await clock.advance(59 * MINUTE_MS)
    expect(sent).toHaveLength(1)

    await clock.advance(30_000)
    expect(sent).toHaveLength(1)

    await step($)
    const reply = await keepAlive($)
    expect(reply.text).toContain('已關閉')
    expect(seen.statuses.at(-1)).toBe('快取剩 60 分')
    await clock.advance(59 * MINUTE_MS)
    expect(sent).toHaveLength(1)
  })

  test('keep-alive stops after the idle limit and resumes on a user prompt', { options: { keepAliveHours: 2 } }, async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    const sent = submissions($, on)
    await start($)

    await step($)
    await keepAlive($, 'on')
    await clock.advance(3 * 60 * MINUTE_MS)
    expect(sent).toHaveLength(2)
    expect(seen.toasts.some(text => text.includes('停止自動續命'))).toBe(true)
    expect(seen.statuses.at(-1)).toBe('快取已過期')

    await userPrompt($)
    await step($)
    await clock.advance(59 * MINUTE_MS)
    expect(sent).toHaveLength(3)
  })

  test('keep-alive with a 5 minute TTL resends every few minutes, then stops at 30 idle minutes', { options: { ttl: '5m' } }, async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    const sent = submissions($, on)
    await start($)

    await step($)
    await keepAlive($, 'on')
    await clock.advance(20 * MINUTE_MS)
    expect(sent.length).toBeGreaterThanOrEqual(5)

    await clock.advance(20 * MINUTE_MS)
    const atLimit = sent.length
    expect(seen.toasts.some(text => text.includes('30 分鐘') && text.includes('停止自動續命'))).toBe(true)
    expect(seen.statuses.at(-1)).toBe('快取已過期')

    await clock.advance(20 * MINUTE_MS)
    expect(sent).toHaveLength(atLimit)
  })

  test('a miss after the countdown ran out is expected', async ($, on) => {
    const clock = mock.clock(on)
    const seen = beneath(on)
    await start($)

    await step($)
    await clock.advance(61 * MINUTE_MS)
    seen.usage = MISS
    await step($)
    expect(ttlToasts(seen)).toHaveLength(0)
  })
})
