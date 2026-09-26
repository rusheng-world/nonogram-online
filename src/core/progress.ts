/**
 * 线索自动划线：判断「哪几条线索玩家已经真的做完了」。
 * ============================================================================
 *
 * 判定规则（改之前请先读懂）
 * ---------------------------------------------------------------------------
 *   同一行/列里，第 j 条线索可以被划掉  <=>  下面两条同时成立：
 *
 *   (1) 这一行/列没有涂错的格子
 *       即不存在「解里是白格、玩家却把它涂黑了」的位置。
 *   (2) 解里第 j 段方块（连续黑格）的每一个格子，玩家都已经涂黑。
 *
 * 为什么这样定：
 *   · **永远以「解」为准**，所以不会出现「没找出来却划掉」：
 *     位置涂错了、多涂了一格、少涂了一格，都不会划线。
 *     （早期版本只看「玩家涂的格子能不能摆得下线索」，会出现
 *       「线索 [1]、玩家涂在错误位置却照样划线」这类误判。）
 *   · **逐段判断**而不是整行一起判断，保留进度感：线索 [2,3] 里先把 3 那一段
 *     做对了，就只有「3」被划掉，「2」还得继续找 —— 这正是需求里
 *     「所需格子被找出来，对应的数字就被划掉」的意思。
 *   · 一旦这一行出现涂错的格子，(1) 就不成立，整行的划线会暂时消失：
 *     此时玩家的涂法已经和线索矛盾，继续划线只会误导。改正后自动恢复。
 *   · 空线索 [0] 不划线：否则开局满屏的空白行/列会被立刻全部划掉，反而看不出进度。
 *
 * 顺带：X 标记不影响判定（只比较「涂黑」的格子），和胜负判定保持一致。
 *
 * 复杂度：每条线 O(格数)，20×20 盘面 40 条线合计约 800 次比较，可以每步重算。
 */

import { FILLED } from './types'

/**
 * @param clue     这条线的线索（空行是 [0]）
 * @param board    玩家棋盘（行优先展平，0 未知 / 1 填充 / 2 标记）
 * @param solution 该题的解（行优先展平，0/1）
 * @param length   这条线的格子数（行 = 棋盘宽，列 = 棋盘高）
 * @param step     相邻两格的步长：行 = 1，列 = 棋盘宽度
 * @param offset   第一个格子的下标：行 = y*width，列 = x
 * @returns 与 clue 一一对应的布尔数组，true = 该线索已完成、可以划线
 */
export function computeLineDone(
  clue: readonly number[],
  board: ArrayLike<number>,
  solution: ArrayLike<number>,
  length: number,
  step = 1,
  offset = 0,
): boolean[] {
  const done = clue.map(() => false)
  // 空线索（[0]）：没有方块要找，保持不划线
  if (clue.every((n) => n <= 0)) return done

  // (1) 整条线不能有「涂错」的格子（解里是白、玩家却涂黑）
  for (let i = 0; i < length; i++) {
    const index = offset + i * step
    if (board[index] === FILLED && solution[index] !== 1) return done
  }

  // (2) 逐段核对：解里第 j 段是否已经整段涂黑
  let blockIndex = 0
  let i = 0
  while (i < length) {
    if (solution[offset + i * step] !== 1) {
      i++
      continue
    }
    let end = i
    while (end < length && solution[offset + end * step] === 1) end++
    // solution 与 clue 同源，所以第 blockIndex 段对应的就是第 blockIndex 条线索
    if (blockIndex < done.length) {
      let painted = true
      for (let k = i; k < end; k++) {
        if (board[offset + k * step] !== FILLED) {
          painted = false
          break
        }
      }
      if (painted) done[blockIndex] = true
    }
    blockIndex++
    i = end
  }
  return done
}
