import { beforeEach, describe, expect, it } from 'vitest'
import { applyUpdate, getPwaState, installGuide, isIos, markUpdateReady, promptInstall, resetPwaStateForTest, setInstallPrompt, subscribePwa, type InstallPromptEvent } from './pwaState'

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1'
const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15'

describe('ホーム画面への追加の案内', () => {
  it('iPhone と iPad（Mac と名乗るが指で操作できる）を見分ける', () => {
    expect(isIos({ userAgent: iphone, platform: 'iPhone', maxTouchPoints: 5 })).toBe(true)
    expect(isIos({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isIos({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
    expect(isIos({ userAgent: android, platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false)
  })

  it('ホーム画面から開いていれば standalone、iPhone は手順、確認を出せるブラウザはボタン、ほかはメニューから', () => {
    const base = { userAgent: android, platform: 'Linux', maxTouchPoints: 5, canPrompt: false, standalone: false }
    expect(installGuide({ ...base, standalone: true, userAgent: iphone })).toBe('standalone')
    expect(installGuide({ ...base, userAgent: iphone, canPrompt: true })).toBe('ios')
    expect(installGuide({ ...base, canPrompt: true })).toBe('prompt')
    expect(installGuide(base)).toBe('other')
  })
})

describe('新しい版と追加の確認', () => {
  beforeEach(() => resetPwaStateForTest())

  it('新しい版を受け取ったら知らせ、「更新する」で切り替える', () => {
    let notified = 0
    const off = subscribePwa(() => notified++)
    let applied = 0
    expect(getPwaState().updateReady).toBe(false)
    markUpdateReady(() => applied++)
    expect(getPwaState().updateReady).toBe(true)
    expect(notified).toBe(1)
    applyUpdate()
    expect(applied).toBe(1)
    off()
  })

  it('追加の確認は1回だけ出せる。受け入れたかを返す', async () => {
    let shown = 0
    const event = { prompt: async () => void shown++, userChoice: Promise.resolve({ outcome: 'accepted' as const }) } as unknown as InstallPromptEvent
    setInstallPrompt(event)
    expect(getPwaState().canPrompt).toBe(true)
    expect(await promptInstall()).toBe(true)
    expect(shown).toBe(1)
    expect(getPwaState().canPrompt).toBe(false)
    expect(await promptInstall()).toBe(false)
  })
})
