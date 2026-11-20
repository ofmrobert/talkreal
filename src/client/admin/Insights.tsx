import { useState } from 'react'
import { Link } from 'react-router'
import { Bars, Card, dateTime, Loading, Meter, minutes, num, Page, pct, Pill, RangePicker, rub, shortDay, Stat, Stats, Table, Td, Th, usd, useAdmin } from './ui'

/* The screens that answer "how is the app doing?": overview, traffic, AI teachers. */

interface Overview {
  days: number
  kpi: Record<string, number>
  series: { day: string; signups: number; active: number; lessons: number; voiceMinutes: number; messages: number; revenue: number; payments: number }[]
  retention: { day: number; eligible: number; retained: number }[]
  funnel: Record<string, number>
}

const FUNNEL: [string, string][] = [
  ['visitors', 'Visited the site'],
  ['signed_up', 'Created an account'],
  ['chose_level', 'Chose a level'],
  ['finished_lesson', 'Finished a lesson'],
  ['made_call', 'Talked to a teacher'],
  ['paid', 'Paid'],
]

export function OverviewPage() {
  const [days, setDays] = useState(30)
  const { data, failed } = useAdmin<Overview>(`/overview?days=${days}`)
  if (!data) return <Loading failed={failed} />
  const { kpi, series, retention, funnel } = data
  const chart = (key: keyof Overview['series'][number]) => series.map((s) => ({ label: shortDay(s.day), value: Number(s[key]) }))
  const funnelMax = Math.max(1, ...FUNNEL.map(([key]) => funnel[key] ?? 0))

  return (
    <Page title="Overview" hint="The whole app at a glance. Days are counted on Moscow time." actions={<RangePicker value={days} onChange={setDays} />}>
      <Stats>
        <Stat label="Students" value={num(kpi.users)} sub={`+${num(kpi.new_1d)} today · +${num(kpi.new_7d)} this week`} />
        <Stat label="Active today" value={num(kpi.dau)} sub={`${num(kpi.wau)} this week · ${num(kpi.mau)} this month`} />
        <Stat label="Paying now" value={num(kpi.paying)} sub={`${num(kpi.paying_pro)} Pro · ${num(kpi.paying_max)} Max · ${pct(kpi.paying, kpi.placed)} of students`} />
        <Stat label="Monthly recurring" value={rub(kpi.mrr)} sub={`≈ ${usd(kpi.mrr)} · a yearly plan counts as 1/12`} />
        <Stat label="Revenue, 30 days" value={rub(kpi.revenue_30d)} sub={`≈ ${usd(kpi.revenue_30d)} · today ${rub(kpi.revenue_today)}`} />
        <Stat label="Revenue, all time" value={rub(kpi.revenue_all)} sub={`≈ ${usd(kpi.revenue_all)} · ${num(kpi.payments_all)} payments`} />
      </Stats>
      <Stats>
        <Stat label={`Visitors, ${days} days`} value={num(kpi.visitors)} />
        <Stat label={`Lessons, ${days} days`} value={num(kpi.lessons)} />
        <Stat label={`Calls, ${days} days`} value={num(kpi.calls)} sub={minutes(kpi.voice_seconds)} />
        <Stat label={`Chat messages, ${days} days`} value={num(kpi.text_messages)} />
        <Stat label="Plans ending in 7 days" value={num(kpi.expiring_7d)} sub="Not renewed automatically" />
        <Stat label="Photos to check" value={num(kpi.photos_to_review)} sub="New profile photos, on the Photos screen" />
      </Stats>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="New students per day">
          <Bars data={chart('signups')} />
        </Card>
        <Card title="Active students per day" hint="Students who finished a lesson, a review, a call or sent a chat message.">
          <Bars data={chart('active')} />
        </Card>
        <Card title="Revenue per day">
          <Bars data={chart('revenue')} format={rub} />
        </Card>
        <Card title="Lessons finished per day">
          <Bars data={chart('lessons')} />
        </Card>
        <Card title="Minutes of calls per day" hint="The main cost of the app: every minute is paid to the AI company.">
          <Bars data={chart('voiceMinutes')} />
        </Card>
        <Card title="Chat messages per day">
          <Bars data={chart('messages')} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="From visitor to customer" hint="All time. How many people got to each step, and what share of all accounts that is.">
          <Table>
            <tbody>
              {FUNNEL.map(([key, label]) => {
                const value = funnel[key] ?? 0
                // Later steps are shares of the accounts; the account step is a share of the visitors, once enough are counted.
                const share = key === 'visitors' ? '' : key === 'signed_up' ? (funnel.visitors >= value ? pct(value, funnel.visitors) : '') : pct(value, funnel.signed_up)
                return (
                  <tr key={key}>
                    <Td className="w-48 font-semibold">{label}</Td>
                    <Td>
                      <Meter value={value} max={funnelMax} />
                    </Td>
                    <Td right>{num(value)}</Td>
                    <Td right className="w-20 text-slate-400">
                      {share}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-slate-400">Visitors are counted only since visit tracking was switched on, so the first step may be smaller than the second at first.</p>
        </Card>
        <Card title="Do students come back?" hint="Of the students who joined at least that many days ago: the share who studied on that day after joining (last 180 days).">
          <Table>
            <thead>
              <tr>
                <Th>Day after joining</Th>
                <Th right>Students</Th>
                <Th right>Came back</Th>
                <Th right>Share</Th>
              </tr>
            </thead>
            <tbody>
              {retention.map((r) => (
                <tr key={r.day}>
                  <Td className="font-semibold">Day {r.day}</Td>
                  <Td right>{num(r.eligible)}</Td>
                  <Td right>{num(r.retained)}</Td>
                  <Td right className="font-bold text-slate-900">
                    {pct(r.retained, r.eligible)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </Page>
  )
}

interface Traffic {
  totals: Record<string, number>
  series: { day: string; views: number; visitors: number }[]
  pages: { path: string; views: number; visitors: number }[]
  sources: { source: string; campaign: string | null; visitors: number; accounts: number; buyers: number; rub: number }[]
  devices: { device: string; visitors: number }[]
}

export function TrafficPage() {
  const [days, setDays] = useState(30)
  const { data, failed } = useAdmin<Traffic>(`/traffic?days=${days}`)
  if (!data) return <Loading failed={failed} />
  const maxViews = Math.max(1, ...data.pages.map((p) => p.views))
  return (
    <Page
      title="Traffic"
      hint="Who comes, from where, and what they open. To see which post or person brings buyers, share links like talk-real.ru/?utm_source=instagram&utm_campaign=anna."
      actions={<RangePicker value={days} onChange={setDays} />}
    >
      <Stats>
        <Stat label="Visitors" value={num(data.totals.visitors)} />
        <Stat label="Screens opened" value={num(data.totals.views)} sub={`${data.totals.visitors ? (data.totals.views / data.totals.visitors).toFixed(1) : 0} per visitor`} />
        <Stat label="With an account" value={num(data.totals.accounts)} />
        <Stat label="Never logged in" value={num(data.totals.anonymous)} />
        {data.devices.slice(0, 2).map((d) => (
          <Stat key={d.device} label={`On ${d.device}`} value={num(d.visitors)} sub={pct(d.visitors, data.totals.visitors)} />
        ))}
      </Stats>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Visitors per day">
          <Bars data={data.series.map((s) => ({ label: shortDay(s.day), value: s.visitors }))} />
        </Card>
        <Card title="Screens opened per day">
          <Bars data={data.series.map((s) => ({ label: shortDay(s.day), value: s.views }))} />
        </Card>
      </div>
      <Card title="Where visitors come from" hint="By the first visit of each person. Accounts and buyers show what each source is really worth.">
        <Table>
          <thead>
            <tr>
              <Th>Source</Th>
              <Th>Campaign</Th>
              <Th right>Visitors</Th>
              <Th right>Accounts</Th>
              <Th right>Buyers</Th>
              <Th right>Visitor → buyer</Th>
              <Th right>Revenue</Th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={`${s.source}|${s.campaign}`}>
                <Td className="font-semibold text-slate-900">{s.source}</Td>
                <Td>{s.campaign ?? '—'}</Td>
                <Td right>{num(s.visitors)}</Td>
                <Td right>{num(s.accounts)}</Td>
                <Td right>{num(s.buyers)}</Td>
                <Td right>{pct(s.buyers, s.visitors)}</Td>
                <Td right className="font-bold text-slate-900">
                  {rub(s.rub)}
                </Td>
              </tr>
            ))}
            {data.sources.length === 0 && (
              <tr>
                <Td className="text-slate-400">No visits recorded in this period yet.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
      <Card title="Most opened screens" hint="Lessons, tests, calls and chats are each counted as one line.">
        <Table>
          <thead>
            <tr>
              <Th>Screen</Th>
              <Th />
              <Th right>Opened</Th>
              <Th right>Visitors</Th>
            </tr>
          </thead>
          <tbody>
            {data.pages.map((p) => (
              <tr key={p.path}>
                <Td className="font-mono text-xs text-slate-900">{p.path}</Td>
                <Td className="w-1/3">
                  <Meter value={p.views} max={maxViews} />
                </Td>
                <Td right>{num(p.views)}</Td>
                <Td right>{num(p.visitors)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </Page>
  )
}

interface Ai {
  totals: Record<string, number>
  chat: { messages: number; students: number }
  byTeacher: { teacher: string; calls: number; seconds: number }[]
  byTopic: { topic: string; calls: number; seconds: number }[]
  endings: { reason: string; calls: number }[]
  reports: { status: string; calls: number }[]
  recent: { id: string; userId: string; email: string | null; teacher: string; startedAt: string; seconds: number; scenario: string | null; lessonId: string | null; endReason: string | null; reportStatus: string; tokens: number | null; corrections: number | null }[]
  status: { voice: string | null; text: boolean; liveModel: string; textModel: string }
}

/** Google's list prices for the voice model, in dollars per million tokens. An estimate: check them against the bill. */
const PRICE_IN = 3
const PRICE_OUT = 12

export function AiPage() {
  const [days, setDays] = useState(30)
  const { data, failed } = useAdmin<Ai>(`/ai?days=${days}`)
  if (!data) return <Loading failed={failed} />
  const t = data.totals
  const meteredMinutes = t.metered_seconds / 60
  const cost = (t.prompt_tokens * PRICE_IN + t.response_tokens * PRICE_OUT) / 1_000_000
  const perMinute = meteredMinutes > 0 ? cost / meteredMinutes : null
  const max = (list: { calls: number }[]) => Math.max(1, ...list.map((x) => x.calls))
  const breakdown = (title: string, hint: string, list: { name: string; calls: number; seconds?: number }[]) => (
    <Card title={title} hint={hint}>
      <Table>
        <tbody>
          {list.map((row) => (
            <tr key={row.name}>
              <Td className="w-40 font-semibold capitalize">{row.name}</Td>
              <Td>
                <Meter value={row.calls} max={max(list)} />
              </Td>
              <Td right>{num(row.calls)}</Td>
              {row.seconds !== undefined && <Td right>{minutes(row.seconds)}</Td>}
            </tr>
          ))}
          {list.length === 0 && (
            <tr>
              <Td className="text-slate-400">Nothing in this period.</Td>
            </tr>
          )}
        </tbody>
      </Table>
    </Card>
  )

  return (
    <Page title="AI teachers" hint="Calls, chat and what they cost. Voice is the main expense of the app." actions={<RangePicker value={days} onChange={setDays} />}>
      <Stats>
        <Stat label="Calls" value={num(t.calls)} sub={`${num(t.students)} students`} />
        <Stat label="Minutes talked" value={num(Math.round(t.seconds / 60))} sub={`${Math.round(t.avg_seconds / 6) / 10} min on average`} />
        <Stat label="Chat messages" value={num(data.chat.messages)} />
        <Stat
          label="Voice cost per minute"
          value={perMinute === null ? '—' : `$${perMinute.toFixed(3)}`}
          sub={perMinute === null ? 'Appears after the first real calls' : `Estimate from ${num(Math.round(meteredMinutes))} measured minutes`}
        />
        <Stat label="Voice cost, estimate" value={`$${cost.toFixed(2)}`} sub={`${num(t.prompt_tokens)} in · ${num(t.response_tokens)} out tokens`} />
        <Stat label="AI status" value={data.status.voice ? 'On' : 'Off'} sub={`voice: ${data.status.voice ?? 'off'} · text: ${data.status.text ? 'on' : 'off'}`} />
      </Stats>
      <p className="text-xs text-slate-500">
        The cost is an estimate: tokens counted by Google × its list prices (${PRICE_IN} per million in, ${PRICE_OUT} per million out). Compare it with the real bill before relying on it. Models:{' '}
        {data.status.liveModel} (voice), {data.status.textModel} (text).
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {breakdown('By teacher', 'Who students choose to talk to.', data.byTeacher.map((x) => ({ name: x.teacher, calls: x.calls, seconds: x.seconds })))}
        {breakdown('By topic', 'Free talk, a lesson, or a role-play.', data.byTopic.map((x) => ({ name: x.topic, calls: x.calls, seconds: x.seconds })))}
        {breakdown('How calls ended', '"hangup" is normal. Many "provider_error" or "connection" mean a technical problem.', data.endings.map((x) => ({ name: x.reason, calls: x.calls })))}
        {breakdown('Call reviews', '"none" = too short to review. "failed" = the AI could not write it.', data.reports.map((x) => ({ name: x.status, calls: x.calls })))}
      </div>
      <Card title="Latest calls" hint="What was said is never stored: only the length, the topic and the numbers of the review.">
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Student</Th>
              <Th>Teacher</Th>
              <Th>Topic</Th>
              <Th right>Length</Th>
              <Th>Ended</Th>
              <Th>Review</Th>
              <Th right>Mistakes</Th>
              <Th right>Tokens</Th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((call) => (
              <tr key={call.id}>
                <Td className="whitespace-nowrap">{dateTime(call.startedAt)}</Td>
                <Td>
                  <Link to={`/admin/users/${call.userId}`} className="font-semibold text-violet-700 hover:underline">
                    {call.email ?? call.userId.slice(0, 8)}
                  </Link>
                </Td>
                <Td className="capitalize">{call.teacher}</Td>
                <Td>{call.lessonId ?? call.scenario ?? 'free talk'}</Td>
                <Td right>{minutes(call.seconds)}</Td>
                <Td>
                  <Pill tone={call.endReason === 'hangup' || call.endReason === 'limit' || call.endReason === 'max_duration' ? 'grey' : 'amber'}>{call.endReason ?? 'unfinished'}</Pill>
                </Td>
                <Td>
                  <Pill tone={call.reportStatus === 'ready' ? 'green' : call.reportStatus === 'failed' ? 'red' : 'grey'}>{call.reportStatus}</Pill>
                </Td>
                <Td right>{call.corrections ?? '—'}</Td>
                <Td right>{call.tokens === null ? '—' : num(call.tokens)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </Page>
  )
}
