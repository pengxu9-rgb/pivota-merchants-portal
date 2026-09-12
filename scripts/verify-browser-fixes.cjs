const fs = require('fs'), path = require('path'), Module = require('module');
const assert = require('node:assert/strict');
const ts = require('typescript'), React = require('react');
const {renderToStaticMarkup: render} = require('react-dom/server');
function load(relative) {
 const file=path.resolve(relative), m=new Module(file,module); m.filename=file;m.paths=module.paths;
 const original=m.require.bind(m); m.require=id=>id==='@/components/ui/merchant-primitives'?{SurfaceCard:({children})=>React.createElement('section',null,children)}:original(id);
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);return m.exports;
}
const {prepareProductRetest}=load('lib/audit/retest.ts');
assert.equal(prepareProductRetest('', ['butter','brush'], ['detangling']), null);
assert.equal(prepareProductRetest('missing', ['butter','brush'], ['detangling']), null);
assert.equal(prepareProductRetest('brush', ['brush','brush'], ['detangling']), null);
assert.deepEqual(prepareProductRetest('brush',['butter','brush'],[' detangling ','DETANGLING']),{skuKeys:['brush'],customPrompts:['DETANGLING'],consumerQuestions:''});
assert.equal(prepareProductRetest('brush',['brush'],[]),null);
assert.equal(prepareProductRetest('brush',['brush'],Array.from({length:11},(_,i)=>String(i))),null);
const {PromptEvidencePanel}=load('components/audit/PromptEvidencePanel.tsx');
const html=render(React.createElement(PromptEvidencePanel,{report:{opportunity:{per_prompt:[{query:'shop ANUKO',provider_verdicts:{gemini:'win'},appearance_via_listing:true,cited_evidence:{excerpt:'Anko bag at Target; official link https://anukoofficial.com',cited_hosts:['target.com.au']}}]}}}));
assert(html.includes('historical positive'));
assert(!html.includes('— citing'));
assert(html.includes('not verified as sources for this excerpt'));
const {ShareOfVoiceBars}=load('components/audit/ShareOfVoiceBars.tsx');
const sov=render(React.createElement(ShareOfVoiceBars,{summary:{share_of_voice:{available:true,prompts_probed:21,brand:{name:'Anuko',pct:76.2,prompts_cited:16}}}}));
assert(sov.includes('not consumer answer share'));
assert(!sov.includes('who wins'));
console.log('PASS: retest rejects missing/ambiguous products and replaces scope; historical evidence does not assert excerpt-host alignment or verified product presence.');

const {agenticVerdict}=load('lib/audit/agenticVerdict.ts');
for (const discovery of [{total:10}, {total:10,appeared:3}, {total:10,appeared_recommended:3}]) {
  const verdict=agenticVerdict({product_competitiveness:{has_discovery:true,discovery}});
  assert.equal(verdict.label,'Recommendation not measured');
  assert.equal(verdict.tone,'muted');
}
assert.equal(agenticVerdict({product_competitiveness:{has_discovery:true}}).label,"Couldn't measure");
console.log('PASS: missing and positive legacy discovery flags cannot assert a recommendation outcome.');

const {EngineDiscoverySplitChart}=load('components/audit/EngineDiscoverySplitChart.tsx');
const chart=render(React.createElement(EngineDiscoverySplitChart,{reports:[
 {sku_key:'a',product_competitiveness:{by_model:{gemini:{appeared:0,total:10},chatgpt:{total:0,rate:0}}}},
 {sku_key:'b',product_competitiveness:{by_model:{gemini:{appeared:3,total:10}}}},
]}));
assert.equal((chart.match(/Not measured/g)||[]).length,2);
assert(chart.includes('0/10') && chart.includes('3/10'));
assert(!chart.includes('0/0'));
console.log('PASS: zero observations and missing provider results remain unmeasured; measured zero remains 0/10.');

const {comparableMomentumPrior}=load('lib/audit/momentum-baseline.ts');
const previous={run_id:'judydoll',panel_id:'judydoll-product',basis_id:'questions',comparable_with_prev:false};
const current={run_id:'fenty',panel_id:'fenty-product',basis_id:'questions',comparable_with_prev:true};
assert.equal(comparableMomentumPrior({points:[previous,current]},'fenty'),null);
const matched={...current,panel_id:previous.panel_id};
assert.equal(comparableMomentumPrior({points:[previous,matched]},'fenty'),'judydoll');
assert.equal(comparableMomentumPrior({points:[previous,{...matched,basis_id:'new-questions'}]},'fenty'),null);
assert.equal(comparableMomentumPrior({points:[previous,{...matched,comparable_with_prev:false}]},'fenty'),null);
assert.equal(comparableMomentumPrior({points:[previous,{...matched,panel_id:null}]},'fenty'),null);
assert.equal(comparableMomentumPrior({points:[previous,matched]},'missing'),null);
assert.equal(comparableMomentumPrior({points:[previous,matched]},null),null);
assert.equal(comparableMomentumPrior(null,'fenty'),null);
console.log('PASS: cross-product, changed-basis, unknown and missing runs cannot create momentum deltas; a known comparable prior remains available.');
