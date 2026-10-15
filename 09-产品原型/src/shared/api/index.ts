import * as audit from './audit'
import * as dashboard from './dashboard'
import * as franchise from './franchise'
import * as fulfil from './fulfil'
import * as hubsim from './hubsim'
import * as master from './master'
import * as sales from './sales'
import * as shift from './shift'
import * as stock from './stock'
import * as storeops from './storeops'

/** 页面唯一的数据入口。以后换真实接口，只替换这一层 */
export const api = { master, stock, sales, fulfil, storeops, shift, franchise, audit, dashboard, hubsim }

export { ApiError, setLatency } from './core'
export { onDbChange } from '../mock/db'
export type { CartLineDraft, SaleDraft, PaymentRow, SaleFilter } from './sales'
export type { StockRow } from './stock'
export type { JudgeResult } from './fulfil'
export type { TraceNode, TraceResult, TraceTone } from './audit'
