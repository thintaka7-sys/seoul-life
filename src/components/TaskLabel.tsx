/** 会話で何を言えばよいか（「言うこと」。GAME_SPEC 4-4） */
export function TaskLabel({ task }: { task: string }) {
  return (
    <p className="task">
      <span className="task__label">言うこと</span>
      <span className="task__text">{task}</span>
    </p>
  )
}
