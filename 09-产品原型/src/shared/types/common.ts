/** 金额，单位：分（整数）。展示时再格式化，见 utils/format.ts */
export type Cents = number

/** 北京时间 'YYYY-MM-DD HH:mm:ss' */
export type DateTimeText = string

/** 营业日 'YYYY-MM-DD' */
export type BizDate = string

/** 【待确认】编号，例如 '待确认-04'，说明见 config/pending.ts */
export type PendingId = `待确认-${number}`

/** 中枢对一次回传的处理结果。POS 只记录结果，不自己记账 */
export interface HubSync {
  status: 'accepted' | 'rejected'
  /** 中枢结果单号（演示号，结果单类型见【待确认-01】【待确认-14】） */
  resultNo?: string
  at: DateTimeText
  message?: string
  /** 重复回传被中枢去重的次数 */
  duplicateHits: number
}

export type PayMethod = 'cash' | 'wechat' | 'alipay' | 'unionpay'

export type ByMethod<T = Cents> = Record<PayMethod, T>
