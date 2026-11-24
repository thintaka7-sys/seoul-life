import { describe, expect, it } from 'vitest'
import type { Reading } from '../../data/types'
import { judgePractice } from '../practice/judge'
import { formatNumber, isFoundAnswer, readingPracticeQuestion, readingQuestionKey } from './reading'

const reading: Reading = {
  id: 'reading_002',
  chapter: 1,
  titleJa: 'お隣さんのメモ',
  style: 'memo',
  lines: [{ korean: '떡 맛있게 드세요.', pronunciation: 'トク マシッケ ドゥセヨ', japanese: 'お餅、おいしく召し上がってください。' }],
  questions: [
    { type: 'choice', questionJa: 'だれが書いた？', choices: [{ textJa: '隣の人', correct: true }, { textJa: '店員', correct: false }] },
    { type: 'number', questionJa: 'いくら？', digits: '5500', explanationJa: '오천오백 원' },
    { type: 'write', questionJa: 'もらったものは？', answers: ['떡'] },
    { type: 'find', questionJa: '「おいしく」を探そう', answer: '맛있게', findIn: 'lines' },
    { type: 'choice', questionJa: '安いのは？', choices: [{ korean: '아메리카노', pronunciation: 'アメリカノ', japanese: 'アメリカーノ', correct: true }, { korean: '치즈케이크', pronunciation: 'チジュケイク', japanese: 'チーズケーキ', correct: false }] },
  ],
  reviewed: false,
}

describe('読み物の問題（GAME_SPEC 4-7）', () => {
  it('選ぶ・数字・書く問題は、復習の問題と同じ形にして判定する', () => {
    const choice = readingPracticeQuestion(reading, 0, Math.random)
    expect(choice?.model).toEqual({ korean: '', pronunciation: null, japanese: '隣の人' })
    expect(choice && judgePractice(choice, '隣の人').correct).toBe(true)
    const num = readingPracticeQuestion(reading, 1, Math.random)
    expect(num?.note).toBe('오천오백 원')
    expect(num && judgePractice(num, '5,500원').correct).toBe(true)
    const write = readingPracticeQuestion(reading, 2, Math.random)
    expect(write && judgePractice(write, '떡').correct).toBe(true)
    const ko = readingPracticeQuestion(reading, 4, Math.random)
    expect(ko?.model.korean).toBe('아메리카노')
    expect(readingPracticeQuestion(reading, 3, Math.random)).toBeNull()
    expect(readingPracticeQuestion(reading, 9, Math.random)).toBeNull()
  })

  it('本文から探す問題は、押したまとまりと答えを句読点をそろえてくらべる', () => {
    expect(isFoundAnswer('맛있게', '맛있게')).toBe(true)
    expect(isFoundAnswer('맛있게', '떡')).toBe(false)
    expect(isFoundAnswer('드세요', '드세요.')).toBe(true)
  })

  it('記録のキーと、値段の区切り', () => {
    expect(readingQuestionKey('reading_002', 3)).toBe('reading_002#3')
    expect(formatNumber('5500')).toBe('5,500')
    expect(formatNumber('3:30')).toBe('3:30')
  })
})
