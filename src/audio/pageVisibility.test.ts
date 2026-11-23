import { describe, expect, it } from 'vitest'
import { createVisibilityController } from './pageVisibility'

function setup(initiallyVisible = true) {
  const calls: string[] = []
  const controller = createVisibilityController({ hide: () => calls.push('hide'), show: () => calls.push('show') }, initiallyVisible)
  return { calls, controller }
}

describe('画面が見えなくなったら音を止める（pageVisibility）', () => {
  it('見えなくなったら止め、戻ったら再開する', () => {
    const { calls, controller } = setup()
    controller.update(false)
    expect(controller.isHidden()).toBe(true)
    controller.update(true)
    expect(calls).toEqual(['hide', 'show'])
    expect(controller.isHidden()).toBe(false)
  })

  it('visibilitychange と pagehide が続けて来ても、止めるのは1回だけ', () => {
    const { calls, controller } = setup()
    controller.update(false)
    controller.update(false)
    controller.update(true)
    controller.update(true)
    expect(calls).toEqual(['hide', 'show'])
  })

  it('見えている間のイベント（読み込み直後の pageshow など）では何もしない', () => {
    const { calls, controller } = setup()
    controller.update(true)
    expect(calls).toEqual([])
  })

  it('見えない状態で開いたときは、見えたときに再開する', () => {
    const { calls, controller } = setup(false)
    controller.update(false)
    controller.update(true)
    expect(calls).toEqual(['show'])
  })
})
