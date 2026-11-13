import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAiCostPaise,
  estimateInputTokens,
  readAiBudgetConfig
} from "../netlify/ai-budget.mjs";

const lunaPricing = {
  ATHLETEN_AI_PRICING_MODEL: "gpt-6-luna",
  ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE: "1100",
  ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE: "5500"
};

test("fails closed unless selected model has exact verified prices", () => {
  assert.equal(readAiBudgetConfig({}), null);
  assert.equal(readAiBudgetConfig({
    OPENAI_MODEL: "gpt-6-luna",
    ...lunaPricing,
    ATHLETEN_AI_PRICING_MODEL: "gpt-6.1-sol"
  }), null);
});

test("defaults to GPT-6 Luna and ₹150 monthly budget with reviewed price config", () => {
  const config = readAiBudgetConfig(lunaPricing);
  assert.ok(config);
  assert.equal(config.model, "gpt-6-luna");
  assert.equal(config.inputPricePerMillionPaise, 1100);
  assert.equal(config.outputPricePerMillionPaise, 5500);
  assert.equal(config.monthlyBudgetPaise, 15000);
  assert.equal(config.maxOutputTokens, 600);
});

test("rejects unsafe budget and output token values", () => {
  assert.equal(readAiBudgetConfig({
    ...lunaPricing,
    ATHLETEN_AI_MONTHLY_BUDGET_PAISE: "0"
  }), null);
  assert.equal(readAiBudgetConfig({
    ...lunaPricing,
    ATHLETEN_AI_MAX_OUTPUT_TOKENS: "1501"
  }), null);
});

test("estimates UTF-8 input conservatively", () => {
  assert.equal(estimateInputTokens("abc"), 6);
  assert.equal(estimateInputTokens("🥋"), Buffer.byteLength("🥋", "utf8") * 2);
});

test("rounds token costs upward to paise", () => {
  assert.equal(calculateAiCostPaise(100, 100, 1100, 5500), 1);
  assert.equal(calculateAiCostPaise(0, 0, 1100, 5500), 0);
  assert.throws(() => calculateAiCostPaise(1, 1, 0, 5500), /Verified positive/);
});
