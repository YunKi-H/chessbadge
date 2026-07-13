import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createAesGcmTokenCipher } from "./token-cipher.js";

test("token cipher encrypts and decrypts with the same context", () => {
  const cipher = createAesGcmTokenCipher(randomBytes(32).toString("base64"));
  const encrypted = cipher.encrypt("secret-token", "chzzk:user-1:access");

  assert.notEqual(encrypted, "secret-token");
  assert.equal(
    cipher.decrypt(encrypted, "chzzk:user-1:access"),
    "secret-token"
  );
});

test("token cipher produces a different ciphertext for the same token", () => {
  const cipher = createAesGcmTokenCipher(randomBytes(32).toString("base64"));

  assert.notEqual(
    cipher.encrypt("secret-token", "chzzk:user-1:access"),
    cipher.encrypt("secret-token", "chzzk:user-1:access")
  );
});

test("token cipher rejects a different encryption context", () => {
  const cipher = createAesGcmTokenCipher(randomBytes(32).toString("base64"));
  const encrypted = cipher.encrypt("secret-token", "chzzk:user-1:access");

  assert.throws(() => cipher.decrypt(encrypted, "chzzk:user-2:access"));
});

test("token cipher requires a 32-byte key", () => {
  assert.throws(
    () => createAesGcmTokenCipher(randomBytes(16).toString("base64")),
    /32-byte key/
  );
});
