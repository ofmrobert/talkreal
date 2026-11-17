import nodemailer from 'nodemailer'
import { env } from '../env'

type Lang = 'ru' | 'en'

const TEXTS: Record<Lang, { subject: (code: string) => string; lead: string; note: string }> = {
  ru: {
    subject: (code) => `${code} — код для входа в Talkreal`,
    lead: 'Ваш код для входа в Talkreal:',
    note: 'Код действует 10 минут. Если вы не запрашивали его, просто проигнорируйте это письмо.',
  },
  en: {
    subject: (code) => `${code} is your Talkreal login code`,
    lead: 'Your Talkreal login code:',
    note: "The code is valid for 10 minutes. If you didn't request it, just ignore this email.",
  },
}

function html(code: string, lang: Lang): string {
  const t = TEXTS[lang]
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#FFF8F0;padding:32px 16px">
  <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:24px;padding:32px;text-align:center;color:#1F1B3A">
    <div style="font-size:22px;font-weight:800;color:#FF6B4A">Talkreal</div>
    <p style="font-size:16px;margin:24px 0 12px">${t.lead}</p>
    <div style="font-size:36px;font-weight:800;letter-spacing:8px;background:#FFF8F0;border-radius:16px;padding:16px">${code}</div>
    <p style="font-size:13px;color:#6b6880;margin:24px 0 0;line-height:1.5">${t.note}</p>
  </div>
</div>`
}

const smtpConfigured = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass && env.email.from)
const apiConfigured = Boolean(env.email.resendKey && env.email.from)
export const emailConfigured = apiConfigured || smtpConfigured

const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    })
  : null

/** Sends through the email service's web API (works where mail ports are closed). */
async function sendViaApi(to: string, subject: string, text: string, body: string): Promise<void> {
  const res = await fetch(`${env.email.resendBase}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.email.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.email.from, to: [to], subject, text, html: body }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Email service answered ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

/** Sends the login code by email. With no email service configured it only writes to the server log. */
export async function sendLoginCode(email: string, code: string, lang: Lang): Promise<void> {
  const t = TEXTS[lang]
  const subject = t.subject(code)
  const text = `${t.lead} ${code}\n\n${t.note}`

  if (apiConfigured) return sendViaApi(email, subject, text, html(code, lang))
  if (transport) {
    await transport.sendMail({ from: env.email.from, to: email, subject, text, html: html(code, lang) })
    return
  }
  console.log(`[login code] ${email}: ${code} (email sending is not configured)`)
}
