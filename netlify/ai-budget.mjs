const PAISE_PER_MILLION=1_000_000;
const DEFAULT_MONTHLY_BUDGET_PAISE=15_000;
const DEFAULT_MAX_OUTPUT_TOKENS=600;
const positiveNumber=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:null;};
export function readAiBudgetConfig(env=process.env){
 const selectedModel=String(env.OPENAI_MODEL||"gpt-6-luna").trim();
 const pricedModel=String(env.ATHLETEN_AI_PRICING_MODEL||"").trim();
 const inputPricePerMillionPaise=positiveNumber(env.ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE);
 const outputPricePerMillionPaise=positiveNumber(env.ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE);
 const monthlyBudgetPaise=Number(env.ATHLETEN_AI_MONTHLY_BUDGET_PAISE??DEFAULT_MONTHLY_BUDGET_PAISE);
 const maxOutputTokens=Number(env.ATHLETEN_AI_MAX_OUTPUT_TOKENS??DEFAULT_MAX_OUTPUT_TOKENS);
 if(!pricedModel||pricedModel!==selectedModel||!inputPricePerMillionPaise||!outputPricePerMillionPaise)return null;
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
