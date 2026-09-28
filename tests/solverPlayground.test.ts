import { describe, expect, it } from 'vitest'
import { computeClues } from '../src/core/clues'
import { boardSizeFor, generatePuzzle } from '../src/core/generator'
import { createTrace, MAX_TRACE_CELLS, solvePuzzle, type SolvePuzzleRequest } from '../src/core/solver'
import { boardAfter, frameSequence, keyStepIndexes } from '../src/core/solverSteps'
import {
  clueFitsLine,
  parseBulkClues,
  parseClueLine,
  parseClueLines,
  SOLVER_SAMPLE,
  validateSolverInput,
} from '../src/core/solverInput'
import type { Difficulty } from '../src/core/types'

/** 按难度生成一道标准题（尺寸由难度决定） */
function generatedPuzzle(difficulty: Difficulty, seed: string) {
  return generatePuzzle({ ...boardSizeFor(difficulty), difficulty, seed }).puzzle
}

/** 用图案反算线索，得到一个「一定有解」的线索输入 */
function requestFromGrid(grid: number[], width: number, height: number): SolvePuzzleRequest {
  const { rowClues, colClues } = computeClues(Uint8Array.from(grid), width, height)
  return { width, height, rowClues, colClues }
}

function gridOf(solution: Uint8Array): number[] {
  return Array.from(solution)
}

describe('线索文本解析', () => {
  it('接受空格 / 半角逗号 / 全角逗号 / 顿号 / 分号 / 竖线', () => {
    expect(parseClueLine('2 1 1')).toEqual({ clues: [2, 1, 1], error: null })
    expect(parseClueLine('2,1,1').clues).toEqual([2, 1, 1])
    expect(parseClueLine('2，1，1').clues).toEqual([2, 1, 1])
    expect(parseClueLine('2、1').clues).toEqual([2, 1])
    expect(parseClueLine('2；1').clues).toEqual([2, 1])
    expect(parseClueLine('2|1').clues).toEqual([2, 1])
    expect(parseClueLine('  3  ').clues).toEqual([3])
    expect(parseClueLine('2 1 1').clues).toEqual(parseClueLine('2,1,1').clues)
  })

  it('空输入与 0 都表示"这一行/列没有块"', () => {
    expect(parseClueLine('')).toEqual({ clues: [], error: null })
    expect(parseClueLine('   ').clues).toEqual([])
    expect(parseClueLine('0').clues).toEqual([])
    expect(parseClueLine('0 0 0').clues).toEqual([])
    expect(parseClueLine('1 0 2').clues).toEqual([1, 2])
  })

  it('非法字符在解析阶段就被拦下，并指出具体片段', () => {
    const bad = parseClueLine('2 x 1')
    expect(bad.error).toContain('x')
    expect(parseClueLine('-1').error).not.toBeNull()
    expect(parseClueLine('1.5').error).not.toBeNull()
    expect(parseClueLine('a').error).not.toBeNull()
  })

  it('多行文本按行解析，并忽略结尾空行', () => {
    expect(parseClueLines('2 1\n3\n1 1\n')).toEqual({ clues: [[2, 1], [3], [1, 1]], error: null })
    expect(parseClueLines('0\n5').clues).toEqual([[], [5]])
    expect(parseClueLines('1\nzz').error).toContain('第 2 行')
  })

  it('批量格式 rows: / cols: 解析成功（含斜杠分隔）', () => {
    const parsed = parseBulkClues('rows: 2 1 / 3 / 1 1\ncols: 1 1 / 2 / 3')
    expect(parsed.error).toBeNull()
    expect(parsed.rowClues).toEqual([[2, 1], [3], [1, 1]])
    expect(parsed.colClues).toEqual([[1, 1], [2], [3]])
  })

  it('批量格式支持两个标签各带多行内容', () => {
    const parsed = parseBulkClues('rows:\n2 1\n3\n1 1\ncols:\n1 1\n2\n3')
    expect(parsed.rowClues).toEqual([[2, 1], [3], [1, 1]])
    expect(parsed.colClues).toEqual([[1, 1], [2], [3]])
  })

  it('缺少标签时给出可定位的错误', () => {
    expect(parseBulkClues('2 1 / 3').error).toContain('rows')
    expect(parseBulkClues('rows: 1 2').error).toContain('列线索')
  })
})

describe('求解前校验', () => {
  it('行列总数不匹配会被拦下', () => {
    const input = {
      width: 5,
      height: 5,
      rowClues: [[2], [2], [1], [1], []],
      colClues: [[1], [1], [1], [1], [1]],
    }
    const result = validateSolverInput(input)
    expect(result.ok).toBe(false)
    expect(result.totalIssue).toContain('不匹配')
    expect(result.rowSum).toBe(6)
    expect(result.colSum).toBe(5)
  })

  it('线索放不进对应长度会被拦下，并定位到具体那一行', () => {
    const input = {
      width: 5,
      height: 5,
      rowClues: [[], [], [4, 4], [], []],
      colClues: [[1], [1], [1], [1], [1]],
    }
    const result = validateSolverInput(input)
    expect(result.ok).toBe(false)
    expect(result.rowIssues[2]).toContain('放不进')
    expect(result.issues.some((issue) => issue.scope === 'rows' && issue.index === 2)).toBe(true)
  })

  it('尺寸越界与线索条数不一致会被拦下', () => {
    expect(
      validateSolverInput({ width: 4, height: 5, rowClues: [[], [], [], [], []], colClues: [[], [], [], []] })
        .sizeIssue,
    ).not.toBeNull()
    expect(
      validateSolverInput({ width: 60, height: 5, rowClues: [[], [], [], [], []], colClues: [] }).sizeIssue,
    ).not.toBeNull()
    const mismatch = validateSolverInput({
      width: 5,
      height: 5,
      rowClues: [[], [], []],
      colClues: [[], [], [], [], []],
    })
    expect(mismatch.ok).toBe(false)
    expect(mismatch.issues.some((issue) => issue.scope === 'rows' && issue.message.includes('条数'))).toBe(true)
  })

  it('合法输入通过校验', () => {
    // 表单允许的最小尺寸就是 5×5（需求 9.3），所以这里用 5×5 做"合法"样本
    const grid = [1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1]
    const request = requestFromGrid(grid, 5, 5)
    const result = validateSolverInput({
      width: request.width,
      height: request.height,
      rowClues: request.rowClues,
      colClues: request.colClues,
    })
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.rowSum).toBe(result.colSum)
  })

  it('小于 5×5 的尺寸被表单校验拦下（求解器本身支持任意尺寸）', () => {
    const small = validateSolverInput({ width: 4, height: 4, rowClues: [[], [], [], []], colClues: [[], [], [], []] })
    expect(small.ok).toBe(false)
    expect(small.sizeIssue).toContain('最小')
    // 引擎本身不设下限：1×N 也能解
    expect(solvePuzzle({ width: 1, height: 4, rowClues: [[1], [1], [], []], colClues: [[2]] }).status).toBe('unique')
  })

  it('clueFitsLine 覆盖空行、全满行与刚好放得下的边界', () => {
    expect(clueFitsLine([], 5)).toBe(true)
    expect(clueFitsLine([0], 5)).toBe(true)
    expect(clueFitsLine([5], 5)).toBe(true)
    expect(clueFitsLine([3, 3], 5)).toBe(false)
    expect(clueFitsLine([2, 2], 5)).toBe(true)
    expect(clueFitsLine([2, 2], 4)).toBe(false)
  })
})

describe('solvePuzzle 结论', () => {
  it('唯一解：三种尺寸的随机图案都能判定 unique，且解与图案一致', () => {
    const cases: [Difficulty, string][] = [
      ['easy', 'solver-unique-easy'],
      ['medium', 'solver-unique-medium'],
      ['hard', 'solver-unique-hard'],
    ]
    for (const [difficulty, seed] of cases) {
      const puzzle = generatedPuzzle(difficulty, seed)
      const result = solvePuzzle({
        width: puzzle.width,
        height: puzzle.height,
        rowClues: puzzle.rowClues,
        colClues: puzzle.colClues,
      })
      expect(result.status, `${difficulty} / ${seed}`).toBe('unique')
      expect(result.solution).toBeDefined()
      expect(gridOf(result.solution!)).toEqual(gridOf(puzzle.solution))
      expect(result.solutionCount).toBe(1)
    }
  })

  it('唯一解：手写小题（纯传播可解）', () => {
    const result = solvePuzzle(requestFromGrid([1, 1, 1, 0, 0, 0, 1, 1, 1], 3, 3))
    expect(result.status).toBe('unique')
    expect(gridOf(result.solution!)).toEqual([1, 1, 1, 0, 0, 0, 1, 1, 1])
    expect(result.stats.backtrackCount).toBe(0)
  })

  it('多解：三种情形都能判定 multiple，并给出两个不同的解', () => {
    const cases: { name: string; request: SolvePuzzleRequest }[] = [
      { name: '2x2 行列全为 [1]', request: { width: 2, height: 2, rowClues: [[1], [1]], colClues: [[1], [1]] } },
      {
        name: '3x3 行列全为 [1]',
        request: { width: 3, height: 3, rowClues: [[1], [1], [1]], colClues: [[1], [1], [1]] },
      },
      {
        name: '5x5 行列全为 [1]',
        request: { width: 5, height: 5, rowClues: [[1], [1], [1], [1], [1]], colClues: [[1], [1], [1], [1], [1]] },
      },
    ]
    for (const { name, request } of cases) {
      const result = solvePuzzle(request)
      expect(result.status, name).toBe('multiple')
      expect(result.solution, name).toBeDefined()
      expect(result.alternativeSolution, name).toBeDefined()
      expect(gridOf(result.solution!), `${name} 两个解必须不同`).not.toEqual(gridOf(result.alternativeSolution!))
    }
  })

  it('多解：解的个数能被数清，超过上限时标记 capped', () => {
    const three = solvePuzzle({ width: 3, height: 3, rowClues: [[1], [1], [1]], colClues: [[1], [1], [1]] })
    expect(three.solutionCount).toBe(6)
    expect(three.solutionCountCapped).toBe(false)

    const many = solvePuzzle({
      width: 5,
      height: 5,
      rowClues: [[1], [1], [1], [1], [1]],
      colClues: [[1], [1], [1], [1], [1]],
    })
    expect(many.solutionCount).toBe(10)
    expect(many.solutionCountCapped).toBe(true)
  })

  it('无解：三种「局部合法但整体矛盾」的线索都判定 none', () => {
    const cases: { name: string; request: SolvePuzzleRequest }[] = [
      {
        name: '3x3 行列全为 [2]',
        request: { width: 3, height: 3, rowClues: [[2], [2], [2]], colClues: [[2], [2], [2]] },
      },
      {
        name: '4x4 行列全为 [3]',
        request: { width: 4, height: 4, rowClues: [[3], [3], [3], [3]], colClues: [[3], [3], [3], [3]] },
      },
      {
        name: '5x5 行列全为 [4]',
        request: { width: 5, height: 5, rowClues: [[4], [4], [4], [4], [4]], colClues: [[4], [4], [4], [4], [4]] },
      },
    ]
    for (const { name, request } of cases) {
      const result = solvePuzzle(request)
      expect(result.status, name).toBe('none')
      expect(result.solution, name).toBeUndefined()
    }
    // 「无解」不等于「输入非法」：5×5 那组能通过求解前校验，是被求解器算出来才失败的
    const validated = validateSolverInput({
      width: 5,
      height: 5,
      rowClues: [[4], [4], [4], [4], [4]],
      colClues: [[4], [4], [4], [4], [4]],
    })
    expect(validated.ok).toBe(true)
    expect(validated.rowSum).toBe(validated.colSum)
  })

  it('无解时会指出矛盾发生在哪一行/列', () => {
    const result = solvePuzzle({ width: 3, height: 3, rowClues: [[2], [2], [2]], colClues: [[2], [2], [2]] })
    expect(result.status).toBe('none')
    expect(result.contradiction).toBeTruthy()
    expect(result.contradiction).toMatch(/第 \d+ (行|列)线索/)
  })

  it('极端输入：1×N、全满行、全空行都能正确求解', () => {
    const oneByN = solvePuzzle({ width: 1, height: 5, rowClues: [[1], [1], [1], [], []], colClues: [[3]] })
    expect(oneByN.status).toBe('unique')
    expect(gridOf(oneByN.solution!)).toEqual([1, 1, 1, 0, 0])

    const fullRow = solvePuzzle({
      width: 5,
      height: 5,
      rowClues: [[5], [], [], [], []],
      colClues: [[1], [1], [1], [1], [1]],
    })
    expect(fullRow.status).toBe('unique')
    expect(gridOf(fullRow.solution!)).toEqual([
      1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ])

    const allEmpty = solvePuzzle({
      width: 5,
      height: 5,
      rowClues: [[], [], [], [], []],
      colClues: [[], [], [], [], []],
    })
    expect(allEmpty.status).toBe('unique')
    expect(gridOf(allEmpty.solution!).every((v) => v === 0)).toBe(true)
  })

  it('被取消时立刻返回 cancelled，不会继续算', () => {
    const puzzle = generatedPuzzle('expert', 'solver-cancel')
    const result = solvePuzzle(
      { width: puzzle.width, height: puzzle.height, rowClues: puzzle.rowClues, colClues: puzzle.colClues },
      { signal: { aborted: true } },
    )
    expect(result.cancelled).toBe(true)
    expect(result.status).toBe('timeout')
  })
})

describe('推理轨迹', () => {
  it('纯传播的题目：轨迹全是 propagate，最后一步是 done', () => {
    const result = solvePuzzle(requestFromGrid([1, 1, 1, 0, 0, 0, 1, 1, 1], 3, 3))
    expect(result.steps.length).toBeGreaterThan(0)
    expect(result.steps.every((step) => step.type === 'propagate' || step.type === 'done')).toBe(true)
    expect(result.steps[result.steps.length - 1].type).toBe('done')
    expect(result.steps[0].description).toContain('轮')
    expect(result.steps[0].cells![0].reason).toMatch(/第 \d+ (行|列)线索/)
  })

  it('需要假设的题目：轨迹里出现 assume / backtrack，且能折叠回正确答案', () => {
    let found: { steps: number; solution: Uint8Array } | null = null
    for (const seed of ['trace-a', 'trace-b', 'trace-c', 'trace-d', 'trace-e', 'trace-f']) {
      const puzzle = generatedPuzzle('hard', seed)
      const result = solvePuzzle({
        width: puzzle.width,
        height: puzzle.height,
        rowClues: puzzle.rowClues,
        colClues: puzzle.colClues,
      })
      expect(result.status).toBe('unique')
      if (result.steps.some((step) => step.type === 'assume')) {
        found = { steps: result.steps.length, solution: result.solution! }
        expect(result.steps.some((step) => step.type === 'backtrack')).toBe(true)
        // 折叠到最后一步 = 正确解
        const folded = boardAfter(result.steps, puzzle.width * puzzle.height, result.steps.length - 1)
        expect(Array.from(folded, (v) => (v === 1 ? 1 : 0))).toEqual(gridOf(puzzle.solution))
        break
      }
    }
    expect(found, '困难档应当至少有一题需要假设').not.toBeNull()
  })

  it('折叠中间某一时刻的棋盘，不会出现"往回退"之外的意外状态', () => {
    const result = solvePuzzle(requestFromGrid([1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1], 1, 13))
    const size = 13
    const afterFirst = boardAfter(result.steps, size, 0)
    expect(afterFirst.length).toBe(size)
    // 未开始时全为 UNKNOWN
    expect(Array.from(boardAfter(result.steps, size, -1))).toEqual(new Array(size).fill(0))
  })

  it('轨迹很长时 keyStepIndexes 会挑出关键节点', () => {
    const steps = Array.from({ length: 600 }, (_, i) => ({
      type: (i % 3 === 2 ? 'assume' : 'propagate') as 'assume' | 'propagate',
      depth: i % 2,
      description: `step ${i}`,
    }))
    const keys = keyStepIndexes(steps)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.length).toBeLessThan(steps.length)
    expect(keys).toContain(599)
  })

  /**
   * 回归测试：一轮传播确定超过 300 格时，早期的实现给单步的 cells 设了 300 的上限，
   * 多出来的格子被**静默丢弃**，于是逐步演示折叠出来的棋盘缺格、与真实解对不上
   * （20×20 / 50×50 的第一轮几乎必然超过 300 格，所以这个问题在真实使用中很容易撞到）。
   */
  it('大棋盘：一步确定 300 格以上时不会丢格，逐步演示的终局必须等于真实解', () => {
    const diffs: Difficulty[] = ['easy', 'medium', 'hard', 'expert']
    let sawBigStep = false
    for (const difficulty of diffs) {
      for (let i = 0; i < 4; i++) {
        const puzzle = generatedPuzzle(difficulty, `replay-${difficulty}-${i}`)
        const result = solvePuzzle({
          width: puzzle.width,
          height: puzzle.height,
          rowClues: puzzle.rowClues,
          colClues: puzzle.colClues,
        })
        expect(result.status, `${difficulty}-${i}`).toBe('unique')
        for (const step of result.steps) if ((step.cells?.length ?? 0) > 300) sawBigStep = true
        // 步长与描述必须一致（描述里的数字就是本步真正的确定格数）
        for (const step of result.steps) {
          if (step.type !== 'propagate') continue
          const match = /新确定 (\d+) 格/.exec(step.description)
          if (match) expect(step.cells!.length).toBe(Number(match[1]))
        }
        const folded = boardAfter(result.steps, puzzle.width * puzzle.height, result.steps.length - 1)
        expect(
          Array.from(folded, (v) => (v === 1 ? 1 : 0)),
          `${difficulty}-${i}`,
        ).toEqual(gridOf(puzzle.solution))
      }
    }
    expect(sawBigStep, '测试数据里应当包含"一步 300 格以上"的情形').toBe(true)
  })

  it('frameSequence 与逐帧折叠的结果一致（逐步演示用的快照）', () => {
    const puzzle = generatedPuzzle('medium', 'frames-a')
    const result = solvePuzzle({
      width: puzzle.width,
      height: puzzle.height,
      rowClues: puzzle.rowClues,
      colClues: puzzle.colClues,
    })
    const size = puzzle.width * puzzle.height
    const keys = keyStepIndexes(result.steps)
    const frames = frameSequence(result.steps, size, keys)
    expect(frames.length).toBe(keys.length)
    for (let i = 0; i < keys.length; i++) {
      expect(Array.from(frames[i]), `frame ${i}`).toEqual(Array.from(boardAfter(result.steps, size, keys[i])))
    }
    // 最后一帧 = 完整解
    expect(Array.from(frames[frames.length - 1], (v) => (v === 1 ? 1 : 0))).toEqual(gridOf(puzzle.solution))
  })

  it('轨迹格子总量超预算时截断轨迹（不影响求解结论）', () => {
    const trace = createTrace(100, undefined, 10)
    const step = (n: number) => ({
      type: 'propagate' as const,
      depth: 0,
      cells: Array.from({ length: n }, (_, i) => ({ index: i, state: 'filled' as const })),
      description: 'x',
    })
    trace.push(step(8))
    expect(trace.truncated).toBe(false)
    trace.push(step(2))
    expect(trace.truncated).toBe(false)
    trace.push(step(1))
    expect(trace.truncated).toBe(true)
    expect(trace.steps.length).toBe(2)
    expect(trace.cellCount).toBe(10)
    expect(MAX_TRACE_CELLS).toBeGreaterThan(10_000)
  })
})

describe('与游戏谜题的一致性', () => {
  it('内置示例是合法输入，且确实有唯一解（「填示例」按钮不会给出坏例子）', () => {
    const validated = validateSolverInput({
      width: SOLVER_SAMPLE.width,
      height: SOLVER_SAMPLE.height,
      rowClues: SOLVER_SAMPLE.rowClues,
      colClues: SOLVER_SAMPLE.colClues,
    })
    expect(validated.ok).toBe(true)

    const result = solvePuzzle({
      width: SOLVER_SAMPLE.width,
      height: SOLVER_SAMPLE.height,
      rowClues: SOLVER_SAMPLE.rowClues,
      colClues: SOLVER_SAMPLE.colClues,
    })
    expect(result.status).toBe('unique')
    // 示例的 bulk 文本与线索矩阵必须表达同一个题目
    const parsed = parseBulkClues(SOLVER_SAMPLE.bulk)
    expect(parsed.error).toBeNull()
    expect(parsed.rowClues).toEqual(SOLVER_SAMPLE.rowClues)
    expect(parsed.colClues).toEqual(SOLVER_SAMPLE.colClues)
  })

  it('抄下来的线索喂给 solver，结果与游戏原题 solution 完全一致（四档各一题）', () => {
    const seeds: [Difficulty, string][] = [
      ['easy', 'consistency-easy'],
      ['medium', 'consistency-medium'],
      ['hard', 'consistency-hard'],
      ['expert', 'consistency-expert'],
    ]
    for (const [difficulty, seed] of seeds) {
      const puzzle = generatedPuzzle(difficulty, seed)
      const result = solvePuzzle({
        width: puzzle.width,
        height: puzzle.height,
        rowClues: puzzle.rowClues,
        colClues: puzzle.colClues,
      })
      expect(result.status, difficulty).toBe('unique')
      expect(gridOf(result.solution!), difficulty).toEqual(gridOf(puzzle.solution))
      // 线索本身也应当被原样还原（游戏页可以直接用）
      const rebuilt = computeClues(result.solution!, puzzle.width, puzzle.height)
      expect(rebuilt.rowClues).toEqual(puzzle.rowClues)
      expect(rebuilt.colClues).toEqual(puzzle.colClues)
    }
  })
})
