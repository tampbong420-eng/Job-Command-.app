import assert from "node:assert/strict";
import test from "node:test";
import { accountLast4, validAbaRouting, validDepositAccount } from "./direct-deposit";

test("ABA routing accepts a real checksum and rejects junk", () => {
  assert.equal(validAbaRouting("021000021"), true);
  assert.equal(validAbaRouting("0210-00021"), true);
  assert.equal(validAbaRouting("123456789"), false);
  assert.equal(validAbaRouting("000000000"), false);
  assert.equal(validAbaRouting("12345"), false);
});

test("deposit account is 4 to 17 digits", () => {
  assert.equal(validDepositAccount("1234"), true);
  assert.equal(validDepositAccount("12"), false);
  assert.equal(accountLast4("987654321"), "4321");
});
