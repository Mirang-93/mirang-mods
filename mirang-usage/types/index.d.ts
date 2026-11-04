export type CacheTtl = '5m' | '1h'
export type UsageReading = { tokens: number; window: number; percent: number }

declare module 'claude-code' {
  interface PluginState {
    'mirang-usage': {
      readings: UsageReading[]
      // 마지막 메인 요청이 끝난 시각(ms); 첫 요청 전에는 null.
      lastRequestAt: number | null
      // 응답이 마지막으로 보여 준 캐시 수명; 캐시에 쓴 응답이 오기 전에는 null.
      detectedTtl: CacheTtl | null
      // 마지막으로 알림을 띄운 판단 단계, 같은 알림을 반복하지 않으려고 둔다.
      notifiedLevel: number
    }
  }
}
