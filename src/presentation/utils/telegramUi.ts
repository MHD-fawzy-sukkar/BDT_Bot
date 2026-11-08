import { InlineKeyboard } from "grammy";
import { MessageEntity } from "grammy/types";
import { BotContext } from "../context/BotContext";
import { escapeHtml } from "../keyboards/UserMenuKeyboard";

/**
 * Attempts to smoothly edit the current message and gracefully ignores Telegram's
 * "message is not modified" error upon double-clicks.
 * Automatically falls back to sending a new message if editing is not possible.
 */
export async function safeEditOrReply(
  ctx: BotContext,
  text: string,
  keyboard: InlineKeyboard,
  editCurrent = true
): Promise<number | null> {
  if (editCurrent && ctx.callbackQuery?.message) {
    try {
      const edited = await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      await ctx.answerCallbackQuery().catch(() => undefined);
      return typeof edited === "object" && "message_id" in edited
        ? edited.message_id
        : ctx.callbackQuery.message.message_id;
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("message is not modified")) {
        await ctx.answerCallbackQuery().catch(() => undefined);
        return ctx.callbackQuery.message.message_id;
      }
      // If editing fails (e.g. message was deleted or was media), send a new message
    }
  }

  const sent = await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => undefined);
  }
  return sent.message_id;
}

/**
 * Safely deletes a message without throwing if already removed.
 */
export async function tryDeleteMessage(
  ctx: BotContext,
  chatId: number | string,
  messageId: number | null | undefined
): Promise<void> {
  if (!messageId) return;
  try {
    await ctx.api.deleteMessage(chatId, messageId);
  } catch {
    // Ignore error if message was already deleted
  }
}

/**
 * Converts Telegram message text and formatting entities (bold, italic, links, etc.)
 * into valid Telegram HTML format.
 */
export function formatTelegramEntitiesToHtml(
  text: string,
  entities?: MessageEntity[]
): string {
  if (!text) return "";
  if (!entities || entities.length === 0) {
    return escapeHtml(text);
  }

  // Sort entities descending by offset to preserve character indices
  const sorted = [...entities].sort((a, b) => b.offset - a.offset);
  let result = text;

  for (const ent of sorted) {
    const start = ent.offset;
    const end = ent.offset + ent.length;
    const part = result.slice(start, end);
    const escaped = escapeHtml(part);

    let wrapped = escaped;
    if (ent.type === "bold") wrapped = `<b>${escaped}</b>`;
    else if (ent.type === "italic") wrapped = `<i>${escaped}</i>`;
    else if (ent.type === "underline") wrapped = `<u>${escaped}</u>`;
    else if (ent.type === "strikethrough") wrapped = `<s>${escaped}</s>`;
    else if (ent.type === "code") wrapped = `<code>${escaped}</code>`;
    else if (ent.type === "pre") wrapped = `<pre>${escaped}</pre>`;
    else if (ent.type === "text_link" && ent.url) {
      wrapped = `<a href="${escapeHtml(ent.url)}">${escaped}</a>`;
    } else if (ent.type === "spoiler") {
      wrapped = `<tg-spoiler>${escaped}</tg-spoiler>`;
    }

    result = result.slice(0, start) + wrapped + result.slice(end);
  }

  return result;
}
