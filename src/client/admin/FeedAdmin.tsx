import { useState } from 'react'
import { Link } from 'react-router'
import type { PostBody } from '../../shared/feed'
import { api } from '../lib/api'
import { buttonClass, Card, dateTime, ghostButtonClass, inputClass, Loading, num, Page, Pill, Stat, Stats, Table, Td, Th, useAdmin } from './ui'

interface AdminPost {
  id: string
  kind: string
  body: PostBody
  status: string
  publishAt: string
  writtenBy: string
  hasImage: boolean
  likes: number
  votes: number
  comments: number
  /** For a student's post: who wrote it, and how many reported it. */
  authorId: string | null
  who: string | null
  reports: number
}

interface AdminComment {
  id: string
  postId: string
  userId: string
  who: string
  text: string
  status: string
  reports: number
  createdAt: string
}

interface FeedAdminData {
  writer: string | null
  counts: Record<string, number>
  posts: AdminPost[]
  comments: AdminComment[]
}

const WRITERS: Record<string, string> = { gemini: 'Gemini writes the posts', mock: 'Test stand-in (not a real AI)' }

/** The Talkreal account's posts, waiting and published, and what students write under them. */
export function FeedPage() {
  const [only, setOnly] = useState<'all' | 'reported'>('all')
  const { data, failed, reload } = useAdmin<FeedAdminData>(`/feed?comments=${only}`)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminPost | null>(null)
  const [form, setForm] = useState({ titleRu: '', titleEn: '', textRu: '', textEn: '', english: '' })
  const [note, setNote] = useState<string | null>(null)

  if (!data) return <Loading failed={failed} />
  const now = Date.now()
  const waiting = data.posts.filter((p) => new Date(p.publishAt).getTime() > now).reverse()
  const published = data.posts.filter((p) => new Date(p.publishAt).getTime() <= now)

  async function act(path: string, body: object, key: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(key)
    await api(`/admin/feed/${path}`, body).catch(() => {})
    setBusy(null)
    reload()
  }

  async function fill() {
    setBusy('fill')
    setNote(null)
    const result = await api<{ written: number; failed: number }>('/admin/feed/fill', {}).catch(() => null)
    setNote(result ? `${result.written} post(s) written${result.failed ? `, ${result.failed} could not be written (see the server log)` : ''}.` : 'Could not reach the server.')
    setBusy(null)
    reload()
  }

  async function rewrite() {
    if (!window.confirm('Delete the posts that are still waiting and write them again? Published posts are not touched.')) return
    setBusy('fill')
    setNote(null)
    const result = await api<{ removed: number; written: number; failed: number }>('/admin/feed/rewrite', {}).catch(() => null)
    setNote(result ? `${result.removed} waiting post(s) removed, ${result.written} written${result.failed ? `, ${result.failed} could not be written` : ''}.` : 'Could not reach the server.')
    setBusy(null)
    reload()
  }

  function startEdit(post: AdminPost) {
    setEditing(post)
    setForm({ titleRu: post.body.title.ru, titleEn: post.body.title.en, textRu: post.body.text.ru, textEn: post.body.text.en, english: post.body.english ?? '' })
  }

  async function saveEdit() {
    if (!editing) return
    await act(`posts/${editing.id}`, { action: 'edit', ...form }, editing.id)
    setEditing(null)
  }

  const postRow = (post: AdminPost, upcoming: boolean) => (
    <tr key={post.id} className="align-top">
      <Td className="whitespace-nowrap">{dateTime(post.publishAt)}</Td>
      <Td>
        <Pill tone="violet">{post.kind}</Pill>
        {post.hasImage && <span className="ml-1 text-xs text-slate-400">+ picture</span>}
      </Td>
      <Td className="max-w-md">
        <p className="font-bold text-slate-900">
          {post.body.emoji} {post.body.title.ru}
        </p>
        {post.body.english && <p className="font-semibold text-violet-700">{post.body.english}</p>}
        <p className="text-slate-600">{post.body.text.ru}</p>
        {post.body.options && (
          <p className="mt-1 text-xs text-slate-500">
            {post.body.options.map((option, i) => (
              <span key={option} className={i === post.body.answer ? 'font-bold text-emerald-800' : ''}>
                {i > 0 ? ' · ' : ''}
                {i === post.body.answer ? '✓ ' : ''}
                {option}
              </span>
            ))}
          </p>
        )}
        {post.authorId ? (
          <p className="mt-1 text-xs text-slate-500">
            by{' '}
            <Link to={`/admin/users/${post.authorId}`} className="font-semibold text-violet-700 hover:underline">
              {post.who}
            </Link>
            {post.reports > 0 && (
              <span className="ml-2">
                <Pill tone="amber">{post.reports} report(s)</Pill>
              </span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-400">written by {post.writtenBy}</p>
        )}
      </Td>
      {!upcoming && (
        <Td right className="whitespace-nowrap">
          ♥ {post.likes} · 💬 {post.comments}
          {post.kind === 'poll' ? ` · ${post.votes} answers` : ''}
        </Td>
      )}
      <Td>{post.status === 'hidden' ? <Pill tone="amber">hidden</Pill> : upcoming ? <Pill>waiting</Pill> : <Pill tone="green">live</Pill>}</Td>
      <Td right>
        <div className="flex flex-wrap justify-end gap-1.5">
          {!post.authorId && (
            <button type="button" className={`${ghostButtonClass} !h-8 !px-2`} onClick={() => startEdit(post)}>
              Edit
            </button>
          )}
          {upcoming && (
            <button type="button" className={`${ghostButtonClass} !h-8 !px-2`} disabled={busy !== null} onClick={() => act(`posts/${post.id}`, { action: 'publish_now' }, post.id)}>
              Publish now
            </button>
          )}
          <button
            type="button"
            className={`${ghostButtonClass} !h-8 !px-2`}
            disabled={busy !== null}
            onClick={() => act(`posts/${post.id}`, { action: post.status === 'hidden' ? 'show' : 'hide' }, post.id)}
          >
            {post.status === 'hidden' ? 'Show' : 'Hide'}
          </button>
          <button
            type="button"
            className={`${ghostButtonClass} !h-8 !px-2`}
            disabled={busy !== null}
            onClick={() => act(`posts/${post.id}`, { action: 'delete' }, post.id, 'Delete this post for good? Its likes and comments go with it.')}
          >
            Delete
          </button>
        </div>
      </Td>
    </tr>
  )

  return (
    <Page
      title="Feed"
      hint="The Talkreal account posts once a day at 09:00 Moscow time. Posts are written a week ahead, so you can read, edit or remove any of them before students see it."
      actions={
        <div className="flex gap-2">
          <button type="button" className={ghostButtonClass} disabled={busy !== null || !data.writer} onClick={rewrite}>
            Rewrite the waiting posts
          </button>
          <button type="button" className={buttonClass} disabled={busy !== null || !data.writer} onClick={fill}>
            {busy === 'fill' ? 'Writing…' : 'Write the missing days'}
          </button>
        </div>
      }
    >
      <Stats>
        <Stat label="Writer" value={data.writer ? data.writer[0].toUpperCase() + data.writer.slice(1) : 'None'} sub={data.writer ? WRITERS[data.writer] : 'No AI is configured: posts cannot be written'} />
        <Stat label="Waiting" value={num(waiting.length)} sub="Posts for the coming days" />
        <Stat label="Comments" value={num(data.counts.comments)} sub={`${num(data.counts.writers_7d)} students wrote this week`} />
        <Stat label="Reported" value={num(data.counts.reported)} sub={`${num(data.counts.hidden)} hidden`} />
        <Stat label="Student posts" value={num(data.counts.student_posts)} sub={`${num(data.counts.reported_posts)} reported`} />
        <Stat label="Likes" value={num(data.counts.likes)} />
        <Stat label="Quiz answers" value={num(data.counts.votes)} />
      </Stats>
      {note && <p className="text-sm font-semibold text-slate-600">{note}</p>}

      {editing && (
        <Card title="Edit the post" hint="Both language versions are shown to students, depending on the language of their app.">
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ['titleRu', 'Title, Russian'],
                ['titleEn', 'Title, English'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                {label}
                <input className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </label>
            ))}
            {(
              [
                ['textRu', 'Text, Russian'],
                ['textEn', 'Text, English'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                {label}
                <textarea className={`${inputClass} !h-28 py-2`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </label>
            ))}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500 md:col-span-2">
              The English being taught (shown large)
              <input className={inputClass} value={form.english} onChange={(e) => setForm({ ...form, english: e.target.value })} />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className={buttonClass} onClick={saveEdit}>
              Save
            </button>
            <button type="button" className={ghostButtonClass} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </Card>
      )}

      <Card title="Waiting to be published" hint="Soonest first. Read these: an AI wrote them, and a wrong fact under the official name costs trust.">
        {waiting.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing is waiting. Press "Write the missing days".</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Goes out</Th>
                <Th>Kind</Th>
                <Th>Post</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>{waiting.map((post) => postRow(post, true))}</tbody>
          </Table>
        )}
      </Card>

      <Card title="Published">
        {published.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing has been published yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Went out</Th>
                <Th>Kind</Th>
                <Th>Post</Th>
                <Th right>Reactions</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>{published.map((post) => postRow(post, false))}</tbody>
          </Table>
        )}
      </Card>

      <Card title="Comments" hint="Every comment is read by the AI before it is posted. Three reports from students hide a comment until you decide.">
        <div className="mb-3 flex gap-2">
          {(['all', 'reported'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOnly(value)}
              className={`rounded-md px-3 py-1.5 text-sm font-bold ${only === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {value === 'all' ? 'Latest' : `Reported (${data.counts.reported})`}
            </button>
          ))}
        </div>
        {data.comments.length === 0 ? (
          <p className="text-sm text-slate-400">{only === 'reported' ? 'No reported comments.' : 'No comments yet.'}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Student</Th>
                <Th>Comment</Th>
                <Th right>Reports</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.comments.map((comment) => (
                <tr key={comment.id}>
                  <Td className="whitespace-nowrap">{dateTime(comment.createdAt)}</Td>
                  <Td>
                    <Link to={`/admin/users/${comment.userId}`} className="font-semibold text-violet-700 hover:underline">
                      {comment.who}
                    </Link>
                  </Td>
                  <Td className="max-w-md text-slate-900">{comment.text}</Td>
                  <Td right>{comment.reports > 0 ? <Pill tone="amber">{comment.reports}</Pill> : '0'}</Td>
                  <Td>{comment.status === 'hidden' ? <Pill tone="red">hidden</Pill> : <Pill tone="green">visible</Pill>}</Td>
                  <Td right>
                    <button
                      type="button"
                      className={`${ghostButtonClass} !h-8 !px-2`}
                      disabled={busy !== null}
                      onClick={() => act(`comments/${comment.id}`, { action: comment.status === 'hidden' ? 'show' : 'hide' }, comment.id)}
                    >
                      {comment.status === 'hidden' ? 'Show again' : 'Hide'}
                    </button>
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
