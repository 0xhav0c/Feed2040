import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET environment variable is required");
  }
  const salt = process.env.ENCRYPTION_SALT || "feed2040-salt";
  return crypto.scryptSync(secret, salt, 32);
}

export async function getAppSetting(key: string): Promise<string | null> {
  try {
    const setting = await prisma.appSettings.findUnique({ where: { key } });
    if (!setting?.value) return null;
    return decrypt(setting.value);
  } catch {
    return null;
  }
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const encrypted = encrypt(value);
  await prisma.appSettings.upsert({
    where: { key },
    create: { key, value: encrypted },
    update: { value: encrypted },
  });
}

export async function deleteAppSetting(key: string): Promise<void> {
  try {
    await prisma.appSettings.delete({ where: { key } });
  } catch {
    // ignore if not found
  }
}

export async function hasAppSetting(key: string): Promise<boolean> {
  const setting = await prisma.appSettings.findUnique({ where: { key } });
  return !!setting?.value;
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
}

function decrypt(data: string): string {
  const key = getEncryptionKey();
  const parts = data.split(":");
  if (parts.length !== 3) return data;
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export const SETTING_KEYS = {
  OPENAI_API_KEY: "openai_api_key",
  ANTHROPIC_API_KEY: "anthropic_api_key",
  OPENAI_MODEL: "openai_model",
  TELEGRAM_BOT_TOKEN: "telegram_bot_token",
} as const;

export type UserApiKeyName = "openaiApiKey" | "anthropicApiKey" | "telegramBotToken";

const SETTING_KEY_TO_COLUMN: Record<string, UserApiKeyName> = {
  [SETTING_KEYS.OPENAI_API_KEY]: "openaiApiKey",
  [SETTING_KEYS.ANTHROPIC_API_KEY]: "anthropicApiKey",
  [SETTING_KEYS.TELEGRAM_BOT_TOKEN]: "telegramBotToken",
};

const COLUMN_TO_SETTING_KEY: Record<UserApiKeyName, string> = {
  openaiApiKey: SETTING_KEYS.OPENAI_API_KEY,
  anthropicApiKey: SETTING_KEYS.ANTHROPIC_API_KEY,
  telegramBotToken: SETTING_KEYS.TELEGRAM_BOT_TOKEN,
};

export function settingKeyToColumn(settingKey: string): UserApiKeyName | null {
  return SETTING_KEY_TO_COLUMN[settingKey] || null;
}

export async function getUserApiKey(
  userId: string,
  keyName: UserApiKeyName
): Promise<string | null> {
  try {
    const record = await prisma.userApiKeys.findUnique({
      where: { userId },
      select: { [keyName]: true },
    });
    const value = record?.[keyName] as string | null | undefined;
    if (!value) return null;
    return decrypt(value);
  } catch {
    return null;
  }
}

export async function setUserApiKey(
  userId: string,
  keyName: UserApiKeyName,
  value: string
): Promise<void> {
  const encrypted = encrypt(value);
  await prisma.userApiKeys.upsert({
    where: { userId },
    create: { userId, [keyName]: encrypted },
    update: { [keyName]: encrypted },
  });
}

export async function deleteUserApiKey(
  userId: string,
  keyName: UserApiKeyName
): Promise<void> {
  try {
    await prisma.userApiKeys.update({
      where: { userId },
      data: { [keyName]: null },
    });
  } catch {
    // ignore if not found
  }
}

export async function getUserOllamaUrl(userId: string): Promise<string | null> {
  try {
    const record = await prisma.userApiKeys.findUnique({
      where: { userId },
      select: { ollamaBaseUrl: true },
    });
    return record?.ollamaBaseUrl || null;
  } catch {
    return null;
  }
}

export async function setUserOllamaUrl(userId: string, url: string): Promise<void> {
  await prisma.userApiKeys.upsert({
    where: { userId },
    create: { userId, ollamaBaseUrl: url },
    update: { ollamaBaseUrl: url },
  });
}

export type BaseUrlName = "openaiBaseUrl" | "anthropicBaseUrl";

export async function getUserBaseUrl(userId: string, field: BaseUrlName): Promise<string | null> {
  try {
    const record = await prisma.userApiKeys.findUnique({
      where: { userId },
      select: { [field]: true },
    });
    const val = record?.[field];
    return (typeof val === "string" ? val : null) || null;
  } catch {
    return null;
  }
}

export async function setUserBaseUrl(userId: string, field: BaseUrlName, url: string | null): Promise<void> {
  await prisma.userApiKeys.upsert({
    where: { userId },
    create: { userId, [field]: url },
    update: { [field]: url },
  });
}

export async function resolveSecretKey(
  userId: string,
  keyName: UserApiKeyName,
  envVarName: string
): Promise<string | null> {
  const userKey = await getUserApiKey(userId, keyName);
  if (userKey) return userKey;

  const settingKey = COLUMN_TO_SETTING_KEY[keyName];
  if (settingKey) {
    const globalKey = await getAppSetting(settingKey);
    if (globalKey) return globalKey;
  }

  return process.env[envVarName] || null;
}

export async function getSecretKey(
  settingKey: string,
  envKey: string
): Promise<string | null> {
  const dbValue = await getAppSetting(settingKey);
  if (dbValue) return dbValue;
  return process.env[envKey] || null;
}
