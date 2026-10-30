// 给「与你有关」的每条地区新闻补稳定 id 与一句事实摘要
// id 用于深挖入口；summary 作为模型输入素材，避免模型凭空推断
import { readFileSync, writeFileSync } from 'node:fs'

const CITY_CODE = { 重庆: 'cq', 青海: 'qh', 新疆: 'xj' }

const SUMMARIES = {
  '2026-10-30': {
    重庆: [
      '渝万高铁进入联调联试阶段，重庆重点项目建设进度达到年度计划的 73.3%。',
      '重庆启动「渝邻共治」改革，面向超大城市社区治理调整基层权责配置。',
      '应急管理部通报 65 起避险避灾典型案例，累计转移 3407 人。',
    ],
    青海: [
      '暴雪过程影响青南牧区，当地启动饲草调运与保畜工作。',
      '国道 214 线部分路段实施夜间管制，相关客运班线临时调整。',
      '海南州光伏基地年内新增装机 120 万千瓦，并网与消纳同步推进。',
    ],
    新疆: [
      '霍尔果斯口岸前三季度过货量同比增长 11.4%。',
      '棉花采收进度过七成，机采率提升至 88%。',
      '准东煤制气项目一期进入联动试车，为投产做准备。',
    ],
  },
  '2026-10-29': {
    重庆: [
      '中心城区 18 个片区启动城市更新，涉及居民约 12 万户。',
      '两江新区新增 3 家国家级专精特新「小巨人」企业。',
      '新版医保药品目录新增 91 种药品，明年 1 月起执行。',
    ],
    青海: [
      '青海湖流域降水偏多，水位较去年同期上升 12 厘米。',
      '三江源国家公园完成新一轮野生动物监测，覆盖多个样区。',
      '西成铁路青海段隧道群贯通，铺轨进入冲刺阶段。',
    ],
    新疆: [
      '中欧（中亚）班列年内开行突破 1.2 万列。',
      '乌鲁木齐国际陆港区新增 3 条集结线路。',
      '南疆四地州农村饮水安全巩固提升工程完工。',
    ],
  },
}

for (const date of Object.keys(SUMMARIES)) {
  const file = `content/briefs/${date}.json`
  const brief = JSON.parse(readFileSync(file, 'utf8'))
  const day = date.slice(5).replace('-', '')
  for (const city of brief.regional.cities) {
    const code = CITY_CODE[city.city] ?? 'xx'
    const pool = SUMMARIES[date][city.city] ?? []
    city.items = city.items.map((item, index) => ({
      ...item,
      id: `r${day}-${code}-${index + 1}`,
      summary: pool[index] ?? item.title,
    }))
  }
  writeFileSync(file, JSON.stringify(brief, null, 2) + '\n', 'utf8')
  console.log(date, brief.regional.cities.map((c) => `${c.city}:${c.items.length}`).join(' '))
}
