// 세션을 새로 시작할지에 대한 판단. 순수 함수라서 테스트에서 바로 부른다.
// ponytail: 고정 임계값 휴리스틱. 실제 사용 패턴을 보고 아래 숫자를 조정한다.
export type AdviceInput = {
  percent: number // 맥락 사용률 0-100
  tokens: number // 맥락 토큰 수
  isCacheCold: boolean // 캐시가 만료돼 다음 메시지에 맥락 전체를 다시 씀
  fiveHour?: number // 요금제 5시간 한도 사용률
}
export type Advice = { level: 0 | 1 | 2 | 3; icon: string; color: string; text: string }

export function advise({ percent, tokens, isCacheCold, fiveHour }: AdviceInput): Advice {
  if (percent >= 80) return red('맥락 80% 이상: /park로 저장하고 새 세션을 권장')
  if (isCacheCold && tokens >= 150_000) return red(`캐시 만료 + 맥락 ${kshort(tokens)}: 다음 메시지가 비싸요, 새 세션을 권장`)
  if (percent >= 60) return orange('맥락 60% 이상: 지금 작업을 마무리하면 새 세션으로')
  if (isCacheCold && tokens >= 80_000) return orange(`캐시 만료: 다음 메시지에 ${kshort(tokens)} 토큰을 다시 써요, 주제가 바뀌면 새 세션`)
  if ((fiveHour ?? 0) >= 80 && tokens >= 100_000) return orange('5시간 한도 80% 이상: 긴 맥락이 한도를 빨리 써요')
  if (percent >= 40) return { level: 1, icon: '🟡', color: 'yellow', text: '아직 괜찮아요, 다른 주제는 새 세션에서' }
  return { level: 0, icon: '🟢', color: 'green', text: '이 세션을 계속 써도 돼요' }
}

const red = (text: string): Advice => ({ level: 3, icon: '🔴', color: 'red', text })
const orange = (text: string): Advice => ({ level: 2, icon: '🟠', color: 'magenta', text })

// 13.4만, 9,800 처럼 한국식으로 줄인다.
export function kshort(n: number) {
  if (n >= 100_000_000) return `${+(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${+(n / 10_000).toFixed(1)}만`
  return n.toLocaleString('en-US')
}

// resetsAt까지 남은 시간: "2시간 13분 후", "13분 후".
export function untilKo(resetsAt: string | undefined, now: number) {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (Number.isNaN(at)) return ''
  const min = Math.max(0, Math.round((at - now) / 60_000))
  if (min >= 24 * 60) return `${Math.floor(min / 1440)}일 ${Math.floor((min % 1440) / 60)}시간 후`
  if (min >= 60) return `${Math.floor(min / 60)}시간 ${min % 60}분 후`
  return `${min}분 후`
}
