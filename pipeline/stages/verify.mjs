import { clamp } from '../lib.mjs'
import { importanceScore, isSmallSplash, MIN_IMPORTANCE } from '../importance.mjs'

/**
 * 发布闸门。
 *
 * 三层判断：
 *   1) 编辑闸门 —— 把「有标题、零信息量」的内容挡在外面，靠代码硬拦。
 *   2) 价值闸门（2026-11-12 新增）—— 按「影响面 × 社会共鸣 × 结构性后果」
 *      打分，低于下限、或标题是「没大水花的公司小动作」的一律不进日报。
 *      对应 content/prompts/source-guide.md 第二条；宁缺毋滥，带最低条数保底。
 *   3) 完整性闸门 —— 摘要过短、无标签、标题过短 → 信息不足，不进日报。
 *
 * 单信源不等于不可信：大量一手通报本身就是单信源。
 * 所以"隐藏"不以信源数量为准，而以信息完整度为准。
 */
export function verify(events, { minConfidence = 0.5, pinnedIds = [] } = {}) {
  // 「今日重点」头条 / 深度分析的事件由编辑钦定、且配有完整专题，
  // 不能被价值闸门拦掉——否则 compose.findEvent 会 fallback 到别的新闻，
  // 把头条的信源徽标、配图张冠李戴。它们仍受编辑闸门与完整性闸门约束。
  const pinned = new Set(pinnedIds.filter(Boolean))
  const scored = events.map((event) => {
    const sourceCount = event.sources.length
    const hasImage = Boolean(event.image)
    const summary = String(event.summary ?? '')
    const title = String(event.title ?? '')
    const summaryLength = summary.replace(/\s/g, '').length
    const titleLength = title.replace(/\s/g, '').length

    const complete = summaryLength >= 30 && titleLength >= 8 && event.tags.length > 0
    const confidence = clamp(
      0.5 + 0.15 * (sourceCount - 1) + (hasImage ? 0.06 : 0) + (event.articles.length > 1 ? 0.04 : 0),
      0,
      1,
    )

    // ---- 编辑闸门 ----
    const gate = editorialGate(title, summary)

    // ---- 价值闸门（影响面 × 社会共鸣 × 结构性后果）----
    // 打分需要 sourceCount，这里先补上再算。小水花只看标题，摘要写得再热闹也救不回来。
    const withCount = { ...event, sourceCount }
    const importance = importanceScore(withCount)
    const smallSplash = isSmallSplash(title, summary)
    const isPinned = event.articles.some((a) => pinned.has(a.id))
    const valueReject = isPinned
      ? null
      : smallSplash
        ? '没大水花的公司小动作（非龙头季报 / 个股交易 / 退市流程）'
        : importance < MIN_IMPORTANCE
          ? '影响面与社会共鸣不足，不够上刊'
          : null

    return {
      ...withCount,
      verified: sourceCount >= 2,
      confidence: Number(confidence.toFixed(3)),
      complete,
      editorialReject: gate,
      valueReject,
      smallSplash,
      importance,
      reason:
        gate ??
        valueReject ??
        (complete ? null : summaryLength < 30 ? '摘要信息不足' : '缺少分类标签'),
    }
  })

  // 若编辑闸门命中过多导致当期几乎空版，只保留最严重的两类（标题党 / 零数字且复述标题），
  // 其余放行，避免出现空白日报。宁缺毋滥，但不能无报。
  const hard = (e) => e.editorialReject === '标题党句式' || e.editorialReject === '无数字且复述标题'
  const rejected = scored.filter((e) => e.editorialReject)
  const keepAllButHard = rejected.length > scored.length * 0.4 && scored.filter(hard).length < scored.length - 4

  const baseOk = (e) =>
    e.complete &&
    e.confidence >= minConfidence &&
    (!e.editorialReject || (keepAllButHard && !hard(e)))

  // 价值闸门是硬约束：小水花永不保底补回（读者明确说这类不看了）。
  // 只有「影响面不足」这类软拒绝，在当期合格条目太少时才按重要度从高到低补到 minKeep 条，
  // 避免某天新闻普遍平淡时出现空白日报。宁缺毋滥 ≠ 一定要凑满。
  const MIN_KEEP = 6
  const clean = scored.filter((e) => baseOk(e) && !e.valueReject)
  let published = clean
  if (clean.length < MIN_KEEP) {
    const soft = scored
      .filter((e) => baseOk(e) && e.valueReject && !e.smallSplash && !isSmallSplash(e.title, e.summary))
      .sort((a, b) => b.importance - a.importance)
    const rescue = new Set(soft.slice(0, MIN_KEEP - clean.length))
    published = scored.filter((e) => clean.includes(e) || rescue.has(e))
  }
  const hidden = scored.filter((e) => !published.includes(e))

  return {
    events: published,
    hiddenCount: hidden.length,
    hidden: hidden.map((e) => ({ title: e.title, reason: e.reason ?? '置信度不足' })),
  }
}

/** 返回拒绝原因，合格则返回 null */
function editorialGate(title, summary) {
  const t = title.replace(/\s/g, '')
  const s = summary.replace(/\s/g, '')

  // 1. 标题党：命中即拒
  const clickbait = /重磅|突发|刚刚|震惊|炸了|史诗级|王炸|来了！|定了！|意味着什么|释放了?什么信号|背后藏着|真相|值得关注|不容乐观|终于|罕见|深思|警惕|值得一看|如何影响|怎么看|是什么\?|意味着\?/
  if (clickbait.test(t)) return '标题党句式'
  if (/[?？]$/.test(t)) return '标题党句式（疑问句标题）'

  // 2. 摘要没有任何数字、且没写出标题之外的独立信息 → 通稿式复述，拦。
  //    若虽无数字但写出了机制/后果/下一步等独立信息，则放行，避免误伤政策解读导致空版。
  const hasNumber = /\d/.test(s)
  if (!hasNumber && (s.length - t.length < 25 || s.length < 40)) return '无数字且复述标题'

  // 3. 通稿黑名单：标题命中，且摘要没有给出可量化后果（无金额/比例/份额/价格/涨跌幅）
  const boilerplate = /大会开幕|大会闭幕|圆满闭幕|顺利举行|论坛启幕|正式启幕|获通报表扬|奖项揭晓|获评先进|揭晓.*获奖|建成\s*\d+\s*座|进度达\s*\d+\.?\d*%|慰问|赴.{0,8}调研|签署战略合作协议|遗骸移交|认亲仪式|纪念活动举行|表彰大会|成功举办/
  const hasConsequence = /元|%|百分点|亿|万|涨|跌|降|增|减|价|费|税|利率|份额|产能|订单|吨|辆|人次|基点|bp|美元|工作日/.test(s)
  if (boilerplate.test(t) && !hasConsequence) return '会议/表彰/进度类通稿，无可量化后果'

  // 4. 标题复述判断：好摘要本来就会包含标题里的数字与主体，用「短文本被长文本
  //    覆盖的比例」判断会误杀所有有信息量的稿子。改看标题之外的增量：
  //    摘要比标题长出的篇幅 + 是否出现标题里没有的新数字。两项都不足才算复述。
  const beyond = s.length - t.length
  const titleNums = (t.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
  const sumNums = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
  const newNums = sumNums.filter((n) => !titleNums.includes(n))
  if (s.length >= 40 && beyond < 25 && newNums.length === 0) return '摘要复述标题，无信息增量'

  return null
}

/** 用二字词组重合度估计两段文字的相似度 */
function similarity(a, b) {
  const g = (str) => {
    const set = new Set()
    for (let i = 0; i < str.length - 1; i += 1) set.add(str.slice(i, i + 2))
    return set
  }
  const A = g(a)
  const B = g(b)
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const x of A) if (B.has(x)) hit += 1
  return hit / Math.min(A.size, B.size)
}
