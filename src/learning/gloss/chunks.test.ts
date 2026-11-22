import { describe, expect, it } from 'vitest'
import { findChunkSequence, textChunks } from './chunks'

describe('textChunks', () => {
  it('空白で区切り、前後の句読点を外す', () => {
    expect(textChunks('이름이 뭐예요?')).toEqual(['이름이', '뭐예요'])
    expect(textChunks(' 네, 감사합니다. ')).toEqual(['네', '감사합니다'])
    expect(textChunks('4,500원')).toEqual(['4,500원'])
  })

  it('句読点だけのまとまりは除く', () => {
    expect(textChunks('네 !')).toEqual(['네'])
  })
})

describe('findChunkSequence', () => {
  it('続けて出てくる位置を返す', () => {
    expect(findChunkSequence('이름이 뭐예요?', '뭐예요')).toBe(1)
    expect(findChunkSequence('만나서 반갑습니다.', '만나서 반갑습니다')).toBe(0)
  })

  it('まとまりの一部だけでは一致しない', () => {
    expect(findChunkSequence('이름이 뭐예요?', '이름')).toBe(-1)
    expect(findChunkSequence('안녕히 가세요.', '가세요 안녕히')).toBe(-1)
  })
})
