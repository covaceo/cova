import crypto from "node:crypto";

export function encryptSecret(value) {
  if (!value) {
    return null;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload) {
  if (!payload) {
    return null;
  }

  const [version, iv, tag, encrypted] = String(payload).split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted secret format");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function getEncryptionKey() {
  const raw = process.env.COVA_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing COVA_TOKEN_ENCRYPTION_KEY");
  }

  const key = raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("COVA_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}
