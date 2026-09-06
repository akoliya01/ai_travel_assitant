import assert from "node:assert/strict";
import test from "node:test";
import { parseConversionRequest } from "../src/agent/router";

test("parses INR to Singapore dollars using SG alias", () => {
  assert.deepEqual(parseConversionRequest("Convert INR 50,000 to SG"), {
    amount: 50000,
    fromCurrency: "INR",
    toCurrency: "SGD"
  });
});

test("parses currency codes in natural language", () => {
  assert.deepEqual(parseConversionRequest("How much is 200 SGD in INR?"), {
    amount: 200,
    fromCurrency: "SGD",
    toCurrency: "INR"
  });
});

test("does not guess a target currency when it is ambiguous", () => {
  assert.equal(parseConversionRequest("What is the cost of 3 days in Singapore?"), undefined);
});
