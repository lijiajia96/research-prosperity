'use client';

import { useEffect, useMemo, useState } from 'react';
import rawData from './data/openalex.json';

type Status = 'mature' | 'provisional' | 'partial';
type Metric = {
  year: number; status: Status; topPaperCount: number; forecastCount: number;
  fieldPaperCount: number; fieldTopShare: number | null; top10CitedShare: number | null;
  globalShare: number | null; yoyGrowth: number | null; cagr5: number | null;
  qualityChange5: number | null; volumeScore: number; qualityScore: number;
  momentumScore: number; prosperityScore: number;
};
type Journal = { id: string; name: string; baselineArticles: number; top10Share: number; selectionScore: number };
type Field = { id: number; name: string; nameEn: string; domain: string; seasonFraction: number; topJournals: Journal[]; metrics: Metric[] };
type Dataset = { meta: { source: string; sourceUrl: string; asOf: string; startYear: number; latestMatureYear: number; latestCompleteVolumeYear: number; fieldCount: number; methodVersion: string; note: string }; fields: Field[] };
const data = rawData as Dataset;

const COLORS = ['#ff6b35','#167d8d','#7357d9','#c14953','#4f7d39','#d08b22','#3466a3','#9d5b8d'];
type MetricKey = 'prosperityScore' | 'topPaperCount' | 'top10CitedShare' | 'cagr5';
const METRICS: Record<MetricKey,{label:string;short:string;format:(v:number)=>string}> = {
  prosperityScore:{label:'科研兴盛指数',short:'综合指数',format:v=>v.toFixed(1)},
  topPaperCount:{label:'顶刊论文数量',short:'论文数量',format:v=>Math.round(v).toLocaleString('zh-CN')},
  top10CitedShare:{label:'高被引论文占比',short:'质量',format:v=>`${(v*100).toFixed(1)}%`},
  cagr5:{label:'近五年复合增长',short:'增长动量',format:v=>`${v>=0?'+':''}${(v*100).toFixed(1)}%`},
};

function valueOf(metric: Metric, key: MetricKey) {
  if (key === 'topPaperCount' && metric.year === 2026) return metric.forecastCount;
  const value = metric[key];
  return typeof value === 'number' ? value : null;
}

function pathFor(metrics: Metric[], key: MetricKey, min: number, max: number, width=720, height=300) {
  const points = metrics.map(m => ({x:(m.year-2000)/26*width,y:valueOf(m,key)})).filter(p=>p.y!==null) as {x:number;y:number}[];
  return points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${(height-(p.y-min)/(max-min||1)*height).toFixed(1)}`).join(' ');
}

function LineChart({fields,keyName,focusId,onFocus}:{fields:Field[];keyName:MetricKey;focusId:number;onFocus:(id:number)=>void}) {
  const values = fields.flatMap(f=>f.metrics.map(m=>valueOf(m,keyName))).filter((v):v is number=>v!==null);
  const rawMin=Math.min(...values), rawMax=Math.max(...values);
  const min = keyName==='prosperityScore'||keyName==='topPaperCount'||keyName==='top10CitedShare' ? 0 : Math.min(0,rawMin*1.15);
  const max = keyName==='prosperityScore' ? 100 : rawMax*1.12 || 1;
  const ticks=[0,1,2,3,4].map(i=>max-(max-min)*i/4);
  return <div className="line-chart-wrap">
    <div className="axis-y">{ticks.map(t=><span key={t}>{METRICS[keyName].format(t)}</span>)}</div>
    <svg className="line-chart" viewBox="0 0 720 300" role="img" aria-label={`${fields.map(f=>f.name).join('、')}的${METRICS[keyName].label}历史曲线`}>
      {ticks.map((_,i)=><line key={i} x1="0" x2="720" y1={i*75} y2={i*75} className="gridline" />)}
      <rect x="692.3" width="27.7" height="300" className="partial-zone" />
      <line x1="692.3" x2="692.3" y1="0" y2="300" className="partial-line" />
      {fields.map((field,index)=>{
        const all=field.metrics; const through2025=all.filter(m=>m.year<=2025); const last=all.filter(m=>m.year>=2025);
        const color=COLORS[index%COLORS.length]; const active=field.id===focusId;
        return <g key={field.id} className={active?'series active':'series'} onClick={()=>onFocus(field.id)} tabIndex={0} role="button" aria-label={`查看${field.name}`} onKeyDown={e=>{if(e.key==='Enter')onFocus(field.id)}}>
          <path d={pathFor(through2025,keyName,min,max)} stroke={color} />
          <path d={pathFor(last,keyName,min,max)} stroke={color} className="forecast-path" />
          <circle cx="720" cy={300-((valueOf(all[all.length-1],keyName)??min)-min)/(max-min||1)*300} r={active?5:3.5} fill={color} />
        </g>;
      })}
    </svg>
    <div className="axis-x"><span>2000</span><span>2005</span><span>2010</span><span>2015</span><span>2020</span><span>2026*</span></div>
  </div>;
}

function Quadrant({year,focusId,onFocus}:{year:number;focusId:number;onFocus:(id:number)=>void}) {
  const rows=data.fields.map(f=>({field:f,metric:f.metrics.find(m=>m.year===year)!})).filter(r=>r.metric.cagr5!==null&&r.metric.qualityChange5!==null);
  const xs=rows.map(r=>r.metric.cagr5!), ys=rows.map(r=>r.metric.qualityChange5!);
  const xAbs=Math.max(.05,...xs.map(Math.abs))*1.15, yAbs=Math.max(.02,...ys.map(Math.abs))*1.15;
  const x=(v:number)=>50+v/xAbs*46, y=(v:number)=>50-v/yAbs*44;
  const maxN=Math.max(...rows.map(r=>r.metric.topPaperCount));
  return <div className="quadrant-wrap">
    <svg viewBox="0 0 100 100" className="quadrant" role="img" aria-label={`${year}年各领域数量增长与质量变化象限`}>
      <rect x="50" y="4" width="46" height="46" className="good-zone" />
      <line x1="50" x2="50" y1="4" y2="96" className="zero-line"/><line x1="4" x2="96" y1="50" y2="50" className="zero-line"/>
      <text x="94" y="9" textAnchor="end" className="quad-label">数量↑ 质量↑</text>
      {rows.map(({field,metric})=>{
        const active=field.id===focusId; const r=1.8+Math.sqrt(metric.topPaperCount/maxN)*2.5;
        return <g key={field.id} onClick={()=>onFocus(field.id)} className="bubble" role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onFocus(field.id)}}>
          <circle cx={x(metric.cagr5!)} cy={y(metric.qualityChange5!)} r={active?r+1:r} className={active?'bubble-dot active':'bubble-dot'} />
          {active&&<text x={x(metric.cagr5!)} y={y(metric.qualityChange5!)-r-2.2} textAnchor="middle" className="bubble-label">{field.name}</text>}
        </g>;
      })}
    </svg>
    <div className="quad-axis x">← 数量收缩　近五年复合增长　数量增长 →</div><div className="quad-axis y">质量提升 →</div>
  </div>;
}

function downloadCsv() {
  const header='field_id,field_name,domain,year,status,top_paper_count,forecast_count,top10_cited_share,cagr_5y,prosperity_score';
  const rows=data.fields.flatMap(f=>f.metrics.map(m=>[f.id,`"${f.name}"`,`"${f.domain}"`,m.year,m.status,m.topPaperCount,m.forecastCount,m.top10CitedShare??'',m.cagr5??'',m.prosperityScore].join(',')));
  const blob=new Blob(['\ufeff'+[header,...rows].join('\n')],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`research-prosperity-${data.meta.asOf}.csv`;a.click();URL.revokeObjectURL(url);
}

export default function Home() {
  const ranking2025=useMemo(()=>[...data.fields].sort((a,b)=>b.metrics[25].prosperityScore-a.metrics[25].prosperityScore),[]);
  const initialIds=ranking2025.slice(0,6).map(f=>f.id);
  const [metric,setMetric]=useState<MetricKey>('prosperityScore');
  const [selected,setSelected]=useState<number[]>(initialIds);
  const [focusId,setFocusId]=useState(initialIds[0]);
  const [year,setYear]=useState(2025);
  const [methodOpen,setMethodOpen]=useState(false);
  useEffect(()=>{
    const params=new URLSearchParams(location.search); const m=params.get('metric') as MetricKey|null; const f=Number(params.get('field')); const y=Number(params.get('year'));
    if(m&&METRICS[m])setMetric(m); if(f&&data.fields.some(x=>x.id===f))setFocusId(f); if(y>=2005&&y<=2026)setYear(y);
  },[]);
  useEffect(()=>{
    const params=new URLSearchParams({metric,field:String(focusId),year:String(year)}); history.replaceState(null,'',`?${params}#trend`);
  },[metric,focusId,year]);
  const shown=data.fields.filter(f=>selected.includes(f.id));
  const focus=data.fields.find(f=>f.id===focusId)!;
  const m2025=focus.metrics.find(m=>m.year===2025)!; const m2026=focus.metrics.find(m=>m.year===2026)!;
  const rank=ranking2025.findIndex(f=>f.id===focus.id)+1;
  const toggle=(id:number)=>setSelected(current=>current.includes(id)?(current.length>1?current.filter(x=>x!==id):current):current.length<8?[...current,id]:current);

  return <main>
    <header className="topbar">
      <a className="brand" href="#top">科研兴盛度观测站 <span>beta</span></a>
      <nav aria-label="主导航"><a href="#trend">趋势</a><a href="#momentum">兴盛象限</a><button onClick={()=>setMethodOpen(true)}>方法</button><a href={data.meta.sourceUrl} target="_blank">OpenAlex ↗</a></nav>
    </header>

    <section className="hero" id="top">
      <div><p className="eyebrow">GLOBAL RESEARCH PULSE · 2000—2026</p><h1>哪些科学领域，<br/><em>正在真正兴盛？</em></h1><p className="lede">从固定高影响期刊池出发，同时观察论文规模、归一化引用质量与五年增长动量。最新年份保留，但不伪装成成熟数据。</p></div>
      <div className="freshness"><span className="pulse"/><div><b>更新至 {data.meta.asOf.replaceAll('-','.')}</b><small>2026 年内数据 · 全年预测已校正季节性</small></div></div>
    </section>

    <section className="status-row" aria-label="数据状态说明">
      <div><span className="status mature">成熟</span><b>2000—2023</b><small>数量与引用质量均可比较</small></div>
      <div><span className="status provisional">暂定</span><b>2024—2025</b><small>数量完整，引用质量仍会变化</small></div>
      <div><span className="status partial">年内</span><b>2026</b><small>截至 8 月 26 日；虚线为全年预测</small></div>
    </section>

    <section className="panel trend-panel" id="trend">
      <div className="panel-head"><div><p className="kicker">01 / 长期趋势</p><h2>{METRICS[metric].label}</h2><p>点击曲线或右侧领域查看详情；2026 虚线为预测值</p></div><div className="segmented">{(Object.keys(METRICS) as MetricKey[]).map(k=><button key={k} className={metric===k?'active':''} onClick={()=>setMetric(k)}>{METRICS[k].short}</button>)}</div></div>
      <div className="trend-grid">
        <LineChart fields={shown} keyName={metric} focusId={focusId} onFocus={setFocusId}/>
        <aside className="field-picker"><div className="picker-title"><b>2025 排名</b><span>选择至多 8 个领域</span></div>{ranking2025.map((field,index)=>{
          const active=selected.includes(field.id); return <button key={field.id} className={`${active?'selected ':''}${focusId===field.id?'focused':''}`} onClick={()=>{setFocusId(field.id);if(!active)toggle(field.id)}}><i style={{background:active?COLORS[shown.findIndex(f=>f.id===field.id)%COLORS.length]:'#d6d3ca'}}/><span>{index+1}</span><b>{field.name}</b><em>{field.metrics[25].prosperityScore.toFixed(1)}</em></button>;
        })}</aside>
      </div>
      <div className="legend">{shown.map((field,index)=><button key={field.id} className={focusId===field.id?'active':''} onClick={()=>setFocusId(field.id)}><i style={{background:COLORS[index%COLORS.length]}}/>{field.name}<span onClick={e=>{e.stopPropagation();toggle(field.id)}} aria-label={`移除${field.name}`}>×</span></button>)}<small>* 2026 为预测；圆点表示当前值</small></div>
    </section>

    <section className="split" id="momentum">
      <article className="panel quadrant-panel"><div className="panel-head"><div><p className="kicker">02 / 兴盛象限</p><h2>数量与质量，是否同步上升？</h2><p>气泡大小代表顶刊论文量；右上区域为双增长</p></div><output>{year}</output></div><Quadrant year={year} focusId={focusId} onFocus={setFocusId}/><div className="year-control"><span>2005</span><input aria-label="选择年份" type="range" min="2005" max="2026" value={year} onChange={e=>setYear(Number(e.target.value))}/><span>2026</span></div></article>

      <article className="panel detail-panel"><div className="detail-title"><div><p className="kicker">领域详情 · 2025</p><h2>{focus.name}</h2><p>{focus.nameEn} · {focus.domain}</p></div><div className="rank"><span>综合排名</span><b>#{rank}</b><small>/ {data.meta.fieldCount}</small></div></div>
        <div className="metric-cards"><div><span>顶刊论文</span><b>{m2025.topPaperCount.toLocaleString('zh-CN')}</b><small>2025 完整年度</small></div><div><span>高被引占比</span><b>{((m2025.top10CitedShare||0)*100).toFixed(1)}%</b><small>同年同类同子领域前 10%</small></div><div><span>五年增长</span><b className={(m2025.cagr5||0)>=0?'up':'down'}>{(m2025.cagr5||0)>=0?'+':''}{((m2025.cagr5||0)*100).toFixed(1)}%</b><small>年复合增长率</small></div></div>
        <div className="nowcast"><div><span>2026 已收录</span><b>{m2026.topPaperCount.toLocaleString('zh-CN')}</b></div><div><span>2026 全年预测</span><b>≈ {m2026.forecastCount.toLocaleString('zh-CN')}</b></div><p>该领域历史上截至 8 月 26 日通常完成全年发表量的 {(focus.seasonFraction*100).toFixed(1)}%。预测仅用于观察方向。</p></div>
        <div className="journal-list"><div><b>固定高影响期刊池</b><span>基准期 2015—2019</span></div><ol>{focus.topJournals.slice(0,6).map(j=><li key={j.id}><span>{j.name}</span><em>{(j.top10Share*100).toFixed(0)}%</em></li>)}</ol><small>右侧为基准期高被引论文占比；完整 10 本名单包含在数据文件中。</small></div>
      </article>
    </section>

    <section className="method-strip">
      <div><span>01</span><b>规模 40%</b><p>固定期刊池论文数量，经对数压缩后做年度领域百分位。</p></div><div><span>02</span><b>质量 35%</b><p>OpenAlex 同类型、同年份、同子领域归一化引用前 10% 占比。</p></div><div><span>03</span><b>动量 25%</b><p>五年论文复合增长率，加上同期质量变化。</p></div>
    </section>

    <section className="data-bar"><div><p className="kicker">开放数据与复现</p><h2>每个分数，都能回到原始年度指标。</h2><p>当前版本覆盖 {data.meta.fieldCount} 个 OpenAlex Field、{data.meta.startYear}—2026 年。顶刊池固定，避免每年换榜制造假增长。</p></div><div><button className="primary" onClick={downloadCsv}>下载年度 CSV</button><a href="/data/openalex.json" download>下载完整 JSON</a><button onClick={()=>setMethodOpen(true)}>查看方法说明</button></div></section>

    <footer><span>科研兴盛度观测站 · MVP 1.0</span><span>数据：<a href={data.meta.sourceUrl} target="_blank">OpenAlex CC0 ↗</a>　更新：{data.meta.asOf}</span></footer>

    {methodOpen&&<div className="modal-backdrop" onMouseDown={()=>setMethodOpen(false)}><section className="method-modal" role="dialog" aria-modal="true" aria-labelledby="method-title" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setMethodOpen(false)} aria-label="关闭">×</button><p className="kicker">METHODOLOGY / V1.0</p><h2 id="method-title">方法与边界</h2><h3>顶刊如何确定？</h3><p>在每个 Field 内，从 CWTS Core 期刊中筛选 2015—2019 年至少发表 200 篇论文的来源，再按高被引论文占比排序。排序使用 10% 先验、强度 100 的贝叶斯收缩，降低小样本异常。每个领域固定前 10 本，历史上不换榜。</p><h3>质量如何计算？</h3><p>采用 OpenAlex 的 <code>citation_normalized_percentile</code>：按论文类型、发表年份和子领域归一化。页面展示进入前 10% 的论文比例。2024 年之后引用尚未成熟，因此标为暂定。</p><h3>2026 为什么可以展示？</h3><p>实际值截止 {data.meta.asOf}。全年预测使用该领域 2019、2022—2025 年同期发表量占全年比例的中位数进行校正；2020—2021 被排除，以减少疫情期节律异常。</p><h3>哪些结论不能直接下？</h3><p>本工具衡量的是高影响期刊论文生态，不等于全部科研活动。计算机领域的重要会议、人文领域的专著、产业研发和未发表成果可能被低估。综合指数适合发现方向，正式判断应回看数量、质量和期刊池。</p><button className="primary full" onClick={()=>setMethodOpen(false)}>我明白了</button></section></div>}
  </main>;
}
