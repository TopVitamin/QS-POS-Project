import {
  defineConfig,
  presetIcons,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import { brand, fontFamily, ink, neutral, promo, semantic, shadow, volt } from './src/shared/theme/tokens'

export default defineConfig({
  presets: [
    presetWind3(),
    presetIcons({
      scale: 1.15,
      extraProperties: { display: 'inline-block', 'vertical-align': '-0.15em', 'flex-shrink': '0' },
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  content: {
    // .ts 里的图标类名（菜单、品类图标）也要被扫描到
    pipeline: { include: [/\.(vue|ts|html)($|\?)/] },
  },
  theme: {
    colors: {
      brand,
      ink,
      volt,
      promo,
      ok: semantic.success,
      warn: semantic.warning,
      bad: semantic.error,
      info: semantic.info,
      canvas: neutral.canvas,
      subtle: neutral.subtle,
      line: neutral.line,
      'line-strong': neutral.lineStrong,
      t1: neutral.text1,
      t2: neutral.text2,
      t3: neutral.text3,
    },
    fontFamily: {
      sans: fontFamily.sans,
      num: fontFamily.num,
      mono: fontFamily.mono,
    },
    boxShadow: {
      card: shadow.card,
      pop: shadow.pop,
      volt: shadow.volt,
    },
  },
  shortcuts: {
    'qs-card': 'bg-white rounded-14px border border-line shadow-card',
    'qs-num': 'font-num tabular-nums',
    'qs-flex-center': 'flex items-center justify-center',
  },
})
