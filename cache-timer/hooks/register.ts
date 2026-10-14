import type { EngineInterface, Register, Timer, TurnUsage } from 'claude-code'

const MINUTE_MS = 60_000
const TICK_MS = 15_000
const SHORT_TTL_MS = 5 * MINUTE_MS
const LONG_TTL_MS = 60 * MINUTE_MS
// Requests sent right after a response (suggestions, summaries) can refresh the
// cache too, so a gap must clear 5 minutes by a margin before it says anything.
const PROBE_GAP_MS = SHORT_TTL_MS + 2 * MINUTE_MS

type Countdown = {
  ttlMs: number
  warnMs: number
  sentAt: number | undefined
  hasWarned: boolean
}

// What the last main-thread response leaves for telling the TTL from the next one.
type Probe = {
  endedAt: number | undefined
  model: string | undefined
  isPrefixChanged: boolean
  hasSuspected: boolean
}

async function show($: EngineInterface, c: Countdown) {
  if (c.sentAt === undefined) {
    $.ui.status(undefined)
    return
  }

  const leftMs = c.ttlMs - ((await $.clock.now()) - c.sentAt)

  if (leftMs <= 0) {
    $.ui.status('快取已過期')
    return
  }

  const minutes = Math.ceil(leftMs / MINUTE_MS)
  $.ui.status(`快取剩 ${minutes} 分`)

  if (!c.hasWarned && c.warnMs < c.ttlMs && leftMs <= c.warnMs) {
    c.hasWarned = true
    $.ui.toast(`快取再 ${minutes} 分鐘過期；過期後下一則訊息會重寫整段快取`, { timeoutMs: 15_000 })
  }
}

// A request sent well past 5 minutes after the last response tells the TTL: a
// cache read means the entry outlived 5 minutes, so the TTL is 1h. A miss while
// the countdown still ran hints at 5m, but an evicted entry or a changed prompt
// misses too, so it only warns. After a model change or a compaction it says nothing.
function probeTtl($: EngineInterface, c: Countdown, p: Probe, startedAt: number, usage: TurnUsage) {
  const isComparable = !p.isPrefixChanged && p.model === usage.model
  p.isPrefixChanged = false

  if (p.endedAt === undefined || !isComparable) {
    return
  }

  const idleMs = startedAt - p.endedAt
  if (idleMs <= PROBE_GAP_MS) {
    return
  }

  if (usage.cache_read_input_tokens > 0) {
    c.ttlMs = LONG_TTL_MS
    p.hasSuspected = false
    return
  }

  const isCountdownRunning = c.sentAt !== undefined && startedAt - c.sentAt < c.ttlMs
  if (c.ttlMs === LONG_TTL_MS && isCountdownRunning && usage.cache_creation_input_tokens > 0 && !p.hasSuspected) {
    p.hasSuspected = true
    $.ui.toast(
      `閒置 ${Math.round(idleMs / MINUTE_MS)} 分鐘後快取沒命中，TTL 可能已縮成 5 分鐘（例如進入超額用量）；確定的話把 cache-timer 的 ttl 設成 5m`,
      { timeoutMs: 15_000 },
    )
  }
}

// The cache's TTL restarts each time a main-thread request reads or writes it,
// so the countdown runs from when the last request that got a response was sent.
export const register: Register = (on, options) => {
  const countdown: Countdown = {
    ttlMs: options.ttl === '5m' ? SHORT_TTL_MS : LONG_TTL_MS,
    warnMs: (typeof options.warnMinutes === 'number' ? options.warnMinutes : 10) * MINUTE_MS,
    sentAt: undefined,
    hasWarned: false,
  }
  const probe: Probe = { endedAt: undefined, model: undefined, isPrefixChanged: false, hasSuspected: false }
  let ticker: Timer | undefined

  on('session.start', async ($, e, next) => {
    ticker?.cancel()
    ticker = $.clock.every(TICK_MS, () => void show($, countdown))

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const startedAt = await $.clock.now()
    const response = yield* next(e)

    if (e.agentId === undefined && response.usage !== null) {
      probeTtl($, countdown, probe, startedAt, response.usage)
      countdown.sentAt = startedAt
      countdown.hasWarned = false
      probe.endedAt = await $.clock.now()
      probe.model = response.usage.model
      await show($, countdown)
    }

    return response
  })

  // The engine names the TTL it caches with when the model switches; that beats the setting.
  on('classic.PostModelSwitch', async ($, e, next) => {
    countdown.ttlMs = e.cache_ttl === '5m' ? SHORT_TTL_MS : LONG_TTL_MS
    await show($, countdown)

    return next(e)
  })

  // A compaction rewrites the prompt, and its summary request touches the cache.
  on('classic.PostCompact', async ($, e, next) => {
    if (e.agent_id === undefined) {
      probe.isPrefixChanged = true
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      countdown.sentAt = undefined
      countdown.hasWarned = false
      probe.endedAt = undefined
      probe.model = undefined
      probe.isPrefixChanged = false
      probe.hasSuspected = false
      $.ui.status(undefined)
    }

    return next(e)
  })
}
