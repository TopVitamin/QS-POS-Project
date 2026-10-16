import type { BizDate, Category, CouponTemplate, Member, Product, Promotion } from '../../types'
import { addDays } from '../../utils/time'

/**
 * 品类沿用公司背景的主营：快充头、数据线、移动电源、GaN充电器；「氮化镓充电套装」来自叙事。
 * SKU 沿用 ERP 商品编码（《6.编码规则》），背景没给格式，这里的 SKU 和分类编码都是占位码。
 * 具体商品、规格、价格都是演示数据。
 */
export const CATEGORIES: Category[] = [
  { code: '01', name: '充电器', icon: 'i-ph-plug-charging-fill' },
  { code: '0101', name: '氮化镓充电器', parentCode: '01' },
  { code: '010101', name: '单口快充', parentCode: '0101' },
  { code: '010102', name: '多口快充', parentCode: '0101' },
  { code: '0102', name: '车载充电器', parentCode: '01' },
  { code: '010201', name: '车载快充', parentCode: '0102' },
  { code: '02', name: '数据线', icon: 'i-ph-usb-fill' },
  { code: '0201', name: '快充数据线', parentCode: '02' },
  { code: '020101', name: 'C to C', parentCode: '0201' },
  { code: '020102', name: 'C to Lightning', parentCode: '0201' },
  { code: '020103', name: '多头线', parentCode: '0201' },
  { code: '03', name: '移动电源', icon: 'i-ph-battery-charging-vertical-fill' },
  { code: '0301', name: '磁吸移动电源', parentCode: '03' },
  { code: '030101', name: '磁吸', parentCode: '0301' },
  { code: '0302', name: '大容量移动电源', parentCode: '03' },
  { code: '030201', name: '大容量', parentCode: '0302' },
  { code: '04', name: '套装与无线充', icon: 'i-ph-broadcast-fill' },
  { code: '0401', name: '充电套装', parentCode: '04' },
  { code: '040101', name: '氮化镓充电套装', parentCode: '0401' },
  { code: '0402', name: '无线充电', parentCode: '04' },
  { code: '040201', name: '无线充电器', parentCode: '0402' },
]

/** 店内流通码（20开头），保证不会撞上真实商品条码 */
function ean13(seq: number): string {
  const body = `200100${String(seq).padStart(6, '0')}`
  const sum = body.split('').reduce((s, ch, i) => s + Number(ch) * (i % 2 === 0 ? 1 : 3), 0)
  return body + String((10 - (sum % 10)) % 10)
}

const TONES = { charger: '#0B7A6E', cable: '#2563EB', power: '#D97706', kit: '#7C3AED', car: '#475569', wireless: '#DB2777' }

type Raw = [sku: string, name: string, spec: string, price: number, sn: boolean, tone: string]

const RAW: Raw[] = [
  ['SP0101010001', '30W 氮化镓快充头', '单口 USB-C · 白', 9900, false, TONES.charger],
  ['SP0101010002', '35W 双C快充头', '双口 USB-C · 白', 12900, false, TONES.charger],
  ['SP0101020001', '65W 氮化镓三口快充', '2C1A · 折叠插脚', 19900, false, TONES.charger],
  ['SP0101020002', '100W 氮化镓四口桌面充', '3C1A · 带1.5m电源线', 39900, true, TONES.charger],
  ['SP0101020003', '140W 氮化镓快充', 'PD3.1 · 3C1A', 49900, true, TONES.charger],
  ['SP0102010001', '60W 车载快充', '1C1A · 金属', 12900, false, TONES.car],
  ['SP0201010001', 'C to C 快充线 60W', '1m · 编织', 3900, false, TONES.cable],
  ['SP0201010002', 'C to C 快充线 240W', '2m · 编织', 7900, false, TONES.cable],
  ['SP0201020001', 'C to Lightning 快充线', '1m · MFi', 5900, false, TONES.cable],
  ['SP0201030001', '三合一数据线', '1.2m · C/L/Micro', 6900, false, TONES.cable],
  ['SP0301010001', '磁吸移动电源 5000mAh', '20W · 支架款', 14900, true, TONES.power],
  ['SP0301010002', '磁吸移动电源 10000mAh', '20W · 带屏显', 19900, true, TONES.power],
  ['SP0302010001', '移动电源 20000mAh 65W', '可充笔记本', 25900, true, TONES.power],
  ['SP0302010002', '自带线移动电源 10000mAh', '22.5W · 双线', 12900, false, TONES.power],
  ['SP0401010001', '氮化镓充电套装', '65W快充+C to C线', 23900, false, TONES.kit],
  ['SP0402010001', '三合一无线充电座', '15W · 手机/耳机/手表', 29900, false, TONES.wireless],
  ['SP0402010002', '15W 无线充电板', '超薄 · 带线', 9900, false, TONES.wireless],
]

export const PRODUCTS: Product[] = RAW.map(([sku, name, spec, price, snRequired, tone], i) => ({
  sku,
  name,
  spec,
  categoryCode: sku.slice(2, 8),
  barcodes: [ean13(i + 1)],
  price,
  snRequired,
  status: 'active',
  tone,
}))

/** 促销是演示数据，来源系统见【待确认-46】，类型和叠加规则见【待确认-53】 */
export function buildPromotions(today: BizDate): Promotion[] {
  const start = `${addDays(today, -12)} 00:00:00`
  const end = `${addDays(today, 16)} 23:59:59`
  return [
    {
      id: 'pr1',
      code: 'PROMO-01',
      name: '65W三口快充特价169元',
      type: 'special_price',
      skus: ['SP0101020001'],
      specialPrice: 16900,
      storeIds: 'all',
      startAt: start,
      endAt: end,
      status: 'active',
    },
    {
      id: 'pr2',
      code: 'PROMO-02',
      name: '快充数据线第2件5折',
      type: 'nth_discount',
      categoryPrefixes: ['0201'],
      nth: 2,
      nthRatePercent: 50,
      storeIds: 'all',
      startAt: start,
      endAt: end,
      status: 'active',
    },
    {
      id: 'pr3',
      code: 'PROMO-03',
      name: '全场满300减30',
      type: 'threshold_reduction',
      threshold: 30000,
      reduction: 3000,
      storeIds: 'all',
      startAt: start,
      endAt: end,
      status: 'active',
    },
    {
      id: 'pr4',
      code: 'PROMO-04',
      name: '移动电源满399减50（直营店）',
      type: 'threshold_reduction',
      categoryPrefixes: ['03'],
      threshold: 39900,
      reduction: 5000,
      storeIds: ['s01', 's02'],
      startAt: start,
      endAt: end,
      status: 'active',
    },
    {
      id: 'pr0',
      code: 'PROMO-00',
      name: '无线充电板特价79元（已结束）',
      type: 'special_price',
      skus: ['SP0402010002'],
      specialPrice: 7900,
      storeIds: 'all',
      startAt: `${addDays(today, -40)} 00:00:00`,
      endAt: `${addDays(today, -13)} 23:59:59`,
      status: 'ended',
    },
  ]
}

export const COUPON_TEMPLATES: CouponTemplate[] = [
  { id: 'ct1', name: '满199减20券', threshold: 19900, amount: 2000 },
  { id: 'ct2', name: '10元无门槛券', threshold: 0, amount: 1000 },
]

/** 会员只识别本店（【待确认-37】）。姓名、手机号都是演示数据 */
export function buildMembers(today: BizDate): Member[] {
  const expire = `${addDays(today, 30)} 23:59:59`
  const joined = `${addDays(today, -60)} 15:00:00`
  const m = (id: string, phone: string, name: string, points: number, storeId: string, coupons: string[]): Member => ({
    id,
    phone,
    name,
    level: '会员',
    points,
    storeId,
    joinedAt: joined,
    coupons: coupons.map((templateId, i) => ({ id: `${id}-c${i + 1}`, templateId, status: 'unused', expireAt: expire })),
  })
  return [
    m('m01', '13800138001', '陈晓雯', 1260, 's01', ['ct1', 'ct2']),
    m('m02', '13800138002', '黄志明', 380, 's01', ['ct1']),
    m('m03', '13800138003', '周婉清', 2150, 's01', ['ct2']),
    m('m04', '13800138004', '吴俊杰', 90, 's01', []),
    m('m05', '13800138005', '郑可欣', 640, 's01', ['ct1']),
    m('m06', '13800138006', '许嘉豪', 520, 's03', ['ct1']),
    m('m07', '13800138007', '冯雅琪', 160, 's03', ['ct2']),
  ]
}
