import { availableOf, type Demand } from '../domain/rules'
import * as hub from '../mock/hub'
import { inStores, query } from './core'

export interface StockRow {
  storeId: string
  sku: string
  onHand: number
  locked: number
  available: number
  inTransit: number
}

export function list(storeIds?: string[]) {
  return query((db) =>
    db.stock.filter(inStores(storeIds)).map<StockRow>((r) => ({ ...r, available: availableOf(r) })),
  )
}

export function detail(storeId: string, sku: string) {
  return query((db) => {
    const r = db.stock.find((s) => s.storeId === storeId && s.sku === sku) ?? { storeId, sku, onHand: 0, locked: 0, inTransit: 0 }
    return {
      record: { ...r, available: availableOf(r) } as StockRow,
      ledger: db.ledger.filter((l) => l.storeId === storeId && l.sku === sku).reverse(),
      pickups: db.pickups.filter((p) => p.storeId === storeId && p.status === 'pending' && p.lock.status === 'locked' && p.items.some((i) => i.sku === sku)),
      shipments: db.shipments.filter((s) => s.storeId === storeId && s.status === 'in_transit' && s.lines.some((l) => l.sku === sku)),
    }
  })
}

/** 向中枢确认本店可用量 */
export function check(storeId: string, demand: Demand[]) {
  return query((db) => hub.checkAvailability(db, storeId, demand))
}
