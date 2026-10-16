/**
 * POS 色板与尺寸。Naive UI、Vant、UnoCSS 都从这里取值，页面不硬编码颜色。
 * 定位：深青做底、闪电黄点睛、暖橙只表示优惠。见《前端设计说明》第七节。
 */
export const brand = {
  50: '#E8F6F4',
  100: '#C9EBE6',
  200: '#97D8CF',
  300: '#5FC0B3',
  400: '#2FA596',
  500: '#0E8F80',
  600: '#0B7A6E',
  700: '#0A6359',
  800: '#0B4F48',
  900: '#0B3F3A',
} as const

export const ink = {
  700: '#18403C',
  800: '#12322F',
  900: '#0C2624',
  950: '#071918',
} as const

export const volt = {
  100: '#FFF6D1',
  300: '#FFE27A',
  400: '#FFD43B',
  500: '#FFC61A',
  600: '#E6A800',
} as const

export const promo = {
  50: '#FEF0EB',
  500: '#F0532A',
  600: '#D9441D',
} as const

export const semantic = {
  success: '#16A34A',
  successSoft: '#E8F7EE',
  warning: '#D97706',
  warningSoft: '#FDF3E3',
  error: '#DC2626',
  errorSoft: '#FDECEC',
  info: '#2563EB',
  infoSoft: '#EAF1FE',
} as const

export const neutral = {
  canvas: '#F3F6F5',
  surface: '#FFFFFF',
  subtle: '#F7FAF9',
  line: '#E2E8E6',
  lineStrong: '#CBD5D2',
  text1: '#10201F',
  text2: '#4A5B59',
  text3: '#7A8A88',
  disabled: '#A7B3B1',
} as const

export const fontFamily = {
  sans: '"PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Micro Hei", system-ui, -apple-system, "Segoe UI", sans-serif',
  num: 'Barlow, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", system-ui, sans-serif',
  mono: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace',
} as const

export const shadow = {
  card: '0 1px 2px rgba(12, 38, 36, 0.04), 0 6px 20px rgba(12, 38, 36, 0.06)',
  pop: '0 10px 32px rgba(12, 38, 36, 0.16)',
  volt: '0 8px 24px rgba(230, 168, 0, 0.35)',
} as const

/** 支付方式的标识色，图表和图标共用 */
export const payColors = {
  cash: '#D97706',
  wechat: '#16A34A',
  alipay: '#2563EB',
  unionpay: '#B91C1C',
} as const
