import nodemailer from 'nodemailer'
import { env } from '../env'

type Lang = 'ru' | 'en'

const TEXTS: Record<Lang, { subject: (code: string) => string; body: (code: string) => string }> = {
  ru: {
    subject: (code) => `${code} — код для входа в Talkreal`,
    body: (code) =>
      `Ваш код для входа в Talkreal: ${code}\n\nКод действует 10 минут. Если вы не запрашивали его, просто проигнорируйте это письмо.`,
  },
  en: {
    subject: (code) => `${code} is your Talkreal login code`,
    body: (code) =>
      `Your Talkreal login code: ${code}\n\nThe code is valid for 10 minutes. If you didn't request it, just ignore this email.`,
  },
}

export const emailConfigured = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass && env.smtp.from)

const transport = emailConfigured
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    })
  : null

/** Sends the login code by email. Without SMTP settings it only writes to the server log. */
export async function sendLoginCode(email: string, code: string, lang: Lang): Promise<void> {
  if (!transport) {
    console.log(`[login code] ${email}: ${code} (email sending is not configured)`)
    return
  }
  const t = TEXTS[lang]
  await transport.sendMail({
    from: env.smtp.from,
    to: email,
    subject: t.subject(code),
    text: t.body(code),
  })
}
