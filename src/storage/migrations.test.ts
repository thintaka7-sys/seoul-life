import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from './migrations'
import { CURRENT_SAVE_VERSION } from './saveData'

describe('migrate', () => {
  it('現在のバージョンなら何もしない', () => {
    expect(migrate({ version: 2, x: 1 }, {}, 2)).toEqual({ ok: true, data: { version: 2, x: 1 }, from: 2 })
  })

  it('順番に1つずつ移行する', () => {
    const calls: number[] = []
    const result = migrate(
      { version: 1 },
      {
        1: (d) => (calls.push(1), { ...d, version: 2 }),
        2: (d) => (calls.push(2), { ...d, version: 3 }),
        3: (d) => (calls.push(3), { ...d, version: 4 }),
      },
      4,
    )
    expect(calls).toEqual([1, 2, 3])
    expect(result).toEqual({ ok: true, data: { version: 4 }, from: 1 })
  })

  it('途中のバージョンからも移行できる', () => {
    const result = migrate({ version: 2 }, { 1: () => ({ version: 2 }), 2: (d) => ({ ...d, version: 3 }) }, 3)
    expect(result).toEqual({ ok: true, data: { version: 3 }, from: 2 })
  })

  it('新しいバージョンは newer_version', () => {
    expect(migrate({ version: 5 }, {}, 3)).toMatchObject({ ok: false, reason: 'newer_version' })
  })

  it.each([{}, { version: 0 }, { version: 1.5 }, { version: '1' }])('version が正しくなければ invalid_shape: %j', (data) => {
    expect(migrate(data, {}, 1)).toMatchObject({ ok: false, reason: 'invalid_shape' })
  })
})

describe('本番の移行表', () => {
  it('v1 から現在のバージョンまで、すべての段階の移行処理がそろっている', () => {
    for (let v = 1; v < CURRENT_SAVE_VERSION; v++) {
      expect(MIGRATIONS[v], `v${v} → v${v + 1}`).toBeTypeOf('function')
    }
  })
})
