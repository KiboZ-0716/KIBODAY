import { clamp } from './lib.mjs'

/**
 * 重要度单一真源：影响面 × 社会共鸣（含网上舆情讨论度）× 结构性后果 × 主体量级。
 *
 * 背景（2026-11-12 读者反馈）：旧口径把「营收 / 订单 / 股价 / 市值 / 财报」
 * 这类题材词当加分项，结果单一非龙头公司的季报（CoreWeave）、一只退市个股
 * （萃华）被顶到速览前列——有数字、没水花、也没写清凭什么值得看。
 *
 * 同日二次调整（读者进一步明确）：
 *  - 「宽松一点」只针对社会新闻 / 公共事件，**不是全局放宽**。
 *    社会新闻走 MIN_IMPORTANCE_SOCIAL（更低），公司财报、退市、股价那类
 *    小水花仍按 MIN_IMPORTANCE 硬拦，不放宽、不回流。
 *  - 网上舆情讨论度从「共鸣的一个词」升为**一等维度**：buzzLevel 分 0/1/2，
 *    大爆（2）加权并触发「重点关注」（速览前排 / 今日重点四席），
 *    讨论度必须由提示词要求写清量级（热搜位次、讨论量、持续天数），
 *    且事实仍须回溯 A/B 层核实——纯情绪、明星八卦不算讨论度。
 *
 * 三条硬原则：
 *  1. 加分只给「影响面」「社会共鸣 / 舆情讨论度」「结构性后果」「主体量级」；
 *     信源数量降为弱信号，避免「转载多」被当成「重要」。
 *  2. 标题命中「小水花」且没有国家级 / 龙头 / 监管 / 公共后果信号，
 *     且**没有「大爆讨论 + 可核对公共后果」的豁免** → 判为不该上刊。
 *  3. 低于准入线的条目不进日报，宁缺毋滥；verify 层带防空版保底。
 *
 * compose.mjs（排序）与 verify.mjs（准入）共用本文件，避免两处口径漂移。
 */

/** 影响面：改变了很多人的钱、规则、安全或日常；或改变了全行业 / 全球的价格与供给 */
const SCOPE =
  /全国|全域|所有|全部|千家万户|亿人|万人|亿用户|全民|亿亩|统一|覆盖\s*\d|涉及\s*\d+\s*(亿|万)|每个人|每位|价格|药价|电价|油价|利率|税率|关税|医保|社保|养老金|学费|工资|房贷|月供|票价|最低工资|放假|节假日|限行|管制|疏散|禁令|召回|停产|停运|停课|供应链|产业链|全球|多国|跨境|国际市场|大范围|多地|跨省|全体|普遍/

/**
 * 网上舆情讨论度 · 大爆（2）：热搜前列 / 霸榜 / 刷屏 / 亿次级 / 多平台 / 持续在榜，
 * 或带可核对量级（讨论量、阅读量、转发量、在榜天数）。
 * 这是读者新加的一等信号，命中即进入「重点关注」通道。
 */
const BUZZ_STRONG =
  /热搜(第|榜首|前三|前十|第一|前列)|登顶热搜|热搜登顶|霸榜|刷屏|全网(热议|刷屏|关注)|亿次(阅读|播放|讨论|浏览)|千万(次|条|人)|讨论量|阅读量\s*\d|播放量\s*\d|转发(量|超|破)|评论\s*\d+\s*(万|亿)|多平台|多个平台|连续.{0,6}(热搜|在榜|霸榜)|持续.{0,6}(在榜|发酵|热议)|持续多日|登上.{0,6}榜首|舆情(发酵|沸腾)|讨论度(很|极|超)?高|全网讨论/

/** 网上舆情讨论度 · 有讨论（1）：有公共讨论证据，但未到大爆量级 */
const BUZZ_MILD =
  /热搜|热榜|舆论|冲上|关注度|大量网友|网友(热议|质疑|讨论)|公众|民意|集体|联名|请愿|抗议|声援|广泛关注|持续发酵|共鸣|引发.{0,8}(讨论|争议|质疑|热议|关注)|登上.{0,6}榜|讨论度|舆情|在榜|话题量/

/** 结构性后果：规则、钱、责任真的变了，且可核对（也用于判断讨论是否落地） */
const CONSEQUENCE =
  /伤亡|遇难|死亡|失联|疏散|赔付|赔偿|退一赔三|罚款|处罚|禁令|叫停|下架|召回|问责|判决|裁定|终审|认定|立案|起诉|生效|施行|取消|纳入|剔除|暂停|终止|否决|罢免|辞职|换俘|停火|制裁|关税|吊销|判刑|获刑|责令|整改|约谈|印发|出台|表决通过|正式实施|通过.{0,6}(法案|草案|条例|办法)/

/**
 * 社会新闻正向信号：公共安全、司法、公共卫生、教育医保、灾害、召回、环境。
 * 读者明确反馈「社会新闻比例低了」「对社会新闻宽松一点」：这类题材只要写出
 * 可核对后果，准入走更低的 MIN_IMPORTANCE_SOCIAL，排序也不再被财经大数字压住。
 */
const SOCIAL_SIGNAL =
  /法院|判决|裁定|终审|法官|检察|起诉|立案|判刑|获罪|罪名|构成.{0,8}罪|事故|坍塌|火灾|爆炸|地震|暴雨|洪水|寒潮|台风|伤亡|遇难|失联|被困|疏散|救援|疫情|确诊|传染病|疫苗|疾控|医保|集采|药品|药监|召回|抽检|食品|校园|学生|学费|高考|学位|教育|养老|社保|退休|环境|污染|预警|重污染|限行|停课|停运|管制|赔付|问责|通报|消费者|欺诈|维权|退一赔三|刷单|诈/

/** 主体量级：系统重要性主体，国内与国外同一把尺，不因是国外就降级 */
const MAJOR_ACTOR =
  /央行|国务院|中共中央|中央|财政部|证监会|发改委|工信部|商务部|外交部|国防部|最高法|最高检|市场监管总局|医保局|药监局|教育部|人社部|生态环境部|应急管理部|疾控局|统计局|国资委|美联储|欧洲央行|欧盟|联合国|世卫组织|WTO|IMF|OPEC|G20|白宫|美国国会|参议院|众议院|五角大楼|英伟达|苹果|微软|谷歌|亚马逊|Meta|特斯拉|台积电|三星|丰田|大众|华为|腾讯|阿里巴巴|字节跳动|比亚迪|宁德时代|中石油|中石化|贵州茅台|工商银行|OpenAI|Anthropic|龙头|行业第一|全球最大|最大IPO|系统重要性/

/**
 * 小水花（只看标题）：有数字、没水花的公司级动作。
 * 特意不放「酝酿 / 拟 / 考虑 / 首破 / 第N家」这类词——行业级涨价、销量里程碑
 * 可能是结构性变化，不能一刀切；它们由打分和自检判断，不硬拦。
 */
const SMALL_SPLASH_TITLE =
  /季报|财报|营收|净利|毛利|业绩|积压订单|订单达\s*\d|盘后|盘前|收涨|收跌|涨停|跌停|股价|市值|摘牌|退市|最后交易日|股转系统|收盘报|收盘\s*\d|增持|减持|回购|定增|配股|分红|每股|涨\s*\d+\.\d+%|跌\s*\d+\.\d+%/

/** 标题豁免：国家级 / 监管 / 龙头 / 公共后果 / 全民影响，即便带财务词也不算小水花 */
const EXEMPT_TITLE =
  /央行|国务院|中央|财政部|证监会|发改委|工信部|商务部|外交部|最高法|最高检|市场监管|医保局|药监局|教育部|生态环境部|应急管理|疾控|统计局|美联储|欧洲央行|欧盟|联合国|世卫|WTO|IMF|OPEC|G20|白宫|国会|全国|全球|所有|全民|亿人|万人|判决|裁定|终审|处罚|罚款|禁令|召回|管制|疏散|遇难|伤亡|事故|灾害|疫情|热搜|刷屏|英伟达|苹果|微软|谷歌|亚马逊|特斯拉|台积电|华为|腾讯|阿里|字节|比亚迪|宁德|Anthropic|OpenAI|龙头|全球最大|最大IPO/

/** 通稿 / 无信息量（沿用旧口径） */
const BOILERPLATE = /会议召开|圆满|揭晓|慰问|调研|建成\s*\d+\s*座/

/** 通用准入下限：低于此分不进日报（宁缺毋滥）。保底逻辑在 verify.mjs */
export const MIN_IMPORTANCE = 2.4

/** 社会新闻专用准入下限：读者要求「对社会新闻宽松一点」，只在这一类下调，不全局放宽 */
export const MIN_IMPORTANCE_SOCIAL = 1.8

/** 讨论度大爆的级别：达到即进入「重点关注」通道（速览前排 / 今日重点四席） */
export const BUZZ_FOCUS = 2

/** 标题级判定：这条是不是「没大水花的公司小动作」——摘要写得再热闹也救不回来 */
export function isSmallSplash(title, summary = '') {
  const t = String(title ?? '').replace(/\s/g, '')
  if (!t) return false
  if (EXEMPT_TITLE.test(t)) return false
  return SMALL_SPLASH_TITLE.test(t)
}

/** 汇总事件里所有可用来判断讨论度与社会属性的文本 */
function textOf(event = {}) {
  return [
    event.title,
    event.summary,
    event.why,
    event.buzz,
    event.discussion,
    ...(event.tags ?? []),
  ]
    .filter((x) => x != null && typeof x !== 'object')
    .join(' ')
}

/**
 * 网上舆情讨论度：0 = 无 / 1 = 有公共讨论 / 2 = 大爆（重点关注）。
 * 优先读模型显式标注的 buzz（数字或等级文字），否则从标题、摘要、why 里识别量级。
 * 注意：只代表「讨论热度」，不代表事实成立——事实仍须回溯 A/B 层核实。
 */
export function buzzLevel(event = {}) {
  const explicit = event.buzz ?? event.discussion ?? event.publicBuzz
  const n = Number(explicit)
  if (Number.isFinite(n) && n > 0) return Math.min(BUZZ_FOCUS, Math.round(n))
  const text = textOf(event)
  if (BUZZ_STRONG.test(text)) return 2
  if (BUZZ_MILD.test(text)) return 1
  return 0
}

/** 编辑（模型）标注的社会类标签，也算「这是公共事件」的信号 */
const SOCIAL_TAGS = /社会|司法|民生|公共安全|事故|教育|医疗|卫生|环境|灾害|法治|监管|健康/

/**
 * 是否属于「社会新闻 / 公共事件」：命中社会信号、已有网上公共讨论，
 * 或被编辑标为社会类题材。只有这一类享受更低的准入线与补位优先，
 * 财经 / 公司条目不沾光。
 */
export function isSocial(event = {}) {
  return (
    SOCIAL_SIGNAL.test(textOf(event)) ||
    buzzLevel(event) >= 1 ||
    (event.tags ?? []).some((t) => SOCIAL_TAGS.test(String(t)))
  )
}

/**
 * 小水花的「舆情豁免」：讨论度大爆、且已经落到可核对公共后果
 * （立案 / 判决 / 召回 / 处罚 / 监管介入 / 官方通报）。
 * 例如某公司财报因造假被全网热议并立案，标题虽带「财报」也该按公共后果收。
 * CoreWeave 季报、萃华退市这类没有讨论度、没有公共后果的，绝不豁免。
 */
export function hasBuzzOverride(event = {}) {
  return buzzLevel(event) >= BUZZ_FOCUS && CONSEQUENCE.test(textOf(event))
}

/**
 * 纯热度保护：网上讨论很爆，但既没有可核对后果、也没有影响面或社会事实信号。
 * 「对社会新闻宽松」宽的是门槛，不是把口水热搜当新闻——这类仍不收。
 */
export function isPureBuzz(event = {}) {
  const text = textOf(event)
  return (
    buzzLevel(event) >= BUZZ_FOCUS &&
    !CONSEQUENCE.test(text) &&
    !SCOPE.test(text) &&
    !SOCIAL_SIGNAL.test(text)
  )
}

/**
 * 重要度打分 1—5。编辑（模型）显式标注优先，见 compose.mjs 的 importanceOf。
 */
export function importanceScore(event) {
  const title = String(event.title ?? '')
  const summary = String(event.summary ?? '')
  const text = `${title} ${summary} ${event.why ?? ''}`
  const srcs = Number(event.sourceCount ?? event.articles?.length ?? 1)
  const buzz = buzzLevel(event)
  const hasConsequence = CONSEQUENCE.test(text)

  let score = 1
  score += Math.min(srcs, 3) * 0.4 // 多信源是弱信号：转载多 ≠ 重要
  if (SCOPE.test(text)) score += 1.5        // 影响面
  if (hasConsequence) score += 1.0          // 结构性后果
  if (SOCIAL_SIGNAL.test(text)) score += 1.0 // 社会新闻正向加权
  if (isSocial(event)) score += 0.4         // 社会新闻宽松：只给这一类的克制加成
  if (MAJOR_ACTOR.test(text)) score += 1.2  // 主体量级，国内外同一把尺
  // 网上舆情讨论度：一等维度，分级加权（替代原先笼统的「共鸣」+1.2）
  score += buzz >= BUZZ_FOCUS ? 2.0 : buzz >= 1 ? 1.2 : 0
  // 讨论度必须落地：大范围讨论 + 可核对公共后果，额外加权
  if (buzz >= 1 && hasConsequence) score += 0.4
  if (/\d/.test(summary) && /所以|意味着|判断|下一步|观察点|传导|回落|改写|责任|救治|后续|影响|导致|使得|会变/.test(summary)) {
    score += 0.4
  }
  // 小水花是硬约束：即使摘要里蹭了「全球」「龙头」等词，标题是单一公司
  // 财报 / 个股交易 / 退市流程也不靠影响面词救回来。
  // 唯一例外：讨论度大爆且已落到可核对公共后果（hasBuzzOverride）。
  if (isSmallSplash(title, summary) && !hasBuzzOverride(event)) score -= 2.0
  if (BOILERPLATE.test(title)) score -= 1.5
  if (isPureBuzz(event)) score -= 1.5 // 只有热度、没有后果，不该靠讨论度顶到前排

  return Math.round(clamp(score, 1, 5) * 10) / 10
}

/**
 * 「重点关注」加成：讨论度高的必须排到前面，即使编辑显式标了较低的 importance。
 * compose.mjs 在 importanceOf 里统一调用，保证排序与准入共用同一把尺。
 */
export function focusScore(event, base) {
  const value = Number(base)
  if (!Number.isFinite(value)) return importanceScore(event)
  const buzz = buzzLevel(event)
  if (buzz >= BUZZ_FOCUS) return Math.round(clamp(Math.max(value, 3.6) + 0.6, 1, 5) * 10) / 10
  if (buzz >= 1) return Math.round(clamp(value + 0.3, 1, 5) * 10) / 10
  return Math.round(clamp(value, 1, 5) * 10) / 10
}

/** 给前端展示用的一句话：这条凭什么值得你看（讨论度 / 影响面 / 共鸣 / 后果） */
export function importanceReason(event) {
  const buzz = buzzLevel(event)
  if (buzz >= BUZZ_FOCUS) return '网上讨论度很高，且已有可核对的公共后果'
  if (buzz >= 1) return '引发大范围公共讨论，且已有可核对的后续'
  if (SCOPE.test(textOf(event))) return '影响面覆盖到价格、规则或多数人的日常'
  if (CONSEQUENCE.test(textOf(event))) return '规则、钱或责任认定发生了可核对的变化'
  if (MAJOR_ACTOR.test(textOf(event))) return '系统重要性主体的动作，国内外同一把尺'
  return ''
}
