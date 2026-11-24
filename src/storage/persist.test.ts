import { describe, expect, it } from 'vitest'
import { requestPersistence } from './persist'

describe('保存データを消さないよう求める', () => {
  it('ブラウザに仕組みがなければ unsupported', async () => {
    expect(await requestPersistence(undefined)).toBe('unsupported')
    expect(await requestPersistence({})).toBe('unsupported')
  })

  it('すでに認められていれば、改めて求めない', async () => {
    let asked = 0
    const result = await requestPersistence({ persisted: async () => true, persist: async () => (asked++, true) })
    expect(result).toBe('persisted')
    expect(asked).toBe(0)
  })

  it('まだなら求め、その答えを返す。例外が出ても止まらない', async () => {
    expect(await requestPersistence({ persisted: async () => false, persist: async () => true })).toBe('persisted')
    expect(await requestPersistence({ persisted: async () => false, persist: async () => false })).toBe('not-persisted')
    expect(await requestPersistence({ persist: async () => Promise.reject(new Error('x')) })).toBe('not-persisted')
  })
})
