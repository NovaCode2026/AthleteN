const PAISE_PER_MILLION=1_000_000;
const DEFAULT_MONTHLY_BUDGET_PAISE=15_000;
const DEFAULT_MAX_OUTPUT_TOKENS=600;
// Conservative, versioned budget rates for the default model. OpenAI's
// published standard rates (checked 2026-11-13) are $0.10 input / $0.50
// output per 1M tokens. These paise rates use ₹100/USD plus a 10% buffer.
const DEFAULT_MODEL_PRICING=Object.freeze({
 "gpt-6-luna":Object.freeze({inputPricePerMillionPaise:1100,outputPricePerMillionPaise:5500})
});
const positiveNumber=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:null;};
export function readAiBudgetConfig(env=process.env){
 const selectedModel=String(env.OPENAI_MODEL||"").trim()||"gpt-6-luna";
 const configuredPricingModel=String(env.ATHLETEN_AI_PRICING_MODEL||"").trim();
 const hasInputOverride=env.ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE!=null&&String(env.ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE).trim()!=="";
 const hasOutputOverride=env.ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE!=null&&String(env.ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE).trim()!=="";
 let inputPricePerMillionPaise,outputPricePerMillionPaise;
 if(hasInputOverride||hasOutputOverride){
  if(!configuredPricingModel||configuredPricingModel!==selectedModel||!hasInputOverride||!hasOutputOverride)return null;
  inputPricePerMillionPaise=positiveNumber(env.ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE);
  outputPricePerMillionPaise=positiveNumber(env.ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE);
 }else{
  if(configuredPricingModel&&configuredPricingModel!==selectedModel)return null;
  const fallback=DEFAULT_MODEL_PRICING[selectedModel];
  if(!fallback)return null;
  inputPricePerMillionPaise=fallback.inputPricePerMillionPaise;
  outputPricePerMillionPaise=fallback.outputPricePerMillionPaise;
 }
 const monthlyBudgetPaise=Number(env.ATHLETEN_AI_MONTHLY_BUDGET_PAISE??DEFAULT_MONTHLY_BUDGET_PAISE);
 const maxOutputTokens=Number(env.ATHLETEN_AI_MAX_OUTPUT_TOKENS??DEFAULT_MAX_OUTPUT_TOKENS);
 if(!inputPricePerMillionPaise||!outputPricePerMillionPaise)return null;
 if(!Number.isSafeInteger(monthlyBudgetPaise)||monthlyBudgetPaise<=0)return null;
 if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<128||maxOutputTokens>1500)return null;
 return {model:selectedModel,inputPricePerMillionPaise,outputPricePerMillionPaise,monthlyBudgetPaise,maxOutputTokens};
}
export function estimateInputTokens(text){return Math.max(1,Buffer.byteLength(String(text??""),"utf8")*2);}
export function calculateAiCostPaise(inputTokens,outputTokens,inputRatePaise,outputRatePaise){
 const input=Math.max(0,Number(inputTokens)||0),output=Math.max(0,Number(outputTokens)||0);
 const inputRate=positiveNumber(inputRatePaise),outputRate=positiveNumber(outputRatePaise);
 if(!inputRate||!outputRate)throw new Error("Verified positive AI token prices are required.");
 const cost=(input*inputRate+output*outputRate)/PAISE_PER_MILLION;
 return cost<=0?0:Math.ceil(cost);
}
