// 「会話をもう一度」と章末テストの案内で出す、会話の名前

import { findCharacter, findLocation } from '../data'
import type { ConversationEntry } from '../game/conversations/replayList'

/** 会話の名前（例：自宅・이수진（近所の住人）） */
export function conversationName(entry: ConversationEntry): string {
  const character = findCharacter(entry.conversation.character)
  const who = character === undefined ? '' : character.name === undefined ? character.roleJa : `${character.name.korean}（${character.roleJa}）`
  return `${findLocation(entry.conversation.location)?.nameJa ?? entry.conversation.location}・${who}`
}

/** 会話の場所の説明（例：「玄関に出る」の1つ目の会話） */
export function conversationPlace(entry: ConversationEntry): string {
  return `「${entry.event.actionJa}」の${entry.order}つ目の会話`
}
