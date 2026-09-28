/**
 * 谜题质量验证 CLI（开发/QA 用，**不进入普通用户界面**）。
 *
 *   pnpm puzzle:qa                      # 四档各生成 100 题并输出报告
 *   pnpm puzzle:qa --count=20           # 每档 20 题
 *   pnpm puzzle:qa --difficulty=hard    # 只测某一档
 *   pnpm puzzle:qa --seed=nightly       # 换一组种子
 *
 * 检查项（任何一项「硬失败」都会让进程以非 0 退出，可直接接进 CI）：
 *   · 唯一解        —— 用求解器从线索独立重解一次，必须恰好 1 个解
 *   · 线索一致      —— 从 solution 重新算线索，必须和 Puzzle 里存的完全一致
 *   · 盘面合法      —— solution 长度 = width * height
 *   · 目标难度达标  —— 生成结果的 matched 比例
 *   · 退化线        —— 全空 / 全满的行列数量统计
 *   · 生成耗时      —— 平均 / 最慢
 */
import { computeClues, cluesEqual } from '../src/core/clues'
import { analyzePuzzle } from '../src/core/difficulty'
import { boardSizeFor, generatePuzzle, qualityMetricsOf } from '../src/core/generator'
import { DIFFICULTIES, DIFFICULTY_META } from '../src/core/types'
import type { Difficulty } from '../src/core/types'

interface Options {
  count: number
  difficulties: Difficulty[]
  seed: string
}

function parseArgs(argv: string[]): Options {
  const get = (name: string): string | null => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : null
  }
  const rawDifficulty = get('difficulty') ?? 'all'
  const difficulties =
    rawDifficulty === 'all'
      ? [...DIFFICULTIES]
      : ([rawDifficulty] as Difficulty[]).filter((d) => DIFFICULTIES.includes(d))
  if (difficulties.length === 0) throw new Error(`未知难度：${rawDifficulty}（可选 all/easy/medium/hard/expert）`)

  const count = Number(get('count') ?? '100')
  if (!Number.isFinite(count) || count <= 0) throw new Error('--count 必须是正整数')

  return { count: Math.floor(count), difficulties, seed: get('seed') ?? 'qa' }
}

interface Report {
  difficulty: Difficulty
  count: number
  unique: number
  cluesOk: number
  matched: number
  validBoard: number
  degenerateTotal: number
  degenerateFree: number
  avgMs: number
  worstMs: number
  avgScore: number
  maxScore: number
}

function runOneDifficulty(difficulty: Difficulty, count: number, seed: string): Report {
  const { width, height } = boardSizeFor(difficulty)
  const report: Report = {
    difficulty,
    count,
    unique: 0,
    cluesOk: 0,
    matched: 0,
    validBoard: 0,
    degenerateTotal: 0,
    degenerateFree: 0,
    avgMs: 0,
    worstMs: 0,
    avgScore: 0,
    maxScore: 0,
  }

  let totalMs = 0
  let totalScore = 0
  for (let i = 0; i < count; i++) {
    const result = generatePuzzle({ width, height, difficulty, seed: `${seed}-${difficulty}-${i}` })
    const { puzzle } = result

    totalMs += result.elapsedMs
    report.worstMs = Math.max(report.worstMs, result.elapsedMs)

    if (puzzle.solution.length === puzzle.width * puzzle.height) report.validBoard++

    // 线索必须与 solution 一致（从答案反推，不信任生成器写进去的线索）
    const recomputed = computeClues(puzzle.solution, puzzle.width, puzzle.height)
    const sameRows = recomputed.rowClues.every((line, y) => cluesEqual(line, puzzle.rowClues[y] ?? []))
    const sameCols = recomputed.colClues.every((line, x) => cluesEqual(line, puzzle.colClues[x] ?? []))
    if (sameRows && sameCols) report.cluesOk++

    // 独立重解：必须恰好一个解，且与 solution 一致
    const analysis = analyzePuzzle(puzzle, { nodeLimit: 60_000, timeLimitMs: 2_000 })
    if (analysis.unique === true && analysis.solution) {
      let identical = true
      for (let k = 0; k < puzzle.solution.length; k++) {
        if ((analysis.solution[k] ? 1 : 0) !== (puzzle.solution[k] ? 1 : 0)) {
          identical = false
          break
        }
      }
      if (identical) report.unique++
    }

    if (result.matched) report.matched++

    const quality = qualityMetricsOf(result)
    report.degenerateTotal += quality.degenerateLines
    if (quality.degenerateLines === 0) report.degenerateFree++
    totalScore += quality.difficultyScore
    report.maxScore = Math.max(report.maxScore, quality.difficultyScore)
  }

  report.avgMs = totalMs / count
  report.avgScore = totalScore / count
  return report
}

function printReport(report: Report): void {
  const meta = DIFFICULTY_META[report.difficulty]
  const { width, height } = boardSizeFor(report.difficulty)
  const hardFail = report.unique < report.count || report.cluesOk < report.count || report.validBoard < report.count
  const mark = hardFail ? 'FAIL' : 'OK  '

  console.log(`\n[${mark}] ${meta.label} ${width}×${height}`)
  console.log(`  生成数量        : ${report.count}`)
  console.log(`  唯一解          : ${report.unique} / ${report.count}`)
  console.log(`  线索与答案一致  : ${report.cluesOk} / ${report.count}`)
  console.log(`  盘面尺寸合法    : ${report.validBoard} / ${report.count}`)
  console.log(`  目标难度达标    : ${report.matched} / ${report.count}`)
  console.log(
    `  退化线          : 合计 ${report.degenerateTotal} 条，无退化线的题 ${report.degenerateFree} / ${report.count}`,
  )
  console.log(`  难度分          : 平均 ${report.avgScore.toFixed(1)}，最高 ${report.maxScore}`)
  console.log(`  生成耗时        : 平均 ${report.avgMs.toFixed(1)} ms，最慢 ${report.worstMs.toFixed(1)} ms`)
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  console.log('Nonogram Online · 谜题质量验证')
  console.log(
    `难度：${options.difficulties.map((d) => DIFFICULTY_META[d].label).join('、')}  种子前缀：${options.seed}`,
  )

  const reports = options.difficulties.map((difficulty) => runOneDifficulty(difficulty, options.count, options.seed))
  reports.forEach(printReport)

  const failed = reports.filter((r) => r.unique < r.count || r.cluesOk < r.count || r.validBoard < r.count)
  console.log('')
  if (failed.length > 0) {
    console.error(`存在硬失败：${failed.map((r) => DIFFICULTY_META[r.difficulty].label).join('、')}`)
    process.exitCode = 1
    return
  }
  console.log('全部检查通过：唯一解 / 线索一致 / 盘面合法。')
}

main()
