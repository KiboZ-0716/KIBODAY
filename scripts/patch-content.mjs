// 一次性数据补丁：推荐位链接、深度解读正文、区域改为重庆/青海/新疆
import fs from 'node:fs'

const QH = (items) => ({ city: '青海', items })
const XJ = (items) => ({ city: '新疆', items })

const patch = {
  '2026-10-30': {
    cards: { 0: '/storyline/plateau-snow', 1: '/issue/2/briefs?q=以旧换新' },
    regional: {
      default: '重庆',
      cities: [
        {
          city: '重庆',
          items: [
            { tag: '城市建设', title: '渝万高铁进入联调联试，重点项目进度达年度计划 73.3%', source: '重庆日报', relTime: '52 分钟前' },
            { tag: '基层治理', title: '重庆部署「渝邻共治」超大城市社区治理改革', source: '重庆发布', relTime: '1 小时前' },
            { tag: '公共安全', title: '65 起避险避灾案例获通报表扬，累计转移 3407 人', source: '应急管理部', relTime: '2 小时前' },
          ],
        },
        QH([
          { tag: '气候', title: '暴雪过程影响青南牧区，饲草调运与保畜工作启动', source: '青海日报', relTime: '1 小时前' },
          { tag: '交通', title: '国道 214 线部分路段夜间管制，客运班线临时调整', source: '青海路网', relTime: '2 小时前' },
          { tag: '能源', title: '海南州光伏基地年内新增装机 120 万千瓦', source: '青海省发改委', relTime: '3 小时前' },
        ]),
        XJ([
          { tag: '外贸', title: '霍尔果斯口岸前三季度过货量同比增长 11.4%', source: '新疆日报', relTime: '1 小时前' },
          { tag: '农业', title: '棉花采收进度过七成，机采率提升至 88%', source: '新疆农业农村厅', relTime: '2 小时前' },
          { tag: '能源', title: '准东煤制气项目一期进入联动试车', source: '新疆发改委', relTime: '3 小时前' },
        ]),
      ],
    },
    analysis: {
      sections: [
        {
          heading: '「少涨」不是降价，差的是 95 元/吨',
          paragraphs: [
            '按现行机制测算，本轮汽油应调 440 元/吨。实际落地 345 元/吨，差额 95 元/吨。价格确实涨了，只是没涨满——「少涨」描述的是涨幅，不是方向。',
            '这 95 元不会消失。机制上，未调满的部分计入下一轮调价周期的基期，等于把压力往后推一次窗口。对消费者来说，短期少支出；对下一次调价来说，起点更高。',
          ],
        },
        {
          heading: '为什么会出现「应调未调满」',
          paragraphs: [
            '调价机制不是纯公式执行。成品油价格同时承担三个目标：反映国际原油成本、稳定下游用油成本、保障炼化环节的合理利润。当国际油价短期波动过大，机制里的平滑项就会起作用。',
            '本轮触发平滑的直接原因，是原油变化率在十个工作日内快速上行，而终端需求正处在恢复期。此时全额传导，会把这部分波动一次性压到物流与农业用油上。',
          ],
        },
        {
          heading: '这笔差额传导给谁',
          paragraphs: [
            '第一层是私家车：按 50 升油箱测算，加满一箱多支出约 20 元，感知明显但金额有限。',
            '第二层是营运车辆与物流：柴油每吨上调 330 元。重卡按百公里 35 升、月跑一万公里估算，月度燃料成本增加在千元量级，会逐步计入运价。',
            '第三层是化工与航空：石脑油裂解与航煤采购的传导更慢，但对下游报价的影响更持久，通常滞后一到两个季度才完全体现。',
          ],
        },
        {
          heading: '接下来看什么',
          paragraphs: [
            '最近的观察点是 11 月 12 日的新一轮窗口。若国际油价维持当前区间，累积的差额会抬高下一轮的应调基数。',
            '比单次调幅更值得跟踪的，是「未调满」出现的频率。连续两轮以上出现，说明机制正在承担逆周期调节，而不只是成本传导。',
          ],
        },
        {
          heading: '口径说明',
          paragraphs: [
            '本期调价数字来自国家发改委价格司公告口径；「应调幅度」为机构按十个工作日原油变化率测算的数值，不是官方发布数字，两者不能直接相减后当作政策态度。',
            '「加满一箱多花约 20 元」按 92 号汽油、50 升箱容估算，实际支出随地区、油品标号与加油站优惠浮动。',
          ],
        },
      ],
      citations: [
        { label: '汽油每吨调整', value: '345 元', source: '国家发改委价格司公告' },
        { label: '柴油每吨调整', value: '330 元', source: '国家发改委价格司公告' },
        { label: '机制测算应调', value: '440 元/吨', source: '机构测算 · 十个工作日原油变化率' },
        { label: '新价格生效', value: '10 月 30 日 00:00', source: '发改委调价公告' },
        { label: '加满一箱增加', value: '约 20 元', source: '按 92 号汽油 50 升箱容估算' },
      ],
    },
  },
  '2026-10-29': {
    cards: { 0: '/issue/1/briefs?q=城市更新', 1: '/issue/1/briefs?q=服务消费' },
    regional: {
      default: '重庆',
      cities: [
        {
          city: '重庆',
          items: [
            { tag: '城市更新', title: '中心城区 18 个片区启动更新，涉及居民 12 万户', source: '重庆日报', relTime: '1 小时前' },
            { tag: '产业', title: '两江新区新增 3 家国家级专精特新「小巨人」企业', source: '重庆发布', relTime: '2 小时前' },
            { tag: '民生', title: '新版医保药品目录新增 91 种药品，明年 1 月起执行', source: '新华社', relTime: '1 小时前' },
          ],
        },
        QH([
          { tag: '气候', title: '青海湖流域降水偏多，水位较去年同期上升 12 厘米', source: '青海日报', relTime: '1 小时前' },
          { tag: '生态', title: '三江源国家公园完成新一轮野生动物监测', source: '三江源国家公园管理局', relTime: '2 小时前' },
          { tag: '交通', title: '西成铁路青海段隧道群贯通，铺轨进入冲刺阶段', source: '青海发布', relTime: '3 小时前' },
        ]),
        XJ([
          { tag: '通道', title: '中欧（中亚）班列年内开行突破 1.2 万列', source: '新疆日报', relTime: '1 小时前' },
          { tag: '产业', title: '乌鲁木齐国际陆港区新增 3 条集结线路', source: '新疆发布', relTime: '2 小时前' },
          { tag: '民生', title: '南疆四地州农村饮水安全巩固提升工程完工', source: '新疆水利厅', relTime: '3 小时前' },
        ]),
      ],
    },
    analysis: {
      sections: [
        {
          heading: '4.1% 的变化率是什么信号',
          paragraphs: [
            '原油变化率是十个工作日移动平均后的涨跌幅。4.1% 意味着按当前机制测算，本轮对应的上调幅度已经越过调价红线，属于「必须调」的区间。',
            '变化率是滞后指标：它反映过去两周的原油价格，而不是当下的价格。所以它确定性高、前瞻性弱——只能说明这一轮大概率要涨，说明不了下一轮。',
          ],
        },
        {
          heading: '测算值与实际值差在哪',
          paragraphs: [
            '测算值是纯公式结果；实际值还要经过三道处理：调价幅度的取整规则、波动过大时的平滑、以及上下游利益与民生成本之间的平衡。',
            '这三道处理都不公开到可复算的程度。所以每次窗口开启前的「预期幅度」都只是区间，不是定数——把它当成政策承诺来读，是常见的误判。',
          ],
        },
        {
          heading: '差额由谁承担',
          paragraphs: [
            '短期由炼化环节与后续窗口共同承担：少调的部分压缩炼厂即时毛利，同时在下一轮形成更高的基期。',
            '对消费者来说，感知是「这次少涨了」；对产业链来说，是成本在时间上被重新分配了一次。谁承担，取决于你停在链条的哪一段。',
          ],
        },
        {
          heading: '下一个窗口怎么判',
          paragraphs: [
            '11 月 12 日之前主要看三件事：国际原油能否站稳当前区间、汇率变动对进口成本的影响、以及本轮未调满部分的处理方式。',
            '三项若同向，下一轮的上调压力会大于本轮；若原油回落，本轮累积的差额会被部分吸收，实际调幅可能再次低于测算值。',
          ],
        },
        {
          heading: '口径说明',
          paragraphs: [
            '本期发布时窗口尚未开启，所有幅度均为机构测算口径，不构成对最终调价的预测。实际调价以国家发改委公告为准。',
          ],
        },
      ],
      citations: [
        { label: '原油变化率', value: '4.1%', source: '机构测算 · 十个工作日移动平均' },
        { label: '测算应调幅度', value: '400+ 元/吨', source: '机构测算区间' },
        { label: '下一轮窗口', value: '11 月 12 日', source: '成品油调价日历' },
      ],
    },
  },
}

for (const [date, p] of Object.entries(patch)) {
  const file = `content/briefs/${date}.json`
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))

  for (const [index, to] of Object.entries(p.cards)) {
    const card = data.cards[Number(index)]
    if (card) card.to = to
  }

  data.regional = p.regional
  data.analysis.sections = p.analysis.sections
  data.analysis.citations = p.analysis.citations

  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  console.log(`${date} 已更新：cards.to / regional 三地 / analysis ${p.analysis.sections.length} 节`)
}
