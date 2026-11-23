import { describe, expect, it } from 'vitest'
import { FIGURE_IMAGES } from '../../data/types'
import { BUILT_IN_FIGURES, finalDiagram } from './finalDiagram'

describe('パッチムで止める位置の図', () => {
  it('画面の作りで描く図は、図の絵のキー（10-15）に入っている', () => {
    for (const k of BUILT_IN_FIGURES) expect(FIGURE_IMAGES).toContain(k)
  })

  it('唇を閉じる図だけ、唇のすき間がない', () => {
    const lips = finalDiagram('final_lips')
    const tip = finalDiagram('final_tip')
    expect(lips.lowerTooth.y).toBeLessThan(tip.lowerTooth.y)
    expect(lips.face).not.toContain('L247,128')
    expect(tip.face).toContain('L247,128')
  })
})
