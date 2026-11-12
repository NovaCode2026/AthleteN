import test from "node:test";
import assert from "node:assert/strict";
import {calculateAiCostPaise,estimateInputTokens,readAiBudgetConfig} from "../netlify/ai-budget.mjs";
test("fails closed unless selected model has exact verified prices",()=>{
 assert.equal(readAiBudgetConfig({OPENAI_MODEL:"gpt-4.1-mini"}),null);
 assert.equal(readAiBudgetConfig({OPENAI_MODEL:"gpt-4.1-mini",ATHLETEN_AI_PRICING_MODEL:"gpt-4.1",ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE:"10",ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE:"20"}),null);
});
test("uses ₹150 default platform AI budget",()=>{
 const c=readAiBudgetConfig({OPENAI_MODEL:"gpt-4.1-mini",ATHLETEN_AI_PRICING_MODEL:"gpt-4.1-mini",ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE:"3500",ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE:"14000"});
 assert.ok(c);assert.equal(c.monthlyBudgetPaise,15000);assert.equal(c.maxOutputTokens,600);
});
test("estimates UTF-8 input conservatively",()=>{assert.equal(estimateInputTokens("abc"),6);assert.equal(estimateInputTokens("🥋"),Buffer.byteLength("🥋","utf8")*2);});
test("rounds token costs upward to paise",()=>{assert.equal(calculateAiCostPaise(100,100,3500,14000),2);assert.equal(calculateAiCostPaise(0,0,3500,14000),0);assert.throws(()=>calculateAiCostPaise(1,1,0,10),/Verified positive/);});
