// リスニング問題（GAME_SPEC 4-5）を、覚えた単語・終えた会話・リスニングの文から作る。
// - word：単語を聞いて、その単語を選ぶ（覚えた単語から自動で作る）
// - reply：会話の相手の言葉を聞いて、返事を選ぶ（終えたイベントの会話から自動で作る）
// - sentence：文を聞いて、その文を選ぶ（教材のリスニングの文）

import type { Conversation, GameEvent, ListeningSentence, Vocab } from '../../data/types'
import { shuffle, type Random } from '../hangul/quiz'

export type ListeningKind = 'word' | 'reply' | 'sentence'

export interface ListeningLine {
  korean: string
  pronunciation: string
  japanese: string
}

export interface ListeningQuestion {
  kind: ListeningKind
  /** 記録のキー（listeningKey） */
  key: string
  /** フリガナの表示を決める章 */
  chapter: number
  /** 読み上げる文 */
  audio: ListeningLine
  /** 選択肢（正解を含む。並べ替え済み） */
  options: ListeningLine[]
  /** 正解の選択肢の韓国語（返事の問題では正解が複数のこともある） */
  answers: string[]
}

/** 学習記録のキー（セーブデータの learning.listening） */
export function listeningKey(kind: ListeningKind, id: string): string {
  return `${kind}:${id}`
}

/** 単語の問題の選択肢の数（正解を含む） */
const WORD_OPTIONS = 3

export interface ListeningSources {
  vocabulary: readonly Vocab[]
  conversations: readonly Conversation[]
  events: readonly GameEvent[]
  sentences: readonly ListeningSentence[]
}

export interface ListeningProgress {
  /** 覚えた単語（単語ID → 覚えたときの章） */
  words: Readonly<Record<string, { chapter: number }>>
  completedEvents: readonly string[]
}

function wordQuestions(sources: ListeningSources, progress: ListeningProgress, random: Random): ListeningQuestion[] {
  const learned = sources.vocabulary.filter((v) => progress.words[v.id] !== undefined)
  return learned.flatMap((v) => {
    const sameCategory = learned.filter((o) => o.id !== v.id && o.genre === v.genre && o.korean !== v.korean)
    const others = learned.filter((o) => o.id !== v.id && o.genre !== v.genre && o.korean !== v.korean)
    const picked: Vocab[] = []
    for (const o of [...shuffle(sameCategory, random), ...shuffle(others, random)]) {
      if (picked.length >= WORD_OPTIONS - 1) break
      if (!picked.some((p) => p.korean === o.korean)) picked.push(o)
    }
    if (picked.length === 0) return []
    const line = (x: Vocab): ListeningLine => ({ korean: x.korean, pronunciation: x.pronunciation, japanese: x.japanese })
    return [
      {
        kind: 'word' as const,
        key: listeningKey('word', v.id),
        chapter: progress.words[v.id]?.chapter ?? 1,
        audio: line(v),
        options: shuffle([v, ...picked].map(line), random),
        answers: [v.korean],
      },
    ]
  })
}

function replyQuestions(sources: ListeningSources, progress: ListeningProgress, random: Random): ListeningQuestion[] {
  const done = new Set(progress.completedEvents)
  const conversationIds = new Set(sources.events.filter((e) => done.has(e.id)).flatMap((e) => e.steps.flatMap((s) => (s.type === 'conversation' ? [s.id] : []))))
  return sources.conversations
    .filter((c) => conversationIds.has(c.id))
    .flatMap((c) =>
      c.turns.flatMap((turn, i) => {
        // 相手の最後の台詞を読み上げる（主人公の台詞や、台詞のない往復は使わない）。
        // 選択の往復（正解・不正解を付けない）は問題にしない
        const prompt = turn.lines.findLast((l) => l.speaker === c.character)
        const choices = turn.choices ?? []
        if (prompt === undefined || choices.length < 2 || turn.kind === 'decision') return []
        return [
          {
            kind: 'reply' as const,
            key: listeningKey('reply', `${c.id}#${i}`),
            chapter: c.chapter,
            audio: { korean: prompt.korean, pronunciation: prompt.pronunciation, japanese: prompt.japanese },
            options: shuffle(choices.map((ch) => ({ korean: ch.korean, pronunciation: ch.pronunciation, japanese: ch.japanese })), random),
            answers: choices.filter((ch) => ch.correct).map((ch) => ch.korean),
          },
        ]
      }),
    )
}

function sentenceQuestions(sources: ListeningSources, progress: ListeningProgress, random: Random): ListeningQuestion[] {
  const done = new Set(progress.completedEvents)
  return sources.sentences
    .filter((s) => done.has(s.afterEvent))
    .map((s) => {
      const line: ListeningLine = { korean: s.korean, pronunciation: s.pronunciation, japanese: s.japanese }
      return {
        kind: 'sentence' as const,
        key: listeningKey('sentence', s.id),
        chapter: sources.events.find((e) => e.id === s.afterEvent)?.chapter ?? 1,
        audio: line,
        options: shuffle([line, ...s.distractors], random),
        answers: [s.korean],
      }
    })
}

/** いま出せるリスニング問題（すべて） */
export function listeningCandidates(sources: ListeningSources, progress: ListeningProgress, random: Random): ListeningQuestion[] {
  return [...wordQuestions(sources, progress, random), ...replyQuestions(sources, progress, random), ...sentenceQuestions(sources, progress, random)]
}

/**
 * 1回分の問題を count 問選ぶ。まだ正解していない問題を先に使い、種類がかたよらないように1問ずつ順番に選ぶ。
 * answered は、正解したことのある問題のキー。
 */
export function buildListeningRound(candidates: readonly ListeningQuestion[], answered: ReadonlySet<string>, count: number, random: Random): ListeningQuestion[] {
  const kinds: ListeningKind[] = shuffle(['word', 'reply', 'sentence'], random)
  const groups = new Map<ListeningKind, ListeningQuestion[]>()
  for (const k of kinds) {
    const ofKind = shuffle(
      candidates.filter((q) => q.kind === k),
      random,
    )
    groups.set(k, [...ofKind.filter((q) => !answered.has(q.key)), ...ofKind.filter((q) => answered.has(q.key))])
  }
  const picked: ListeningQuestion[] = []
  while (picked.length < count && kinds.some((k) => (groups.get(k)?.length ?? 0) > 0)) {
    for (const k of kinds) {
      if (picked.length >= count) break
      const q = groups.get(k)?.shift()
      if (q !== undefined) picked.push(q)
    }
  }
  return shuffle(picked, random)
}

export function isListeningCorrect(q: ListeningQuestion, korean: string): boolean {
  return q.answers.includes(korean)
}
