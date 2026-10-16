import type { Cents, DateTimeText, PayMethod, Payment } from '../types'
import { compactDate } from '../utils/time'
import { uid } from '../utils/random'
import type { DemoDb } from './schema'

/**
 * 模拟支付通道。现金直接成功；其他方式取 db.sim.nextPayResult，用一次后回到「成功」。
 * 真实通道和查单接口见【待确认-40】。
 */

const TXN_PREFIX: Record<Exclude<PayMethod, 'cash'>, string> = { wechat: 'WX', alipay: 'ZFB', unionpay: 'YL' }

function txnNo(db: DemoDb, method: Exclude<PayMethod, 'cash'>, at: DateTimeText, refund = false): string {
  const key = `txn#${compactDate(at)}`
  const seq = (db.counters[key] ?? 0) + 1
  db.counters[key] = seq
  return `${refund ? 'RF' : ''}${TXN_PREFIX[method]}${at.replace(/\D/g, '')}${String(seq).padStart(5, '0')}`
}

export function charge(
  db: DemoDb,
  method: PayMethod,
  amount: Cents,
  at: DateTimeText,
  cash?: { tendered: Cents },
): Payment {
  if (method === 'cash') {
    const tendered = Math.max(cash?.tendered ?? amount, amount)
    return { id: uid('pay'), method, amount, status: 'success', tendered, change: tendered - amount, createdAt: at, refunded: 0 }
  }
  const outcome = db.sim.nextPayResult
  db.sim.nextPayResult = 'success'
  return {
    id: uid('pay'),
    method,
    amount,
    status: outcome,
    channelTxnNo: outcome === 'success' ? txnNo(db, method, at) : undefined,
    createdAt: at,
    refunded: 0,
  }
}

/** 查单：演示里查一次就拿到通道的最终结果（成功） */
export function query(db: DemoDb, payment: Payment, at: DateTimeText): Payment {
  if (payment.status !== 'pending' || payment.method === 'cash') return payment
  payment.status = 'success'
  payment.channelTxnNo = txnNo(db, payment.method, at)
  payment.queriedAt = at
  return payment
}

/** 原路退款，退款流水也记成 Payment */
export function refund(db: DemoDb, method: PayMethod, amount: Cents, at: DateTimeText): Payment {
  return {
    id: uid('rf'),
    method,
    amount,
    status: 'success',
    channelTxnNo: method === 'cash' ? undefined : txnNo(db, method, at, true),
    createdAt: at,
    refunded: 0,
  }
}
