import { env } from '../env'

/**
 * ЮKassa: the service that takes the money. The student is sent to ЮKassa's own payment page
 * (cards, SBP, SberPay…) and comes back to the app afterwards; card details never touch our server.
 *
 * BILLING_PROVIDER=mock replaces it with a stand-in that "pays" at once, for testing without money.
 */

export type PaymentStatus = 'pending' | 'paid' | 'canceled'

export interface ProviderPayment {
  /** ЮKassa's own id of the payment. */
  id: string
  status: PaymentStatus
  /** Where to send the student to pay. */
  confirmationUrl?: string
  amountRub: number
}

export interface NewPayment {
  /** Our own id of the payment: used to recognise it when the student returns. */
  paymentId: string
  amountRub: number
  description: string
  returnUrl: string
  /** Where the receipt goes, if receipts are switched on. */
  customerEmail?: string | null
}

export type BillingMode = 'yookassa' | 'mock' | 'off'

export function billingMode(): BillingMode {
  if (env.billing.provider === 'mock') return 'mock'
  return env.billing.shopId && env.billing.secretKey ? 'yookassa' : 'off'
}

const API = 'https://api.yookassa.ru/v3'

function toStatus(status: unknown): PaymentStatus {
  if (status === 'succeeded') return 'paid'
  if (status === 'canceled') return 'canceled'
  return 'pending' // "pending" and "waiting_for_capture"
}

async function request(path: string, init: { method: 'GET' | 'POST'; body?: object; idempotenceKey?: string }) {
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.billing.shopId}:${env.billing.secretKey}`).toString('base64')}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.idempotenceKey ? { 'Idempotence-Key': init.idempotenceKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json().catch(() => ({}))) as {
    id?: string
    status?: string
    amount?: { value?: string }
    confirmation?: { confirmation_url?: string }
    description?: string
    code?: string
  }
  if (!res.ok || !data.id) throw new Error(`ЮKassa answered ${res.status}: ${data.code ?? ''} ${data.description ?? ''}`.trim())
  return data
}

/** Starts a payment and returns the page where the student pays. */
export async function createPayment(payment: NewPayment): Promise<ProviderPayment> {
  if (billingMode() === 'mock') {
    return {
      id: `mock-${payment.paymentId}`,
      status: 'pending',
      amountRub: payment.amountRub,
      confirmationUrl: `/api/billing/mock-pay/${payment.paymentId}`,
    }
  }

  const amount = { value: payment.amountRub.toFixed(2), currency: 'RUB' }
  const data = await request('/payments', {
    method: 'POST',
    // The same key for the same payment: a repeated request can never charge twice.
    idempotenceKey: payment.paymentId,
    body: {
      amount,
      capture: true,
      confirmation: { type: 'redirect', return_url: payment.returnUrl },
      description: payment.description.slice(0, 128),
      metadata: { paymentId: payment.paymentId },
      // A receipt is required from companies and sole traders (54-ФЗ), not from the self-employed.
      ...(env.billing.receipts && payment.customerEmail
        ? {
            receipt: {
              customer: { email: payment.customerEmail },
              items: [
                {
                  description: payment.description.slice(0, 128),
                  quantity: '1.00',
                  amount,
                  vat_code: env.billing.vatCode,
                  payment_mode: 'full_payment',
                  payment_subject: 'service',
                },
              ],
            },
          }
        : {}),
    },
  })
  return { id: data.id!, status: toStatus(data.status), confirmationUrl: data.confirmation?.confirmation_url, amountRub: Number(data.amount?.value ?? 0) }
}

/**
 * Asks ЮKassa itself what happened to a payment. Notifications from the internet are never
 * trusted on their own: the plan is switched on only after this answer says "paid".
 */
export async function fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
  const data = await request(`/payments/${encodeURIComponent(providerPaymentId)}`, { method: 'GET' })
  return { id: data.id!, status: toStatus(data.status), amountRub: Number(data.amount?.value ?? 0) }
}
