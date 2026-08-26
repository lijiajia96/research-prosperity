'use client';

import { useEffect, useMemo, useState } from 'react';
import rawData from './data/openalex.json';

type Status = 'mature' | 'provisional' | 'partial';
type Metric = {
  year: number; status: Status; topPaperCount: number; forecastCount: number;
  fieldPaperCount: number; fieldTopShare: number | null; top10CitedShare: number | null;
  globalShare: number | null; yoyGrowth: number | null; cagr5: number | null;
  qualityChange5: number | null; volumeScore: number; qualityScore: number | null;
  momentumScore: number | null; prosperityScore: number | null;
  socialViews?: number; socialForecastViews?: number; socialShare?: number | null;
  socialAttentionIndex?: number | null; socialScore?: number | null;
  socialYoyGrowth?: number | null; socialCagr5?: number | null; attentionGap?: number | null;
};
type Journal = { id: string; name: string; baselineArticles: number; top10Share: number; selectionScore: number };
type SocialSource = { provider: string; article: string; url: string; language: string; coverage: string; confidence: string };
type Field = { id: number; level: 'field' | 'subfield'; parentField: string | null; name: string; nameEn: string; domain: string; seasonFraction: number; topJournals: Journal[]; metrics: Metric[]; socialSource?: SocialSource };
type Dataset = { meta: { source: string; sourceUrl: string; asOf: string; startYear: number; latestMatureYear: number; latestCompleteVolumeYear: number; fieldCount: number; engineeringSubfieldCount: number; computerScienceSubfieldCount: number; methodVersion: string; note: string; socialAttention?: { status:string; startYear:number; baseline:string; asOf:string; source:string; sourceUrl:string; scope:string; confidence:string; note:string } }; fields: Field[]; engineeringSubfields: Field[]; computerScienceSubfields: Field[] };
const data = rawData as Dataset;

const COLORS = ['#ff6b35','#167d8d','#7357d9','#c14953','#4f7d39','#d08b22','#3466a3','#9d5b8d'];
const colorAt = (index:number) => index<COLORS.length?COLORS[index]:`hsl(${Math.round((index*137.508)%360)} 58% 42%)`;
type MetricKey = 'prosperityScore' | 'topPaperCount' | 'top10CitedShare' | 'cagr5' | 'socialAttentionIndex' | 'socialCagr5' | 'attentionGap';
const METRICS: Record<MetricKey,{label:string;short:string;format:(v:number)=>string}> = {
  prosperityScore:{label:'科研兴盛指数',short:'综合指数',format:v=>v.toFixed(1)},
  topPaperCount:{label:'顶刊论文数量',short:'论文数量',format:v=>Math.round(v).toLocaleString('zh-CN')},
  top10CitedShare:{label:'高被引论文占比',short:'质量',format:v=>`${(v*100).toFixed(1)}%`},
  cagr5:{label:'近五年复合增长',short:'增长动量',format:v=>`${v>=0?'+':''}${(v*100).toFixed(1)}%`},
  socialAttentionIndex:{label:'社会关注度指数（2016—2019=100）',short:'社会关注',format:v=>v.toFixed(1)},
  socialCagr5:{label:'社会关注度近五年复合增长',short:'社会增长',format:v=>`${v>=0?'+':''}${(v*100).toFixed(1)}%`},
  attentionGap:{label:'社会关注排名与科研兴盛度之差',short:'关注差',format:v=>`${v>=0?'+':''}${v.toFixed(1)}`},
};
const score2025 = (field:Field) => field.metrics[25].prosperityScore ?? -Infinity;
const displayScore = (score:number|null) => score===null?'—':score.toFixed(1);

function valueOf(metric: Metric, key: MetricKey) {
  if (key === 'topPaperCount' && metric.year === 2026) return metric.forecastCount;
  const value = metric[key];
  return typeof value === 'number' ? value : null;
}

function pathFor(metrics: Metric[], key: MetricKey, min: number, max: number, startYear:number, endYear:number, width=720, height=300) {
  const points = metrics.map(m => ({x:(m.year-startYear)/(endYear-startYear||1)*width,y:valueOf(m,key)})).filter(p=>p.y!==null) as {x:number;y:number}[];
  return points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${(height-(p.y-min)/(max-min||1)*height).toFixed(1)}`).join(' ');
}

function LineChart({fields,keyName,focusId,onFocus,onToggle}:{fields:Field[];keyName:MetricKey;focusId:number;onFocus:(id:number)=>void;onToggle:(id:number)=>void}) {
  const available=fields.flatMap(f=>f.metrics.map(m=>({year:m.year,value:valueOf(m,keyName)}))).filter((row):row is {year:number;value:number}=>row.value!==null);
  const values=available.map(row=>row.value);
  const startYear=Math.min(...available.map(row=>row.year)), endYear=Math.max(...available.map(row=>row.year));
  const yearSpan=endYear-startYear;
  const yearStep=yearSpan<=6?1:yearSpan<=12?2:5;
  const yearTicks=[startYear,...Array.from({length:Math.floor(yearSpan/yearStep)+1},(_,i)=>Math.ceil(startYear/yearStep)*yearStep+i*yearStep).filter(year=>year>startYear&&year<endYear),endYear].filter((year,index,all)=>all.indexOf(year)===index);
  const forecastStartYear=endYear-1;
  const forecastX=(forecastStartYear-startYear)/(yearSpan||1)*720;
  const rawMin=Math.min(...values), rawMax=Math.max(...values);
  const boundedScore=keyName==='prosperityScore';
  const positiveMetric=keyName==='topPaperCount'||keyName==='top10CitedShare'||keyName==='socialAttentionIndex';
  const symmetricMetric=keyName==='cagr5'||keyName==='socialCagr5'||keyName==='attentionGap';
  const bound=symmetricMetric?Math.max(Math.abs(rawMin),Math.abs(rawMax))*1.15:0;
  const min = boundedScore||positiveMetric ? 0 : symmetricMetric ? -bound : Math.min(0,rawMin*1.15);
  const max = boundedScore ? 100 : symmetricMetric ? (bound||1) : rawMax*1.12 || 1;
  const ticks=[0,1,2,3,4].map(i=>max-(max-min)*i/4);
  return <div className="line-chart-wrap">
    <div className="axis-y">{ticks.map(t=><span key={t}>{METRICS[keyName].format(t)}</span>)}</div>
    <svg className="line-chart" viewBox="0 0 720 300" role="img" aria-label={`${fields.map(f=>f.name).join('、')}的${METRICS[keyName].label}历史曲线`}>
      {ticks.map((_,i)=><line key={i} x1="0" x2="720" y1={i*75} y2={i*75} className="gridline" />)}
      <rect x={forecastX} width={720-forecastX} height="300" className="partial-zone" />
      <line x1={forecastX} x2={forecastX} y1="0" y2="300" className="partial-line" />
      {fields.map((field,index)=>{
        const all=field.metrics; const through2025=all.filter(m=>m.year<=forecastStartYear); const last=all.filter(m=>m.year>=forecastStartYear); const latest=[...all].reverse().find(m=>valueOf(m,keyName)!==null);
        const color=colorAt(index); const active=field.id===focusId;
        return <g key={field.id} className={active?'series active':'series'} onClick={()=>onFocus(field.id)} onDoubleClick={event=>{event.stopPropagation();onToggle(field.id)}} tabIndex={0} role="button" aria-label={`单击高亮${field.name}，双击隐藏`} onKeyDown={e=>{if(e.key==='Enter')onFocus(field.id)}}>
          <path d={pathFor(through2025,keyName,min,max,startYear,endYear)} stroke={color} />
          <path d={pathFor(last,keyName,min,max,startYear,endYear)} stroke={color} className="forecast-path" />
          {latest&&<circle cx={(latest.year-startYear)/(yearSpan||1)*720} cy={300-((valueOf(latest,keyName)??min)-min)/(max-min||1)*300} r={active?5:3.5} fill={color} />}
        </g>;
      })}
    </svg>
    <div className="axis-x">{yearTicks.map((tick,index)=><span key={tick} style={{left:`${(tick-startYear)/(yearSpan||1)*100}%`,transform:index===0?'none':index===yearTicks.length-1?'translateX(-100%)':'translateX(-50%)'}}>{tick}{tick===2026?'*':''}</span>)}</div>
  </div>;
}

function Quadrant({year,focusId,onFocus,units}:{year:number;focusId:number;onFocus:(id:number)=>void;units:Field[]}) {
  const rows=units.map(f=>({field:f,metric:f.metrics.find(m=>m.year===year)!})).filter(r=>r.metric.cagr5!==null&&r.metric.qualityChange5!==null);
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
  const header='unit_id,unit_name,level,parent_field,domain,year,status,top_paper_count,forecast_count,top10_cited_share,cagr_5y,prosperity_score,social_views,social_forecast_views,social_attention_index,social_cagr_5y,attention_gap,social_source_article';
  const rows=[...data.fields,...data.engineeringSubfields,...data.computerScienceSubfields].flatMap(f=>f.metrics.map(m=>[f.id,`"${f.name}"`,f.level,`"${f.parentField||''}"`,`"${f.domain}"`,m.year,m.status,m.topPaperCount,m.forecastCount,m.top10CitedShare??'',m.cagr5??'',m.prosperityScore,m.socialViews??'',m.socialForecastViews??'',m.socialAttentionIndex??'',m.socialCagr5??'',m.attentionGap??'',`"${f.socialSource?.article||''}"`].join(',')));
  const blob=new Blob(['\ufeff'+[header,...rows].join('\n')],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`research-prosperity-${data.meta.asOf}.csv`;a.click();URL.revokeObjectURL(url);
}

export default function Home() {
  const globalRanking=useMemo(()=>[...data.fields].sort((a,b)=>score2025(b)-score2025(a)),[]);
  const [scope,setScope]=useState<'global'|'engineering'|'computer'>('global');
  const initialIds=globalRanking.map(f=>f.id);
  const [metric,setMetric]=useState<MetricKey>('prosperityScore');
  const [selected,setSelected]=useState<number[]>(initialIds);
  const [focusId,setFocusId]=useState(initialIds[0]);
  const [year,setYear]=useState(2025);
  const [methodOpen,setMethodOpen]=useState(false);
  useEffect(()=>{
    const params=new URLSearchParams(location.search); const m=params.get('metric') as MetricKey|null; const f=Number(params.get('field')); const y=Number(params.get('year'));
    const requestedScope=params.get('scope');
    const targetScope=data.engineeringSubfields.some(x=>x.id===f)||requestedScope==='engineering'?'engineering':data.computerScienceSubfields.some(x=>x.id===f)||requestedScope==='computer'?'computer':'global';
    const targetUnits=targetScope==='engineering'?data.engineeringSubfields:targetScope==='computer'?data.computerScienceSubfields:data.fields;
    const targetRanking=[...targetUnits].sort((a,b)=>score2025(b)-score2025(a));
    if(m&&METRICS[m])setMetric(m); setScope(targetScope);
    if(f&&targetUnits.some(x=>x.id===f))setFocusId(f); else setFocusId(targetRanking[0].id);
    setSelected(targetRanking.map(x=>x.id)); if(y>=2005&&y<=2026)setYear(y);
  },[]);
  useEffect(()=>{
    const params=new URLSearchParams({metric,field:String(focusId),year:String(year),scope}); history.replaceState(null,'',`?${params}#trend`);
  },[metric,focusId,year,scope]);
  const units=scope==='global'?data.fields:scope==='engineering'?data.engineeringSubfields:data.computerScienceSubfields;
  const prosperityRanking=useMemo(()=>[...units].sort((a,b)=>score2025(b)-score2025(a)),[units]);
  const ranking2025=useMemo(()=>[...units].sort((a,b)=>(valueOf(b.metrics[25],metric)??-Infinity)-(valueOf(a.metrics[25],metric)??-Infinity)),[units,metric]);
  const shown=units.filter(f=>selected.includes(f.id));
  const focus=units.find(f=>f.id===focusId)??ranking2025[0];
  const m2025=focus.metrics.find(m=>m.year===2025)!; const m2026=focus.metrics.find(m=>m.year===2026)!;
  const rank=focus.metrics[25].prosperityScore===null?null:prosperityRanking.findIndex(f=>f.id===focus.id)+1;
  const socialRanking=[...units].sort((a,b)=>(b.metrics[25].socialAttentionIndex??-Infinity)-(a.metrics[25].socialAttentionIndex??-Infinity));
  const socialRank=m2025.socialAttentionIndex==null?null:socialRanking.findIndex(f=>f.id===focus.id)+1;
  const socialMetric=metric==='socialAttentionIndex'||metric==='socialCagr5'||metric==='attentionGap';
  const toggle=(id:number)=>setSelected(current=>current.includes(id)?(current.length>1?current.filter(x=>x!==id):current):[...current,id]);
  const changeScope=(next:'global'|'engineering'|'computer')=>{const nextUnits=next==='global'?data.fields:next==='engineering'?data.engineeringSubfields:data.computerScienceSubfields;const nextRanking=[...nextUnits].sort((a,b)=>score2025(b)-score2025(a));setScope(next);setSelected(nextRanking.map(f=>f.id));setFocusId(next==='engineering'?(nextUnits.find(f=>f.id===2205)?.id??nextRanking[0].id):next==='computer'?(nextUnits.find(f=>f.id===1702)?.id??nextRanking[0].id):17)};
  const scopeTitle=scope==='global'?'全球科研领域':scope==='engineering'?'工程学 · 16 个子方向':'计算机科学 · 11 个子方向';
  const scopeRankLabel=scope==='global'?'全球领域':scope==='engineering'?'工程方向':'计算机方向';
  const scopeDetailLabel=scope==='global'?'领域详情':scope==='engineering'?'工程学 / 子方向':'计算机科学 / 子方向';

  return <main>
    <header className="topbar">
      <a className="brand" href="#top">科研兴盛度观测站 <span>beta</span></a>
      <nav aria-label="主导航"><a href="#trend">趋势</a><a href="#momentum">兴盛象限</a><button onClick={()=>setMethodOpen(true)}>方法</button><a href={data.meta.sourceUrl} target="_blank">OpenAlex ↗</a></nav>
    </header>

    <section className="hero" id="top">
      <div><p className="eyebrow">GLOBAL RESEARCH PULSE · 2000—2026</p><h1>哪些科学领域，<br/><em>正在真正兴盛？</em></h1><p className="lede">同时观察科研产出与社会关注：固定高影响期刊池衡量规模、质量和增长，公开知识浏览量揭示哪些学科正在进入公众视野。</p></div>
      <div className="freshness"><span className="pulse"/><div><b>更新至 {data.meta.asOf.replaceAll('-','.')}</b><small>2026 年内数据 · 全年预测已校正季节性</small></div></div>
    </section>

    <section className="status-row" aria-label="数据状态说明">
      <div><span className="status mature">成熟</span><b>2000—2023</b><small>数量与引用质量均可比较</small></div>
      <div><span className="status provisional">暂定</span><b>2024—2025</b><small>数量完整，引用质量仍会变化</small></div>
      <div><span className="status partial">年内</span><b>2026</b><small>截至 8 月 26 日；虚线为全年预测</small></div>
    </section>

    <section className="panel trend-panel" id="trend">
      <div className="panel-head"><div><p className="kicker">01 / 长期趋势</p><h2>{scopeTitle}</h2><p>{METRICS[metric].label} · {socialMetric?'公开知识关注代理，数据覆盖等级 C':'单击曲线高亮，双击隐藏；右侧条目可恢复'}</p></div><div className="control-stack"><div className="scope-toggle" aria-label="比较层级"><button className={scope==='global'?'active':''} onClick={()=>changeScope('global')}>全球领域</button><button className={scope==='engineering'?'active':''} onClick={()=>changeScope('engineering')}>拆解工程学</button><button className={scope==='computer'?'active':''} onClick={()=>changeScope('computer')}>拆解计算机</button></div><div className="segmented">{(Object.keys(METRICS) as MetricKey[]).map(k=><button key={k} className={metric===k?'active':''} onClick={()=>setMetric(k)}>{METRICS[k].short}</button>)}</div></div></div>
      <div className="trend-grid">
        <LineChart fields={shown} keyName={metric} focusId={focusId} onFocus={setFocusId} onToggle={toggle}/>
        <aside className="field-picker"><div className="picker-title"><b>2025 {METRICS[metric].short}排名</b><span>{selected.length}/{units.length} 条曲线</span></div>{ranking2025.map((field,index)=>{
          const active=selected.includes(field.id); const rowValue=valueOf(field.metrics[25],metric); return <button key={field.id} className={`${active?'selected ':''}${focusId===field.id?'focused':''}`} onClick={()=>{setFocusId(field.id);toggle(field.id)}}><i style={{background:active?colorAt(shown.findIndex(f=>f.id===field.id)):'#d6d3ca'}}/><span>{index+1}</span><b>{field.name}</b><em>{rowValue==null?'—':METRICS[metric].format(rowValue)}</em></button>;
        })}</aside>
      </div>
      <div className="legend">{shown.map((field,index)=><button key={field.id} className={focusId===field.id?'active':''} onClick={()=>setFocusId(field.id)}><i style={{background:colorAt(index)}}/>{field.name}<span onClick={e=>{e.stopPropagation();toggle(field.id)}} aria-label={`隐藏${field.name}`}>×</span></button>)}<small>* 2026 为预测；圆点表示当前值</small></div>
    </section>

    <section className="split" id="momentum">
      <article className="panel quadrant-panel"><div className="panel-head"><div><p className="kicker">02 / 兴盛象限</p><h2>数量与质量，是否同步上升？</h2><p>{units.length} 个{scopeRankLabel}相互比较；右上区域为双增长</p></div><output>{year}</output></div><Quadrant year={year} focusId={focusId} onFocus={setFocusId} units={units}/><div className="year-control"><span>2005</span><input aria-label="选择年份" type="range" min="2005" max="2026" value={year} onChange={e=>setYear(Number(e.target.value))}/><span>2026</span></div></article>

      <article className="panel detail-panel"><div className="detail-title"><div><p className="kicker">{scopeDetailLabel} · 2025</p><h2>{focus.name}</h2><p>{focus.nameEn} · {focus.domain}</p></div><div className="rank"><span>{scopeRankLabel}排名</span><b>{rank===null?'—':`#${rank}`}</b><small>{rank===null?'期刊池数据不足':`/ ${ranking2025.filter(f=>f.metrics[25].prosperityScore!==null).length}`}</small></div></div>
        <div className="metric-cards"><div><span>顶刊论文</span><b>{m2025.topPaperCount.toLocaleString('zh-CN')}</b><small>2025 完整年度</small></div><div><span>高被引占比</span><b>{((m2025.top10CitedShare||0)*100).toFixed(1)}%</b><small>同年同类同子领域前 10%</small></div><div><span>五年增长</span><b className={(m2025.cagr5||0)>=0?'up':'down'}>{(m2025.cagr5||0)>=0?'+':''}{((m2025.cagr5||0)*100).toFixed(1)}%</b><small>年复合增长率</small></div></div>
        <div className="social-attention-card"><div className="social-card-head"><div><span>社会关注度 · 公开知识代理</span><b>{focus.socialSource?.article||focus.nameEn}</b></div><em>覆盖等级 C</em></div><div className="social-card-grid"><div><span>2025 关注指数</span><b>{m2025.socialAttentionIndex?.toFixed(1)??'—'}</b><small>2016—2019 = 100</small></div><div><span>五年关注增长</span><b className={(m2025.socialCagr5||0)>=0?'up':'down'}>{m2025.socialCagr5==null?'—':`${m2025.socialCagr5>=0?'+':''}${(m2025.socialCagr5*100).toFixed(1)}%`}</b><small>关注份额 CAGR</small></div><div><span>社会—科研差</span><b className={(m2025.attentionGap||0)>=0?'up':'down'}>{m2025.attentionGap==null?'—':`${m2025.attentionGap>=0?'+':''}${m2025.attentionGap.toFixed(1)}`}</b><small>{m2025.attentionGap!=null&&m2025.attentionGap>0?'社会关注领先':'科研兴盛领先'}</small></div><div><span>2025 社会排名</span><b>{socialRank==null?'—':`#${socialRank}`}</b><small>/ {units.length} 个比较单元</small></div></div><p>当前使用固定英文 Wikipedia 词条的用户浏览量，按同层级关注份额校正平台增长。<a href={focus.socialSource?.url} target="_blank">查看来源 ↗</a></p></div>
        <div className="nowcast"><div><span>2026 已收录</span><b>{m2026.topPaperCount.toLocaleString('zh-CN')}</b></div><div><span>2026 全年预测</span><b>≈ {m2026.forecastCount.toLocaleString('zh-CN')}</b></div><p>该领域历史上截至 8 月 26 日通常完成全年发表量的 {(focus.seasonFraction*100).toFixed(1)}%。预测仅用于观察方向。</p></div>
        <div className="journal-list"><div><b>固定高影响期刊池</b><span>基准期 2015—2019 · {focus.topJournals.length} 本</span></div>{focus.topJournals.length?<ol>{focus.topJournals.slice(0,6).map(j=><li key={j.id}><span>{j.name}</span><em>{(j.top10Share*100).toFixed(0)}%</em></li>)}</ol>:<p className="empty-pool">没有来源达到200篇门槛，因此不计算综合排名。</p>}<small>右侧为基准期高被引论文占比；完整名单包含在数据文件中。</small></div>
      </article>
    </section>

    <section className="method-strip">
      <div><span>01</span><b>规模 40%</b><p>固定期刊池论文数量，经对数压缩后做年度领域百分位。</p></div><div><span>02</span><b>质量 35%</b><p>OpenAlex 同类型、同年份、同子领域归一化引用前 10% 占比。</p></div><div><span>03</span><b>动量 25%</b><p>五年论文复合增长率，加上同期质量变化。</p></div><div><span>04</span><b>社会关注</b><p>固定 Wikipedia 词条浏览份额，2016—2019 年均值设为 100。</p></div>
    </section>

    <section className="data-bar"><div><p className="kicker">开放数据与复现</p><h2>每个分数，都能回到原始年度指标。</h2><p>当前版本覆盖 {data.meta.fieldCount} 个一级领域、{data.meta.engineeringSubfieldCount} 个工程子方向和 {data.meta.computerScienceSubfieldCount} 个计算机子方向；同时提供2016年以来的公开知识关注代理数据。论文期刊池固定且统一采用200篇基准门槛。</p></div><div><button className="primary" onClick={downloadCsv}>下载年度 CSV</button><a href="/data/openalex.json" download>下载完整 JSON</a><button onClick={()=>setMethodOpen(true)}>查看方法说明</button></div></section>

    <footer><span>科研兴盛度观测站 · MVP 1.1</span><span>数据：<a href={data.meta.sourceUrl} target="_blank">OpenAlex CC0 ↗</a> · <a href={data.meta.socialAttention?.sourceUrl} target="_blank">Wikimedia Pageviews ↗</a>　更新：{data.meta.asOf}</span></footer>

    {methodOpen&&<div className="modal-backdrop" onMouseDown={()=>setMethodOpen(false)}><section className="method-modal" role="dialog" aria-modal="true" aria-labelledby="method-title" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setMethodOpen(false)} aria-label="关闭">×</button><p className="kicker">METHODOLOGY / V1.3</p><h2 id="method-title">方法与边界</h2><h3>工程学和计算机如何拆分？</h3><p>全球视图保留完整的26个一级领域。工程学使用 Field 22 下的16个 Subfield，计算机科学使用 Field 17 下的11个 Subfield。两个下钻模式分别只在各自的同层级方向之间标准化，不与完整一级领域混排。</p><h3>顶刊如何确定？</h3><p>在每个比较单元内，从 CWTS Core 来源中筛选 2015—2019 年至少发表 200 篇论文的来源，再按高被引论文占比排序。排序使用 10% 先验、强度 100 的贝叶斯收缩。每个单元最多固定10本；符合门槛不足10本时如实减少，不降低门槛补足。</p><h3>社会关注度如何计算？</h3><p>首版使用固定英文 Wikipedia 词条的用户浏览量作为可公开复核的“知识关注代理”。每年先计算该方向在同层级比较单元中的浏览份额，再以其2016—2019年平均份额设为100。“社会—科研差”是社会关注年度百分位减去科研兴盛指数。当前只有一个公开数据通道，因此标记为覆盖等级 C；它不能代表全部媒体、搜索或产业需求。</p><h3>质量如何计算？</h3><p>采用 OpenAlex 的 <code>citation_normalized_percentile</code>：按论文类型、发表年份和子领域归一化。页面展示进入前 10% 的论文比例。2024 年之后引用尚未成熟，因此标为暂定。</p><h3>2026 为什么可以展示？</h3><p>实际值截止 {data.meta.asOf}。全年预测使用该方向 2019、2022—2025 年同期数据占全年比例的中位数进行校正；2020—2021 被排除，以减少疫情期节律异常。</p><h3>哪些结论不能直接下？</h3><p>本工具衡量的是高影响期刊论文生态，不等于全部科研活动。社会关注首版也只是公开知识消费代理，正式判断应结合新闻、搜索、政策与产业数据。尤其计算机科学的重要会议论文可能被当前“期刊论文”口径低估。</p><button className="primary full" onClick={()=>setMethodOpen(false)}>我明白了</button></section></div>}
  </main>;
}
