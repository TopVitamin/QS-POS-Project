/**
 * 三个端和演示入口的关键页面截图，输出到 screenshots/（不进 git）。
 *
 * 先启动 npm run dev（或 npm run build && npm run preview -- --port 5173），再运行 npm run screenshots。
 * BASE_URL 默认 http://localhost:5173；CHROME_PATH 不填时用本机安装的 Chrome。
 *
 * 截图前清空浏览器里的演示库，按当天种子重新生成。收银端和管理端在同一个浏览器上下文里操作，
 * 收银端刚做的单在管理端能直接看到；移动端要手机尺寸和触屏，单开一个上下文，拷入同一份演示库。
 * 演示库按北京时间的营业日生成，跨零点运行会中途重置，避开零点前后。
 */
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url))
const DB_KEY = 'qs-pos-demo'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  args: ['--no-sandbox'],
})
const env = { timezoneId: 'Asia/Shanghai', locale: 'zh-CN' }

const problems = []
const failures = []
function watch(page) {
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && problems.push(`[console] ${m.text().slice(0, 200)}`))
  return page
}

async function step(name, fn) {
  try {
    await fn()
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n')[0]}`)
    console.log('FAIL', name, e.message.split('\n')[0])
  }
}

/** 关掉通知、等提示消失和过渡结束再截，避免残留的提示和半透明的按钮 */
async function settle(page, ms = 400) {
  await page.waitForLoadState('networkidle').catch(() => {})
  for (const close of await page.locator('.n-notification .n-base-close').all()) await close.click().catch(() => {})
  await page
    .waitForFunction(
      () =>
        !document.querySelector('.n-message, .n-notification') &&
        ![...document.querySelectorAll('.van-toast')].some((el) => getComputedStyle(el).display !== 'none'),
      null,
      { timeout: 6000 },
    )
    .catch(() => {})
  await page.waitForTimeout(ms)
}

const blur = (page) => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())

async function shot(page, name, { fullPage = false } = {}) {
  await settle(page)
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage, animations: 'disabled' })
  console.log('OK  ', name)
}

const readDb = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), DB_KEY)
const tapDigits = async (page, digits) => {
  for (const k of digits) await page.getByRole('button', { name: k, exact: true }).first().click()
}

// ---------- 演示入口 ----------
const desk = await browser.newContext({ ...env, viewport: { width: 1440, height: 900 } })
const portal = watch(await desk.newPage())
await portal.goto(`${BASE}/index.html`)
await portal.evaluate(() => localStorage.clear())
await portal.reload()
await step('portal', async () => {
  await portal.getByText('演示账号').first().waitFor()
  await shot(portal, 'portal_overview', { fullPage: true })
})

// ---------- 收银端：QS1001 王海在02号收银台开新班 ----------
const cashier = watch(await desk.newPage())
await cashier.setViewportSize({ width: 1366, height: 768 })
const toCashier = async (hash) => {
  await cashier.goto(`${BASE}/cashier.html#/${hash}`)
  await settle(cashier, 300)
}

await step('cashier login', async () => {
  await toCashier('login')
  await shot(cashier, 'cashier_01_login')
  await cashier.getByRole('button', { name: /02号收银台/ }).click()
  await cashier.getByRole('button', { name: /QS1001/ }).click()
  await tapDigits(cashier, '1234')
  await cashier.getByRole('button', { name: '登录', exact: true }).click()
  await cashier.getByText('王海 开班').waitFor({ timeout: 4000 })
  await cashier.getByRole('button', { name: '¥500', exact: true }).click()
  await shot(cashier, 'cashier_02_open_shift')
  await cashier.getByRole('button', { name: '开班', exact: true }).click()
  await cashier.waitForURL(/#\/sale/, { timeout: 5000 })
})

await step('cashier sale', async () => {
  const cards = cashier.locator('section .grid > button')
  await cards.first().waitFor()
  await cards.nth(0).click()
  await cards.nth(2).click()
  await cards.nth(2).click()
  const db = await readDb(cashier)
  const holder = db.members.find((m) => m.storeId === 's01' && m.coupons.some((c) => c.status === 'unused'))
  if (!holder) throw new Error('万象天地店没有还有可用券的会员')
  const couponName = db.couponTemplates.find((t) => t.id === holder.coupons.find((c) => c.status === 'unused').templateId).name
  await cashier.getByRole('button', { name: /识别会员/ }).click()
  const modal = cashier.locator('.n-modal')
  await modal.getByRole('button', { name: holder.phone, exact: true }).click()
  await modal.getByRole('button', { name: '识别', exact: true }).click()
  await modal.getByRole('button', { name: new RegExp(couponName) }).click()
  await modal.getByRole('button', { name: '使用这位会员' }).click()
  await cashier.locator('aside').getByText(couponName).first().waitFor({ timeout: 3000 })
  await shot(cashier, 'cashier_03_sale_member_promotions')
})

await step('cashier pay split', async () => {
  await cashier.getByRole('button', { name: /结算/ }).last().click()
  await cashier.waitForURL(/#\/pay/, { timeout: 5000 })
  await settle(cashier, 300)
  await cashier.getByRole('button', { name: /微信/ }).first().click()
  await cashier.getByRole('button', { name: '清空', exact: true }).click()
  await tapDigits(cashier, '200')
  await cashier.getByRole('button', { name: '确认收款' }).click()
  await cashier.locator('text=本单支付流水').locator('xpath=../..').getByText('成功').first().waitFor({ timeout: 4000 })
  await shot(cashier, 'cashier_04_pay_split')
  await cashier.getByRole('button', { name: /现金/ }).first().click()
  await cashier.getByRole('button', { name: '确认收款' }).click()
  await cashier.waitForURL(/#\/done/, { timeout: 6000 })
  await shot(cashier, 'cashier_05_done_receipt')
})

await step('cashier pickup', async () => {
  await toCashier('pickup')
  await cashier.getByRole('button', { name: /820145/ }).click()
  await cashier.getByText('中枢核验通过').waitFor({ timeout: 4000 })
  await shot(cashier, 'cashier_06_pickup_verified')
  await cashier.getByText('已当面核对商品和数量').click()
  await cashier.getByRole('button', { name: /确认核销/ }).click()
  await cashier.getByText('核销成功').waitFor({ timeout: 4000 })
  await cashier.getByRole('button', { name: '继续核销' }).click()
  await cashier.getByRole('button', { name: /559302/ }).click()
  await cashier.getByText(/核销被拒/).first().waitFor({ timeout: 4000 })
  await shot(cashier, 'cashier_07_pickup_rejected')
})

await step('cashier agent order', async () => {
  await cashier.getByRole('button', { name: /转代客下单/ }).click()
  await cashier.waitForURL(/#\/agent/, { timeout: 4000 })
  await cashier.getByPlaceholder('顾客姓名').fill('演示顾客')
  await cashier.getByPlaceholder('11位手机号').fill('13900139001')
  await cashier.getByPlaceholder('省市区和详细地址').fill('广东省深圳市南山区演示路1号')
  await blur(cashier)
  await shot(cashier, 'cashier_08_agent_order_form')
  await cashier.getByRole('button', { name: /提交中央OMS/ }).click()
  await cashier.locator('aside').last().getByText('559***').first().waitFor({ timeout: 4000 })
  await shot(cashier, 'cashier_09_agent_order_submitted')
})

await step('cashier return', async () => {
  await toCashier('return')
  await cashier.locator('section').first().locator('.qs-scroll button').first().click()
  await cashier.getByRole('button', { name: '全退' }).first().click()
  await cashier.getByRole('button', { name: '不想要了' }).click()
  await shot(cashier, 'cashier_10_return')
  await cashier.getByRole('button', { name: /确认退货退款/ }).click()
  await cashier.getByText('退货完成，已按原支付方式退款').waitFor({ timeout: 4000 })
})

await step('cashier orders', async () => {
  await toCashier('orders')
  await cashier.locator('.qs-card .qs-scroll button').first().click()
  await cashier.locator('.n-drawer').waitFor()
  await shot(cashier, 'cashier_11_orders_detail')
  await cashier.keyboard.press('Escape')
})

await step('cashier handover', async () => {
  await toCashier('handover')
  const expected = await cashier.locator('text=应有现金').last().locator('xpath=..').innerText()
  const amount = (expected.match(/¥([\d,]+\.\d{2})/)?.[1] ?? '0').replace(/,/g, '')
  await tapDigits(cashier, amount)
  await shot(cashier, 'cashier_12_handover')
})

// ---------- 管理端 ----------
const admin = watch(await desk.newPage())
await admin.setViewportSize({ width: 1440, height: 900 })
async function asAdmin(jobNo, hash) {
  await admin.goto(`${BASE}/admin.html#/${hash}`)
  await admin.evaluate((no) => localStorage.setItem('qs-pos-admin-identity', no), jobNo)
  await admin.reload()
  await admin.locator('.n-layout-content').first().waitFor()
  await settle(admin, 600)
}
const openFirstRow = async () => {
  await admin.locator('.n-data-table-tbody .n-data-table-tr').first().click()
  await admin.locator('.n-drawer').waitFor()
}

let newSaleNo = ''
await step('admin dashboard', async () => {
  await asAdmin('QS9001', 'dashboard')
  await shot(admin, 'admin_01_dashboard')
  const db = await readDb(admin)
  newSaleNo = db.sales.filter((s) => s.cashierJobNo === 'QS1001' && s.registerNo === '02').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.no ?? ''
})
await step('admin sale detail', async () => {
  if (!newSaleNo) throw new Error('收银端没有生成销售单')
  await asAdmin('QS9001', `sales/${newSaleNo}`)
  await shot(admin, 'admin_02_sale_detail')
})
await step('admin pickups', async () => {
  await asAdmin('QS9001', 'pickups')
  await shot(admin, 'admin_03_pickups')
})
await step('admin agent order', async () => {
  await asAdmin('QS9001', 'agent-orders')
  await openFirstRow()
  await shot(admin, 'admin_04_agent_order_detail')
})
await step('admin replenishments', async () => {
  await asAdmin('QS9001', 'replenishments')
  await shot(admin, 'admin_05_replenishments')
})
await step('admin stocktake', async () => {
  await asAdmin('QS1001', 'stocktakes')
  await openFirstRow()
  await shot(admin, 'admin_06_stocktake_detail')
})
await step('admin inventory', async () => {
  await asAdmin('QS9001', 'inventory')
  await shot(admin, 'admin_07_inventory')
})
await step('admin daily close', async () => {
  await asAdmin('QS1001', 'daily-close')
  await shot(admin, 'admin_08_daily_close')
})
await step('admin franchise dues', async () => {
  await asAdmin('JMA002', 'franchise/dues')
  await shot(admin, 'admin_09_franchise_dues')
})
await step('admin settlement', async () => {
  await asAdmin('JMA001', 'franchise/settlements')
  await openFirstRow()
  await shot(admin, 'admin_10_settlement_detail')
})
await step('admin trace', async () => {
  await asAdmin('QS1001', `audit/trace?q=${newSaleNo}`)
  await admin.getByText('关联单据').first().waitFor({ timeout: 4000 })
  await shot(admin, 'admin_11_trace')
})
await step('admin logs', async () => {
  await asAdmin('QS1001', 'audit/logs')
  await shot(admin, 'admin_12_audit_logs')
})
await step('admin roles', async () => {
  await asAdmin('SYS001', 'system/roles')
  await shot(admin, 'admin_13_roles_matrix')
})
await step('admin stores', async () => {
  await asAdmin('SYS001', 'master/stores')
  await shot(admin, 'admin_14_master_stores')
})
await step('admin hub', async () => {
  await asAdmin('QS9001', 'system/hub')
  await shot(admin, 'admin_15_hub_simulator')
})

// ---------- 移动端：拷入同一份演示库 ----------
const dbText = await admin.evaluate((key) => localStorage.getItem(key), DB_KEY)
const phoneCtx = await browser.newContext({ ...env, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await phoneCtx.addInitScript(
  ([key, text]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, text)
  },
  [DB_KEY, dbText],
)
const phone = watch(await phoneCtx.newPage())
async function asMobile(jobNo, hash) {
  await phone.goto(`${BASE}/mobile.html#/${hash}`)
  await phone.evaluate((no) => localStorage.setItem('qs-pos-mobile-identity', no), jobNo)
  await phone.reload()
  await phone.locator('.m-shell').waitFor()
  await settle(phone, 600)
}
const toMobile = async (hash) => {
  await phone.goto(`${BASE}/mobile.html#/${hash}`)
  await settle(phone, 500)
}

await step('mobile home', async () => {
  await asMobile('QS1001', 'home')
  await shot(phone, 'mobile_01_home')
})
await step('mobile pickup', async () => {
  await toMobile('pickup')
  await phone.locator('button:has-text("可核销")').first().click()
  await phone.getByText('中枢核验通过').waitFor({ timeout: 4000 })
  await shot(phone, 'mobile_02_pickup_verified')
})
await step('mobile fulfil', async () => {
  await toMobile('fulfil')
  await shot(phone, 'mobile_03_fulfil')
})
await step('mobile stock', async () => {
  await toMobile('stock')
  await shot(phone, 'mobile_04_stock')
})
await step('mobile replenish', async () => {
  await toMobile('replenish/new')
  await phone.getByRole('button', { name: '选商品' }).click()
  const rows = phone.locator('.van-popup .m-press')
  await rows.first().waitFor()
  await rows.nth(0).click()
  await rows.nth(1).click()
  await phone.getByRole('button', { name: /完成/ }).click()
  await shot(phone, 'mobile_05_replenish_new')
})
await step('mobile receive', async () => {
  const db = await readDb(phone)
  const ship = db.shipments.find((s) => s.storeId === 's01' && s.status === 'in_transit')
  if (!ship) throw new Error('万象天地店没有在途出库单')
  await toMobile(`receive/${ship.outboundNo}`)
  const inputs = phone.locator('input[placeholder="实收"]')
  const n = await inputs.count()
  if (!n) throw new Error('收货页没有实收输入框')
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(String(i === n - 1 ? Math.max(0, ship.lines[i].qty - 1) : ship.lines[i].qty))
  await blur(phone)
  await shot(phone, 'mobile_06_receive')
})
await step('mobile stocktake', async () => {
  await toMobile('stocktake')
  await phone.getByRole('button', { name: '新建盘点' }).click()
  await phone.locator('.van-action-sheet__item:has-text("抽盘")').click()
  const rows = phone.locator('.van-popup .m-press')
  await rows.first().waitFor()
  for (const i of [0, 1, 2]) await rows.nth(i).click()
  await phone.getByRole('button', { name: /完成/ }).click()
  await phone.locator('.van-dialog').waitFor({ timeout: 3000 })
  await phone.locator('.van-dialog__confirm').click()
  await phone.waitForURL(/stocktake\/.+/, { timeout: 4000 })
  await settle(phone, 300)
  const inputs = phone.locator('input[placeholder="实盘"]')
  await inputs.first().waitFor()
  await inputs.nth(0).fill('3')
  await inputs.nth(1).fill('5')
  await blur(phone)
  await shot(phone, 'mobile_07_stocktake_blind')
})
await step('mobile return to warehouse', async () => {
  await toMobile('return-wh')
  await shot(phone, 'mobile_08_return_wh')
})
await step('mobile performance', async () => {
  await toMobile('performance')
  await phone.getByRole('button', { name: '近7天' }).click()
  await phone.getByText('每天的净额归属').waitFor({ timeout: 3000 })
  await shot(phone, 'mobile_09_performance')
})
await step('mobile daily', async () => {
  await toMobile('daily')
  await shot(phone, 'mobile_10_daily')
})
await step('mobile me', async () => {
  await toMobile('me')
  await shot(phone, 'mobile_11_me')
})
await step('mobile franchise daily', async () => {
  await asMobile('JMA101', 'daily')
  await phone.getByRole('button', { name: /昨天/ }).click()
  const due = phone.getByText('加盟应缴营业款').first()
  await due.waitFor({ timeout: 3000 })
  await due.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 110))
  await shot(phone, 'mobile_12_franchise_daily_due')
})

await browser.close()

console.log(`\n截图在 ${OUT}`)
if (problems.length) console.log(`页面报错 ${problems.length} 条：\n${[...new Set(problems)].join('\n')}`)
if (failures.length) {
  console.log(`失败 ${failures.length} 步：\n${failures.join('\n')}`)
  process.exitCode = 1
}
