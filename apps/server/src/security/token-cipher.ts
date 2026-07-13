import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_VERSION = "v1";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface TokenCipher {
  encrypt(plaintext: string, context: string): string;
  decrypt(encoded: string, context: string): string;
}

export function createAesGcmTokenCipher(encodedKey: string): TokenCipher {
  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== KEY_LENGTH) {
    throw new Error("CHZZK_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }

  return {
    encrypt(plaintext, context) {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH
      });
      cipher.setAAD(Buffer.from(context, "utf8"));

      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();

      return [
        ENCRYPTION_VERSION,
        iv.toString("base64url"),
        authTag.toString("base64url"),
        ciphertext.toString("base64url")
      ].join(".");
    },

    decrypt(encoded, context) {
      const [version, encodedIv, encodedAuthTag, encodedCiphertext, extra] =
        encoded.split(".");

      if (
        version !== ENCRYPTION_VERSION ||
        !encodedIv ||
        !encodedAuthTag ||
        !encodedCiphertext ||
        extra
      ) {
        throw new Error("Unsupported or malformed encrypted token");
      }

      const iv = Buffer.from(encodedIv, "base64url");
      const authTag = Buffer.from(encodedAuthTag, "base64url");

      if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error("Malformed encrypted token");
      }

      const decipher = createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH
      });
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, "base64url")),
        decipher.final()
      ]).toString("utf8");
    }
  };
}

export function getChzzkTokenCipher(): TokenCipher {
  const encodedKey = process.env.CHZZK_TOKEN_ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error("Missing CHZZK_TOKEN_ENCRYPTION_KEY");
  }

  return createAesGcmTokenCipher(encodedKey);
}
