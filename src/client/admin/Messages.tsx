import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api } from '../lib/api'
import { Card, Loading, Page, Pill, Stat, Stats, Table, Td, Th, dateTime, ghostButtonClass, num, planTone, useAdmin } from './ui'

interface AdminThread {
  id: string
  userA: string
  userB: string
  whoA: string
  whoB: string
  startedBy: string
  status: string
  lastMessageAt: string
  messages: number
  rejected: number
  hidden: number
  reports: number
}

interface AdminReport {
  id: string
  reporterId: string
  aboutId: string
  reporter: string
  about: string
  threadId: string | null
  reason: string
  note: string | null
  createdAt: string
}

interface MessagesData {
  counts: Record<string, number>
  threads: AdminThread[]
  reports: AdminReport[]
}

const REASONS: Record<string, string> = { rude: 'Rudeness or insults', spam: 'Spam or advertising', contacts: 'Asks for contacts or money', unsafe: 'Unsafe behaviour', other: 'Other' }
const FILTERS = [
  ['all', 'All'],
  ['reported', 'Reported'],
  ['flagged', 'With stopped messages'],
] as const

const userLink = 'font-semibold text-violet-700 hover:underline'

/** Private conversations between students: complaints first, then every conversation, newest first. */
export function MessagesPage() {
  const [params, setParams] = useSearchParams()
  const filter = params.get('filter') ?? 'all'
  const user = params.get('user')
  const { data, failed, reload } = useAdmin<MessagesData>(`/messages?filter=${filter}${user ? `&user=${user}` : ''}`)
  const [busy, setBusy] = useState(false)

  if (!data) return <Loading failed={failed} />

  async function resolve(id: string) {
    setBusy(true)
    await api(`/admin/messages/reports/${id}`, {}).catch(() => {})
    setBusy(false)
    reload()
  }

  return (
    <Page
      title="Messages"
      hint="Private conversations between students. Every message is checked by the AI before it is delivered; here you read conversations, deal with complaints and stop people who break the rules. Each conversation you open is written to the admin log."
    >
      <Stats>
        <Stat label="Conversations" value={num(data.counts.threads)} />
        <Stat label="Messages, last 24 h" value={num(data.counts.messagesToday)} />
        <Stat label="Open complaints" value={num(data.counts.openReports)} />
        <Stat label="Stopped by the check, 7 days" value={num(data.counts.rejectedWeek)} />
        <Stat label="Banned from messaging" value={num(data.counts.banned)} />
        <Stat label="Follows" value={num(data.counts.follows)} sub={`${num(data.counts.blocks)} blocks`} />
      </Stats>

      <Card title="Open complaints" hint="A student pressed Report on another student. Open the conversation, decide, then mark the complaint as done.">
        {data.reports.length === 0 ? (
          <p className="text-sm text-slate-500">No open complaints.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>From</Th>
                <Th>About</Th>
                <Th>Reason</Th>
                <Th>Note</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.reports.map((report) => (
                <tr key={report.id}>
                  <Td className="whitespace-nowrap">{dateTime(report.createdAt)}</Td>
                  <Td>
                    <Link to={`/admin/users/${report.reporterId}`} className={userLink}>
                      {report.reporter}
                    </Link>
                  </Td>
                  <Td>
                    <Link to={`/admin/users/${report.aboutId}`} className={userLink}>
                      {report.about}
                    </Link>
                  </Td>
                  <Td>
                    <Pill tone="red">{REASONS[report.reason] ?? report.reason}</Pill>
                  </Td>
                  <Td className="max-w-xs">{report.note ?? '—'}</Td>
                  <Td right>
                    <div className="flex justify-end gap-1.5">
                      {report.threadId && (
                        <Link to={`/admin/messages/${report.threadId}`} className={`${ghostButtonClass} !h-8 !px-2 inline-flex items-center`}>
                          Read conversation
                        </Link>
                      )}
                      <button type="button" className={`${ghostButtonClass} !h-8 !px-2`} disabled={busy} onClick={() => resolve(report.id)}>
                        Done
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={user ? 'Conversations of one student' : 'Conversations'}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setParams({ ...(user ? { user } : {}), ...(value === 'all' ? {} : { filter: value }) })}
              className={`${ghostButtonClass} !h-8 ${filter === value ? '!border-slate-900 !bg-slate-900 !text-white' : ''}`}
            >
              {label}
            </button>
          ))}
          {user && (
            <button type="button" onClick={() => setParams(filter === 'all' ? {} : { filter })} className="text-sm font-semibold text-violet-700 hover:underline">
              Show all students
            </button>
          )}
        </div>
        {data.threads.length === 0 ? (
          <p className="text-sm text-slate-500">No conversations here.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Last message</Th>
                <Th>Between</Th>
                <Th>State</Th>
                <Th right>Messages</Th>
                <Th>Flags</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.threads.map((thread) => (
                <tr key={thread.id}>
                  <Td className="whitespace-nowrap">{dateTime(thread.lastMessageAt)}</Td>
                  <Td>
                    <Link to={`/admin/users/${thread.userA}`} className={userLink}>
                      {thread.whoA}
                    </Link>
                    <span className="mx-1.5 text-slate-400">↔</span>
                    <Link to={`/admin/users/${thread.userB}`} className={userLink}>
                      {thread.whoB}
                    </Link>
                  </Td>
                  <Td>
                    <Pill tone={thread.status === 'open' ? 'green' : thread.status === 'declined' ? 'grey' : 'amber'}>{thread.status === 'request' ? 'request, not answered' : thread.status}</Pill>
                  </Td>
                  <Td right>{num(thread.messages)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {thread.reports > 0 && <Pill tone="red">{thread.reports} complaint(s)</Pill>}
                      {thread.rejected > 0 && <Pill tone="amber">{thread.rejected} stopped</Pill>}
                      {thread.hidden > 0 && <Pill>{thread.hidden} hidden</Pill>}
                    </div>
                  </Td>
                  <Td right>
                    <Link to={`/admin/messages/${thread.id}`} className={`${ghostButtonClass} !h-8 !px-2 inline-flex items-center`}>
                      Read
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  )
}

interface ConversationData {
  thread: { id: string; status: string; startedBy: string; createdAt: string }
  people: { id: string; who: string; plan: string; level: string | null; banned: boolean }[]
  messages: { id: string; senderId: string; text: string; better: string | null; status: string; createdAt: string }[]
  reports: { id: string; reporter: string; aboutId: string; reason: string; note: string | null; createdAt: string; resolvedAt: string | null }[]
}

/** One whole conversation, as the two students see it plus what the check stopped. */
export function ConversationPage() {
  const { id = '' } = useParams()
  const { data, failed, reload } = useAdmin<ConversationData>(`/messages/${id}`)
  const [busy, setBusy] = useState(false)

  if (!data) return <Loading failed={failed} />
  const first = data.people[0]?.id

  async function act(path: string, body: object, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    await api(`/admin/${path}`, body).catch(() => {})
    setBusy(false)
    reload()
  }

  return (
    <Page
      title="Conversation"
      hint={`Started ${dateTime(data.thread.createdAt)} · ${data.thread.status === 'request' ? 'a request that was not answered' : data.thread.status}. Opening this page was written to the admin log.`}
      actions={
        <Link to="/admin/messages" className={`${ghostButtonClass} inline-flex items-center`}>
          ← All conversations
        </Link>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {data.people.map((person) => (
          <Card key={person.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${person.id === first ? 'bg-violet-500' : 'bg-emerald-500'}`} />
              <Link to={`/admin/users/${person.id}`} className={`${userLink} text-base`}>
                {person.who}
              </Link>
              <Pill tone={planTone(person.plan)}>{person.plan}</Pill>
              {person.level && <Pill>{person.level}</Pill>}
              {person.id === data.thread.startedBy && <Pill>wrote first</Pill>}
              {person.banned && <Pill tone="red">banned from messaging</Pill>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={`${ghostButtonClass} !h-8`}
                disabled={busy}
                onClick={() =>
                  act(
                    `users/${person.id}/messaging`,
                    { banned: !person.banned },
                    person.banned ? undefined : `Stop ${person.who} from writing private messages? They will still be able to read and to use the rest of the app.`,
                  )
                }
              >
                {person.banned ? 'Allow messaging again' : 'Ban from messaging'}
              </button>
              <Link to={`/admin/messages?user=${person.id}`} className={`${ghostButtonClass} !h-8 inline-flex items-center`}>
                Their other conversations
              </Link>
            </div>
          </Card>
        ))}
      </div>

      {data.reports.length > 0 && (
        <Card title="Complaints about this conversation">
          <ul className="flex flex-col gap-2 text-sm">
            {data.reports.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">{dateTime(report.createdAt)}</span>
                <span className="font-semibold">{report.reporter}</span>
                <Pill tone="red">{REASONS[report.reason] ?? report.reason}</Pill>
                {report.note && <span>“{report.note}”</span>}
                {report.resolvedAt ? (
                  <Pill tone="green">done</Pill>
                ) : (
                  <button type="button" className={`${ghostButtonClass} !h-7 !px-2`} disabled={busy} onClick={() => act(`messages/reports/${report.id}`, {})}>
                    Mark as done
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`${data.messages.length} messages`}>
        <ol className="flex flex-col gap-2">
          {data.messages.map((message) => {
            const mine = message.senderId === first
            const who = data.people.find((p) => p.id === message.senderId)?.who ?? 'deleted account'
            return (
              <li key={message.id} className={`flex max-w-2xl flex-col gap-1 ${mine ? 'self-start' : 'self-end items-end'}`}>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={`h-2 w-2 rounded-full ${mine ? 'bg-violet-500' : 'bg-emerald-500'}`} />
                  <span className="font-semibold">{who}</span>
                  {dateTime(message.createdAt)}
                  {message.status === 'rejected' && <Pill tone="amber">stopped by the check, not delivered</Pill>}
                  {message.status === 'hidden' && <Pill tone="red">hidden by you</Pill>}
                </span>
                <p
                  className={`whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm ${
                    message.status === 'rejected' ? 'border border-dashed border-amber-400 bg-amber-50 text-amber-900' : message.status === 'hidden' ? 'bg-slate-200 text-slate-500 line-through' : mine ? 'bg-violet-100 text-slate-900' : 'bg-emerald-100 text-slate-900'
                  }`}
                >
                  {message.text}
                </p>
                {message.status !== 'rejected' && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-500 hover:underline"
                    disabled={busy}
                    onClick={() => act(`messages/message/${message.id}`, { action: message.status === 'hidden' ? 'show' : 'hide' })}
                  >
                    {message.status === 'hidden' ? 'Show again' : 'Hide from both students'}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
        {data.messages.length === 0 && <p className="text-sm text-slate-500">No messages.</p>}
      </Card>
    </Page>
  )
}
