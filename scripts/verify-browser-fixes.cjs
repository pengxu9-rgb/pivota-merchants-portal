const fs = require('fs'), path = require('path'), Module = require('module');
const assert = require('node:assert/strict');
const ts = require('typescript'), React = require('react');
const {renderToStaticMarkup: render} = require('react-dom/server');
function load(relative) {
 const file=path.resolve(relative), m=new Module(file,module); m.filename=file;m.paths=module.paths;
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
