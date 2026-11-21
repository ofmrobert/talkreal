import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { PRICES } from '../../shared/plans'
import { api, ApiError } from '../lib/api'
import { Bars, buttonClass, Card, date, dateTime, ghostButtonClass, inputClass, Loading, minutes, num, Page, Pager, pct, Pill, planTone, rub, shortDay, Stat, Stats, Table, Td, Th, usd, useAdmin } from './ui'

/* The screens about people and money: students, one student, payments, promo codes. */

interface UserRow {
  id: string
  email: string | null
  name: string | null
  telegram: boolean
  telegramId: string | null
  telegramUsername: string | null
  createdAt: string
  level: string | null
  plan: string
  planUntil: string | null
  xp: number
  streak: number
  lastActive: string | null
  lessons: number
  voiceMinutes: number
  spentRub: number
}

const who = (u: { email: string | null; name: string | null; id: string }) => u.email ?? u.name ?? u.id.slice(0, 8)

/** The student's Telegram: a link to their @name if they have one, otherwise the numeric id. */
function Telegram({ id, username }: { id: string | null; username: string | null }) {
  if (!id) return <span className="text-slate-300">—</span>
  if (!username) return <span className="whitespace-nowrap text-slate-400" title={`Telegram id ${id}`}>no @username</span>
  return (
    <a href={`https://t.me/${username}`} target="_blank" rel="noreferrer" className="whitespace-nowrap font-semibold text-violet-700 hover:underline">
      @{username}
    </a>
  )
}

export function UsersPage() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState('')
  const [level, setLevel] = useState('')
  const [sort, setSort] = useState('new')
  const [page, setPage] = useState(0)
  const query = new URLSearchParams({ q: search, plan, level, sort, page: String(page) }).toString()
  const { data, failed } = useAdmin<{ total: number; page: number; pageSize: number; users: UserRow[] }>(`/users?${query}`)
  const change = (set: (value: string) => void) => (value: string) => {
    set(value)
    setPage(0)
  }

  return (
    <Page title="Students" hint="Everyone with an account. Click a row to see everything about one student.">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          change(setSearch)(q.trim())
        }}
      >
        <input className={`${inputClass} w-64`} placeholder="Email, name, @telegram or user id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <button className={buttonClass} type="submit">
          Search
        </button>
        <select className={inputClass} value={plan} onChange={(e) => change(setPlan)(e.target.value)} aria-label="Plan">
          <option value="">Any plan</option>
          <option value="paying">Paying</option>
          <option value="pro">Pro</option>
          <option value="max">Max</option>
          <option value="free">Free</option>
        </select>
        <select className={inputClass} value={level} onChange={(e) => change(setLevel)(e.target.value)} aria-label="Level">
          <option value="">Any level</option>
          {['A1', 'A2', 'B1', 'B2', 'C1'].map((l) => (
            <option key={l}>{l}</option>
          ))}
          <option value="none">No level yet</option>
        </select>
        <select className={inputClass} value={sort} onChange={(e) => change(setSort)(e.target.value)} aria-label="Sort">
          <option value="new">Newest first</option>
          <option value="active">Last active</option>
          <option value="xp">Most XP</option>
          <option value="streak">Longest streak</option>
        </select>
      </form>

      <Card>
        {!data ? (
          <Loading failed={failed} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Email login</Th>
                  <Th>Telegram login</Th>
                  <Th>Joined</Th>
                  <Th>Level</Th>
                  <Th>Plan</Th>
                  <Th right>Lessons</Th>
                  <Th right>Calls</Th>
                  <Th right>XP</Th>
                  <Th right>Streak</Th>
                  <Th>Last active</Th>
                  <Th right>Paid</Th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <Td>
                      {/* Every row has one link to the student's page: the email, or the name for Telegram-only accounts. */}
                      <Link to={`/admin/users/${u.id}`} className="font-semibold text-violet-700 hover:underline">
                        {u.email ?? (u.telegramId ? '' : `no login · ${u.id.slice(0, 8)}`)}
                      </Link>
                      {!u.email && u.telegramId && <span className="text-slate-300">—</span>}
                    </Td>
                    <Td>
                      {u.telegramId && !u.email ? (
                        <Link to={`/admin/users/${u.id}`} className="mr-2 font-semibold text-violet-700 hover:underline">
                          {u.name ?? 'Telegram user'}
                        </Link>
                      ) : (
                        u.telegramId && u.name && <span className="mr-2">{u.name}</span>
                      )}
                      <Telegram id={u.telegramId} username={u.telegramUsername} />
                    </Td>
                    <Td className="whitespace-nowrap">{date(u.createdAt)}</Td>
                    <Td>{u.level ?? '—'}</Td>
                    <Td>
                      <Pill tone={planTone(u.plan)}>{u.plan}</Pill>
                      {u.planUntil && <span className="ml-1.5 whitespace-nowrap text-xs text-slate-400">to {date(u.planUntil)}</span>}
                    </Td>
                    <Td right>{num(u.lessons)}</Td>
                    <Td right>{u.voiceMinutes} min</Td>
                    <Td right>{num(u.xp)}</Td>
                    <Td right>{u.streak}</Td>
                    <Td className="whitespace-nowrap">{u.lastActive ? shortDay(u.lastActive) : '—'}</Td>
                    <Td right className={u.spentRub > 0 ? 'font-bold text-slate-900' : 'text-slate-300'}>
                      {rub(u.spentRub)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </Page>
  )
}

const smallButton = 'whitespace-nowrap rounded-md border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50'

/** One thing the owner can allow or forbid for a student: what it is now, and a button to change it. */
function Switch(props: { label: string; hint: ReactNode; on: boolean; pill: ReactNode; onLabel: string; offLabel: string; busy: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-56 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
          {props.label} {props.pill}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-slate-500">{props.hint}</p>
      </div>
      <button type="button" className={`${ghostButtonClass} whitespace-nowrap`} disabled={props.busy} onClick={() => props.onChange(!props.on)}>
        {props.on ? props.onLabel : props.offLabel}
      </button>
    </div>
  )
}

interface UserDetail {
  profile: { name: string | null; bio: string | null; city: string | null; age: number | null; gender: string | null; goals: string[]; interests: string[]; discoverable: boolean; photoVersion: number | null; photoChecked: boolean; hiddenByModerator: boolean }
  activity: { posts: number; postsFlagged: number; comments: number; commentsFlagged: number; complaints: number; complaintsOpen: number; messagesStopped: number; blockedBy: number }
  user: {
    id: string
    email: string | null
    name: string | null
    telegram: boolean
    telegramId: string | null
    telegramUsername: string | null
    dmBannedAt?: string | null
    dmRulesAt?: string | null
    feedBannedAt?: string | null
    createdAt: string
    locale: string
    timezone: string | null
    level: string | null
    plan: string
    planUntil: string | null
    xp: number
    streak: number
    longestStreak: number
    freezes: number
    lastActive: string | null
    reminders: boolean
    reminderHour: number
    consentAt: string | null
  }
  progress: { id: string; accuracy: number; completions: number; last: string }[]
  usage: { day: string; lessons: number; xp: number; voiceMinutes: number; messages: number }[]
  payments: { id: string; plan: string; period: string; amountRub: number; status: string; promoCode: string | null; createdAt: string; paidAt: string | null; provider: string }[]
  calls: { id: string; teacher: string; startedAt: string; seconds: number; scenario: string | null; lessonId: string | null; endReason: string | null; reportStatus: string; corrections: number | null; words: number | null }[]
  review: { total: number; due: number }
  achievements: string[]
  placements: { method: string; level: string; at: string }[]
  devices: { n: number; last: string | null }
  pushDevices: number
  views: { path: string; at: string; device: string | null }[]
  source: { referrer: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null } | null
}

export function UserPage() {
  const { id } = useParams()
  const { data, failed, reload } = useAdmin<UserDetail>(`/users/${id}`)
  const [plan, setPlan] = useState('pro')
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  if (!data) return <Loading failed={failed} />
  const { user } = data
  const lessons = data.progress.filter((p) => /^\w\d-\d\d$/.test(p.id))
  const tests = data.progress.filter((p) => !/^\w\d-\d\d$/.test(p.id))
  const paid = data.payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amountRub, 0)
  const source = data.source ? [data.source.utmSource, data.source.utmCampaign, data.source.referrer].filter(Boolean).join(' · ') || 'direct' : 'unknown'

  async function setUserPlan(next: string) {
    if (!window.confirm(next === 'free' ? 'Remove the paid plan from this student?' : `Give ${next.toUpperCase()} for ${days} days? This is free for the student.`)) return
    setBusy(true)
    await api(`/admin/users/${id}/plan`, { plan: next, days }).catch(() => {})
    setBusy(false)
    reload()
  }

  async function send(path: string, body: object, question?: string) {
    if (question && !window.confirm(question)) return
    setBusy(true)
    await api(`/admin/users/${id}/${path}`, body).catch(() => window.alert('Could not save. Try again.'))
    setBusy(false)
    reload()
  }
  const moderate = (action: string, question?: string) => send('profile', { action }, question)
  const allow = (what: 'posting' | 'messaging', allowed: boolean, question: string) => send(what, { banned: !allowed }, question)
  const { activity } = data

  return (
    <Page
      title={who(user)}
      hint={`User id ${user.id}`}
      actions={
        <Link to="/admin/users" className={`${ghostButtonClass} inline-flex items-center`}>
          ← All students
        </Link>
      }
    >
      <Stats>
        <Stat label="Plan" value={user.plan.toUpperCase()} sub={user.planUntil && user.plan !== 'free' ? `until ${date(user.planUntil)}` : 'no end date'} />
        <Stat label="Paid in total" value={rub(paid)} sub={`≈ ${usd(paid)}`} />
        <Stat label="Level" value={user.level ?? '—'} sub={`${lessons.length} lessons · ${tests.length} tests passed`} />
        <Stat label="XP" value={num(user.xp)} sub={`streak ${user.streak} · best ${user.longestStreak}`} />
        <Stat label="Last active" value={user.lastActive ? shortDay(user.lastActive) : '—'} sub={`joined ${date(user.createdAt)}`} />
        <Stat label="Review" value={num(data.review.total)} sub={`${num(data.review.due)} due now`} />
      </Stats>

      <Card title="Profile and moderation" hint="What the student chose to tell about themselves, and what you allow them to do. Every change here is written to the admin log.">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex w-24 flex-col items-center gap-2">
            {data.profile.photoVersion ? (
              <a href={`/api/profile/photo/${user.id}?v=${data.profile.photoVersion}`} target="_blank" rel="noreferrer" title="Open the photo at full size">
                <img src={`/api/profile/photo/${user.id}?v=${data.profile.photoVersion}`} alt="" className="h-20 w-20 rounded-full object-cover" />
              </a>
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-400">no photo</span>
            )}
            {data.profile.photoVersion && (
              <>
                {data.profile.photoChecked ? (
                  <Pill tone="green">checked</Pill>
                ) : (
                  <button type="button" className={smallButton} disabled={busy} onClick={() => moderate('approve_photo')}>
                    Photo is fine
                  </button>
                )}
                <button type="button" className={smallButton} disabled={busy} onClick={() => moderate('remove_photo', 'Remove this photo? The student will see their initial instead and can upload another one.')}>
                  Remove photo
                </button>
              </>
            )}
          </div>
          <dl className="grid min-w-64 flex-1 grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
            {(
              [
                ['Name', data.profile.name, 'remove_name', 'Remove this name? Other students will see "Student" until a new name is entered.'],
                ['Age', data.profile.age === null ? null : String(data.profile.age), null, ''],
                ['Gender', data.profile.gender, null, ''],
                ['City', data.profile.city, 'remove_city', 'Remove the city from this profile?'],
                ['Learning for', data.profile.goals.join(', ') || null, null, ''],
                ['Interests', data.profile.interests.join(', ') || null, null, ''],
                ['About', data.profile.bio, 'remove_bio', 'Remove the text this student wrote about themselves?'],
              ] as const
            ).map(([label, value, action, question]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  <span className="break-words">{value ?? '—'}</span>
                  {action && value && (
                    <button type="button" className={smallButton} disabled={busy} onClick={() => moderate(action, question)}>
                      Remove
                    </button>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          <Switch
            label="Visible to other students"
            hint={
              data.profile.hiddenByModerator
                ? 'Hidden by you. The student cannot switch it back on: no name, photo or profile is shown to others, and they are not in practice partners.'
                : data.profile.discoverable
                  ? 'Others can find this student among practice partners and see the name, photo and profile.'
                  : 'The student chose a private page. Switching it on here makes the profile visible again.'
            }
            on={data.profile.discoverable}
            pill={data.profile.hiddenByModerator ? <Pill tone="red">hidden by you</Pill> : data.profile.discoverable ? <Pill tone="green">visible</Pill> : <Pill tone="grey">private (their choice)</Pill>}
            onLabel="Hide the profile"
            offLabel={data.profile.hiddenByModerator ? 'Allow it again' : 'Make visible'}
            busy={busy}
            onChange={(on) => moderate(on ? 'show' : 'hide', on ? 'Make this profile visible to other students?' : 'Hide this profile from other students? The student will not be able to switch it back on.')}
          />
          <Switch
            label="Posts and comments"
            hint={`${num(activity.posts)} posts (${num(activity.postsFlagged)} reported or hidden) · ${num(activity.comments)} comments (${num(activity.commentsFlagged)} reported or hidden)`}
            on={!user.feedBannedAt}
            pill={user.feedBannedAt ? <Pill tone="red">banned {date(user.feedBannedAt)}</Pill> : <Pill tone="green">allowed</Pill>}
            onLabel="Ban from posting"
            offLabel="Allow posting again"
            busy={busy}
            onChange={(on) => allow('posting', on, on ? 'Let this student write posts and comments again?' : 'Stop this student from writing posts and comments? They can still read the feed.')}
          />
          <Switch
            label="Private messages"
            hint={
              <>
                {num(activity.messagesStopped)} messages stopped by the check · {num(activity.complaints)} complaints ({num(activity.complaintsOpen)} open) · blocked by {num(activity.blockedBy)} students ·{' '}
                <Link to={`/admin/messages?user=${user.id}`} className="font-semibold text-violet-700 hover:underline">
                  read their conversations
                </Link>
              </>
            }
            on={!user.dmBannedAt}
            pill={user.dmBannedAt ? <Pill tone="red">banned {date(user.dmBannedAt)}</Pill> : user.dmRulesAt ? <Pill tone="green">allowed</Pill> : <Pill tone="grey">has not accepted the rules yet</Pill>}
            onLabel="Ban from messaging"
            offLabel="Allow messaging again"
            busy={busy}
            onChange={(on) => allow('messaging', on, on ? 'Let this student write private messages again?' : 'Stop this student from writing private messages?')}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Account">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {(
              [
                ['Logs in with', [user.email ? 'email code' : '', user.telegramId ? 'Telegram' : ''].filter(Boolean).join(' + ') || '—'],
                ['Email', user.email ?? '—'],
                ['Telegram', user.telegramId ? <Telegram id={user.telegramId} username={user.telegramUsername} /> : 'not connected'],
                ['Name', user.name ?? '—'],
                [
                  'Private messages',
                  <span key="dm">
                    <Link to={`/admin/messages?user=${user.id}`} className="font-semibold text-violet-700 hover:underline">
                      Read their conversations
                    </Link>
                    {user.dmBannedAt ? ' · banned from messaging' : user.dmRulesAt ? '' : ' · has not accepted the rules yet'}
                  </span>,
                ],
                ['Last login', dateTime(data.devices.last)],
                ['Came from', source],
                ['App language', user.locale],
                ['Timezone', user.timezone ?? '—'],
                ['Reminders', user.reminders ? `on, at ${user.reminderHour}:00` : 'off'],
                ['Notification devices', String(data.pushDevices)],
                ['Logged-in devices', String(data.devices.n)],
                ['Streak freezes', String(user.freezes)],
                ['Agreed to privacy policy', date(user.consentAt)],
                ['Badges', String(data.achievements.length)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="break-all font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Give or remove a plan" hint="For gifts, testers and fixing a payment problem. It is written to the admin log.">
          <div className="flex flex-wrap items-center gap-2">
            <select className={inputClass} value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
              <option value="pro">Pro</option>
              <option value="max">Max</option>
            </select>
            <input className={`${inputClass} w-24`} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} aria-label="Days" />
            <span className="text-sm text-slate-500">days</span>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => setUserPlan(plan)}>
              Give
            </button>
          </div>
          {user.plan !== 'free' && (
            <button type="button" className={`${ghostButtonClass} mt-3`} disabled={busy} onClick={() => setUserPlan('free')}>
              Remove the paid plan
            </button>
          )}
        </Card>
        <Card title="XP per day, last 60 days" hint="A quick picture of how regularly this student studies.">
          {data.usage.length > 0 ? <Bars data={data.usage.map((u) => ({ label: shortDay(u.day), value: u.xp }))} height={110} /> : <p className="text-sm text-slate-400">No activity yet.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Payments">
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Plan</Th>
                <Th right>Amount</Th>
                <Th>Promo</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">{dateTime(p.paidAt ?? p.createdAt)}</Td>
                  <Td>
                    {p.plan} / {p.period}
                  </Td>
                  <Td right>{rub(p.amountRub)}</Td>
                  <Td>{p.promoCode ?? '—'}</Td>
                  <Td>
                    <Pill tone={p.status === 'paid' ? 'green' : p.status === 'canceled' ? 'red' : 'amber'}>{p.status}</Pill>
                  </Td>
                </tr>
              ))}
              {data.payments.length === 0 && (
                <tr>
                  <Td className="text-slate-400">No payments.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
        <Card title="Calls with teachers">
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Teacher</Th>
                <Th>Topic</Th>
                <Th right>Length</Th>
                <Th right>Mistakes</Th>
              </tr>
            </thead>
            <tbody>
              {data.calls.map((call) => (
                <tr key={call.id}>
                  <Td className="whitespace-nowrap">{dateTime(call.startedAt)}</Td>
                  <Td className="capitalize">{call.teacher}</Td>
                  <Td>{call.lessonId ?? call.scenario ?? 'free talk'}</Td>
                  <Td right>{minutes(call.seconds)}</Td>
                  <Td right>{call.corrections ?? '—'}</Td>
                </tr>
              ))}
              {data.calls.length === 0 && (
                <tr>
                  <Td className="text-slate-400">No calls.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
        <Card title="Lessons and tests finished">
          <Table>
            <thead>
              <tr>
                <Th>Lesson</Th>
                <Th right>Best result</Th>
                <Th right>Times</Th>
                <Th>Last time</Th>
              </tr>
            </thead>
            <tbody>
              {data.progress.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono text-xs">{p.id}</Td>
                  <Td right>{p.accuracy}%</Td>
                  <Td right>{p.completions}</Td>
                  <Td className="whitespace-nowrap">{dateTime(p.last)}</Td>
                </tr>
              ))}
              {data.progress.length === 0 && (
                <tr>
                  <Td className="text-slate-400">Nothing finished yet.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
        <Card title="Screens opened lately" hint="The last 60, newest first.">
          <Table>
            <tbody>
              {data.views.map((view, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{dateTime(view.at)}</Td>
                  <Td className="font-mono text-xs">{view.path}</Td>
                  <Td>{view.device ?? ''}</Td>
                </tr>
              ))}
              {data.views.length === 0 && (
                <tr>
                  <Td className="text-slate-400">No visits recorded.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </Page>
  )
}

interface PaymentRow {
  id: string
  userId: string
  email: string | null
  provider: string
  plan: string
  period: string
  amountRub: number
  listRub: number | null
  promoCode: string | null
  status: string
  createdAt: string
  paidAt: string | null
}

export function PaymentsPage() {
  const [status, setStatus] = useState('paid')
  const [page, setPage] = useState(0)
  const { data, failed } = useAdmin<{
    total: number
    page: number
    pageSize: number
    totals: Record<string, number>
    byPlan: { plan: string; period: string; n: number; rub: number }[]
    payments: PaymentRow[]
  }>(`/payments?status=${status}&page=${page}`)
  if (!data) return <Loading failed={failed} />
  const t = data.totals
  return (
    <Page title="Payments" hint="Every purchase. Amounts are what was charged, before the payment service's fee and tax.">
      <Stats>
        <Stat label="Revenue" value={rub(t.revenue)} sub={`≈ ${usd(t.revenue)}`} />
        <Stat label="Paid" value={num(t.paid)} sub={t.paid ? `${rub(Math.round(t.revenue / t.paid))} on average` : undefined} />
        <Stat label="Given as discounts" value={rub(t.discounts)} sub="Through promo codes" />
        <Stat label="Not finished" value={num(t.pending)} sub="Opened the payment page, did not pay" />
        <Stat label="Failed or cancelled" value={num(t.canceled)} />
        <Stat label="Paid of started" value={pct(t.paid, t.paid + t.pending + t.canceled)} />
      </Stats>
      <Card title="What is bought" hint={`Current prices: Pro ${rub(PRICES.pro.month)} / ${rub(PRICES.pro.year)} a year · Max ${rub(PRICES.max.month)} / ${rub(PRICES.max.year)} a year`}>
        <Table>
          <thead>
            <tr>
              <Th>Plan</Th>
              <Th>Term</Th>
              <Th right>Payments</Th>
              <Th right>Revenue</Th>
              <Th right>Share of revenue</Th>
            </tr>
          </thead>
          <tbody>
            {data.byPlan.map((row) => (
              <tr key={row.plan + row.period}>
                <Td>
                  <Pill tone={planTone(row.plan)}>{row.plan}</Pill>
                </Td>
                <Td>{row.period}</Td>
                <Td right>{num(row.n)}</Td>
                <Td right className="font-bold text-slate-900">
                  {rub(row.rub)}
                </Td>
                <Td right>{pct(row.rub, t.revenue)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <div className="mb-3 flex gap-2">
          {['paid', 'pending', 'canceled', 'all'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatus(s)
                setPage(0)
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-bold capitalize ${status === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Student</Th>
              <Th>Plan</Th>
              <Th right>Charged</Th>
              <Th right>List price</Th>
              <Th>Promo</Th>
              <Th>Via</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td className="whitespace-nowrap">{dateTime(p.paidAt ?? p.createdAt)}</Td>
                <Td>
                  <Link to={`/admin/users/${p.userId}`} className="font-semibold text-violet-700 hover:underline">
                    {p.email ?? p.userId.slice(0, 8)}
                  </Link>
                </Td>
                <Td>
                  {p.plan} / {p.period}
                </Td>
                <Td right className="font-bold text-slate-900">
                  {rub(p.amountRub)}
                </Td>
                <Td right>{p.listRub === null ? '—' : rub(p.listRub)}</Td>
                <Td>{p.promoCode ?? '—'}</Td>
                <Td>{p.provider}</Td>
                <Td>
                  <Pill tone={p.status === 'paid' ? 'green' : p.status === 'canceled' ? 'red' : 'amber'}>{p.status}</Pill>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </Card>
    </Page>
  )
}

interface Promo {
  code: string
  percentOff: number
  plan: string | null
  period: string | null
  maxUses: number | null
  usedCount: number
  validUntil: string | null
  active: boolean
  note: string | null
  createdAt: string
  paidUses: number
  revenueRub: number
  discountRub: number
}

const PROMO_ERRORS: Record<string, string> = {
  bad_code: 'The code must be 3–24 characters: Latin letters, digits, - or _.',
  bad_percent: 'The discount must be a whole number from 1 to 100.',
  exists: 'A code with this name already exists.',
}

export function PromosPage() {
  const { data, failed, reload } = useAdmin<{ promos: Promo[] }>('/promos')
  const [form, setForm] = useState({ code: '', percentOff: '20', plan: '', period: '', maxUses: '', validUntil: '', note: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) })

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/admin/promos', {
        code: form.code,
        percentOff: Number(form.percentOff),
        plan: form.plan || null,
        period: form.period || null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : null,
        note: form.note,
      })
      setForm({ ...form, code: '', note: '' })
      reload()
    } catch (err) {
      setError(PROMO_ERRORS[err instanceof ApiError ? err.code : ''] ?? 'Could not create the code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(promo: Promo) {
    await api(`/admin/promos/${promo.code}`, { active: !promo.active }).catch(() => {})
    reload()
  }

  return (
    <Page title="Promo codes" hint="Discount codes for paid plans. Give each partner or campaign its own code to see what it brings. One student can use a code once.">
      <Card title="Create a code">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Code
            <input className={`${inputClass} w-40 uppercase`} placeholder="ANNA20" required {...field('code')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Discount, %
            <input className={`${inputClass} w-24`} type="number" min={1} max={100} required {...field('percentOff')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Plan
            <select className={inputClass} {...field('plan')}>
              <option value="">Any</option>
              <option value="pro">Pro only</option>
              <option value="max">Max only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Term
            <select className={inputClass} {...field('period')}>
              <option value="">Any</option>
              <option value="month">Month only</option>
              <option value="year">Year only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Max uses
            <input className={`${inputClass} w-24`} type="number" min={1} placeholder="no limit" {...field('maxUses')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Valid until
            <input className={inputClass} type="date" {...field('validUntil')} />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold text-slate-500">
            Note (only you see it)
            <input className={inputClass} placeholder="Whose code, which campaign" maxLength={200} {...field('note')} />
          </label>
          <button className={buttonClass} type="submit" disabled={busy}>
            Create
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">A 100% code gives the plan for free without a payment page.</p>
      </Card>

      <Card>
        {!data ? (
          <Loading failed={failed} />
        ) : data.promos.length === 0 ? (
          <p className="text-sm text-slate-400">No promo codes yet. Create the first one above.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th right>Discount</Th>
                <Th>For</Th>
                <Th right>Used</Th>
                <Th right>Revenue</Th>
                <Th right>Discount given</Th>
                <Th>Valid until</Th>
                <Th>Note</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.promos.map((p) => {
                const expired = p.validUntil !== null && new Date(p.validUntil).getTime() < Date.now()
                const usedUp = p.maxUses !== null && p.usedCount >= p.maxUses
                return (
                  <tr key={p.code}>
                    <Td className="font-mono font-bold text-slate-900">{p.code}</Td>
                    <Td right>{p.percentOff}%</Td>
                    <Td>{[p.plan, p.period].filter(Boolean).join(' / ') || 'any plan'}</Td>
                    <Td right>
                      {p.usedCount}
                      {p.maxUses !== null ? ` / ${p.maxUses}` : ''}
                    </Td>
                    <Td right className="font-bold text-slate-900">
                      {rub(p.revenueRub)}
                    </Td>
                    <Td right>{rub(p.discountRub)}</Td>
                    <Td>{date(p.validUntil)}</Td>
                    <Td className="max-w-56 truncate">{p.note ?? ''}</Td>
                    <Td>
                      <Pill tone={!p.active ? 'grey' : expired || usedUp ? 'amber' : 'green'}>{!p.active ? 'off' : expired ? 'expired' : usedUp ? 'used up' : 'active'}</Pill>
                    </Td>
                    <Td right>
                      <button type="button" className={ghostButtonClass} onClick={() => toggle(p)}>
                        {p.active ? 'Switch off' : 'Switch on'}
                      </button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  )
}

interface PhotoRow {
  userId: string
  version: number
  updatedAt: string
  reviewedAt: string | null
  email: string | null
  name: string | null
  bio: string | null
  telegramUsername: string | null
}

/** Every new profile photo, for the owner to look at: keep it, or remove it. */
export function PhotosPage() {
  const [show, setShow] = useState<'new' | 'all'>('new')
  const [page, setPage] = useState(0)
  const { data, failed, reload } = useAdmin<{ total: number; page: number; pageSize: number; waiting: number; photos: PhotoRow[] }>(`/photos?show=${show}&page=${page}`)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(userId: string, action: 'approve' | 'remove' | 'clear_bio') {
    if (action === 'remove' && !window.confirm('Remove this photo? The student will see their initial instead and can upload another one.')) return
    if (action === 'clear_bio' && !window.confirm('Remove the text this student wrote about themselves?')) return
    setBusy(userId)
    await api(`/admin/photos/${userId}`, { action }).catch(() => {})
    setBusy(null)
    reload()
  }

  async function approveAll() {
    if (!data || !window.confirm(`Mark all ${data.photos.length} photos on this page as fine?`)) return
    setBusy('all')
    for (const photo of data.photos.filter((p) => !p.reviewedAt)) await api(`/admin/photos/${photo.userId}`, { action: 'approve' }).catch(() => {})
    setBusy(null)
    reload()
  }

  return (
    <Page
      title="Photos"
      hint="Profile photos students uploaded, with what they wrote about themselves. Today only the student and you can see a photo; check them here before the community opens. A new photo always comes back for checking."
      actions={
        <div className="flex gap-2">
          {(['new', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setShow(s)
                setPage(0)
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-bold ${show === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {s === 'new' ? `To check${data ? ` (${data.waiting})` : ''}` : 'All photos'}
            </button>
          ))}
        </div>
      }
    >
      {!data ? (
        <Loading failed={failed} />
      ) : data.photos.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">{show === 'new' ? 'Nothing to check: every photo has been looked at.' : 'No student has uploaded a photo yet.'}</p>
        </Card>
      ) : (
        <>
          {show === 'new' && (
            <div>
              <button type="button" className={ghostButtonClass} disabled={busy !== null} onClick={approveAll}>
                All on this page are fine
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {data.photos.map((photo) => (
              <div key={photo.userId} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
                <a href={`/api/profile/photo/${photo.userId}?v=${photo.version}`} target="_blank" rel="noreferrer" title="Open the photo at full size">
                  <img src={`/api/profile/photo/${photo.userId}?v=${photo.version}`} alt="" loading="lazy" className="aspect-square w-full rounded-lg bg-slate-100 object-cover" />
                </a>
                <div className="min-w-0">
                  <Link to={`/admin/users/${photo.userId}`} className="block truncate text-sm font-bold text-violet-700 hover:underline">
                    {photo.name ?? photo.email ?? (photo.telegramUsername ? `@${photo.telegramUsername}` : photo.userId.slice(0, 8))}
                  </Link>
                  <p className="truncate text-xs text-slate-500">{photo.email ?? (photo.telegramUsername ? `@${photo.telegramUsername}` : '')}</p>
                  <p className="text-xs text-slate-400">
                    {dateTime(photo.updatedAt)} · {photo.reviewedAt ? <Pill tone="green">checked</Pill> : <Pill tone="amber">new</Pill>}
                  </p>
                </div>
                {photo.bio && <p className="rounded-lg bg-slate-50 p-2 text-xs leading-snug text-slate-700">{photo.bio}</p>}
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {!photo.reviewedAt && (
                    <button type="button" className={`${buttonClass} !h-8 flex-1 !px-2`} disabled={busy !== null} onClick={() => act(photo.userId, 'approve')}>
                      Fine
                    </button>
                  )}
                  <button type="button" className={`${ghostButtonClass} !h-8 flex-1 !px-2`} disabled={busy !== null} onClick={() => act(photo.userId, 'remove')}>
                    Remove
                  </button>
                  {photo.bio && (
                    <button type="button" className={`${ghostButtonClass} !h-8 w-full !px-2`} disabled={busy !== null} onClick={() => act(photo.userId, 'clear_bio')}>
                      Remove the text
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </Page>
  )
}
