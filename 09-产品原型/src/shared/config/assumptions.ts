import type { PendingId } from '../types'

/**
 * 演示假设：背景没给、原型又必须取一个值才能跑通的地方。
 * 和《前端设计说明》第六节一一对应。假设值不能写回 01 成为规则。
 */
export interface Assumption {
  key: string
  title: string
  value: string
  pending: PendingId[]
}

export const ASSUMPTIONS = {
  promoStacking: {
    key: 'promoStacking',
    title: '促销叠加',
    value: '同一行的特价和第N件折扣取优惠大的一个；整单满减取最优一个；每单最多一张券；改价最后算',
    pending: ['待确认-53', '待确认-46'],
  },
  allocation: {
    key: 'allocation',
    title: '优惠分摊和舍入',
    value: '整单优惠按行金额比例分摊到分，尾差用最大余数法分配',
    pending: ['待确认-53'],
  },
  partialRefund: {
    key: 'partialRefund',
    title: '部分退货应退',
    value: '按该行实付金额乘退货数量比例，退完最后一件时吸收尾差',
    pending: ['待确认-53'],
  },
  refundOrder: {
    key: 'refundOrder',
    title: '组合支付的退款顺序',
    value: '按支付先后倒序原路退',
    pending: ['待确认-08'],
  },
  couponPoints: {
    key: 'couponPoints',
    title: '券和积分',
    value: '券按满额减，每单一张；积分只显示余额，不抵扣也不累计',
    pending: ['待确认-54'],
  },
  memberScope: {
    key: 'memberScope',
    title: '会员范围',
    value: '只能识别本店会员，不跨店共享',
    pending: ['待确认-37'],
  },
  bizDay: {
    key: 'bizDay',
    title: '营业日',
    value: '按自然日切日',
    pending: ['待确认-10'],
  },
  shiftDiff: {
    key: 'shiftDiff',
    title: '交班差异',
    value: '非零差异必须写说明，不设升级阈值',
    pending: ['待确认-10'],
  },
  dailyCloser: {
    key: 'dailyCloser',
    title: '日结执行人',
    value: '店长执行，前置条件是本营业日的班次都已交班',
    pending: ['待确认-55'],
  },
  authorizer: {
    key: 'authorizer',
    title: '授权人',
    value: '本店店长和被授权的总部运营可以授权；不拦截本人授权本人',
    pending: ['待确认-51'],
  },
  stocktakeSales: {
    key: 'stocktakeSales',
    title: '盘点期间',
    value: '不停售，只在页面上提示',
    pending: ['待确认-15'],
  },
  pickupDeadline: {
    key: 'pickupDeadline',
    title: '提货截止',
    value: '不计算截止时间，只展示中枢给出的「已过期」',
    pending: ['待确认-04'],
  },
  agentPayment: {
    key: 'agentPayment',
    title: '代客单收款',
    value: '不在POS收款，只提交和查看履约状态',
    pending: ['待确认-06'],
  },
  carrier: {
    key: 'carrier',
    title: '承运商',
    value: '演示数据只出现叙事里的顺丰',
    pending: ['待确认-47'],
  },
  regionalNodes: {
    key: 'regionalNodes',
    title: '区域仓',
    value: '路由可选的五个区域仓取自阶段5叙事，不代表当前仓网（《12.待对齐事项》A02）；逻辑仓编码是占位码',
    pending: [],
  },
  replenishReview: {
    key: 'replenishReview',
    title: '要货审核',
    value: '在中枢模拟器里审核，调出仓由中枢给出',
    pending: ['待确认-48'],
  },
  transitShortage: {
    key: 'transitShortage',
    title: '在途短少',
    value: '只生成差异单，不判责',
    pending: ['待确认-22'],
  },
  snProducts: {
    key: 'snProducts',
    title: 'SN采集',
    value: '演示商品里部分标成「需采集SN」',
    pending: ['待确认-11'],
  },
  billPrefix: {
    key: 'billPrefix',
    title: '单号前缀',
    value: '用编码规则里的建议前缀，页面标「演示前缀」',
    pending: ['待确认-01'],
  },
  hubResultNo: {
    key: 'hubResultNo',
    title: '中枢结果单号',
    value: '用HUB开头的演示号，不代表ERP单据类型',
    pending: ['待确认-01', '待确认-14'],
  },
  storeRoster: {
    key: 'storeRoster',
    title: '门店名册',
    value: '两家直营、两家加盟，都是演示数据；万象天地店沿用叙事店名；门店编码应沿用上游（《6.编码规则》），原型用DEMO01这类占位码',
    pending: ['待确认-42', '待确认-50'],
  },
  settlementPeriod: {
    key: 'settlementPeriod',
    title: '结算周期',
    value: '演示结算单取今天之前的7个营业日，只为展示版式',
    pending: ['待确认-19'],
  },
} satisfies Record<string, Assumption>

export type AssumptionKey = keyof typeof ASSUMPTIONS
