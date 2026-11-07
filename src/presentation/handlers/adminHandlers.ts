import { Composer, InlineKeyboard, InputFile } from "grammy";
import { Message } from "grammy/types";
import { ContentType } from "../../domain/entities/NodeContent";
import { BotContext } from "../context/BotContext";
import {
  buildAddButtonKeyboard,
  buildAdminContentListKeyboard,
  buildAdminMenuKeyboard,
  buildBroadcastContinueKeyboard,
  buildBroadcastPreviewKeyboard,
  buildCancelSessionKeyboard,
  buildClearContentsConfirmKeyboard,
  buildDeleteNodeConfirmKeyboard,
  buildReorderChildrenKeyboard,
  buildStatsKeyboard,
  buildTreeOverviewKeyboard,
  formatAdminMenuText,
  formatBotStatisticsText,
} from "../keyboards/AdminMenuKeyboard";
import { escapeHtml } from "../keyboards/UserMenuKeyboard";
import { adminGuard } from "../middlewares/adminGuard";
import { deliverNodeContents } from "../utils/contentDelivery";
import { SystemLogger } from "../utils/systemLogger";
import { safeEditOrReply, tryDeleteMessage } from "../utils/telegramUi";

export const adminHandlers = new Composer<BotContext>();

/**
 * أمر مساعدة لمعرفة معرف الغروب (Chat ID)
 */
adminHandlers.command("id", async (ctx) => {
  const chatId = ctx.chat?.id ?? "غير معروف";
  const userId = ctx.from?.id ?? "غير معروف";
  const isAdmin = ctx.isAdminContext ? "✅ نعم" : "❌ لا";

  await ctx.reply(
    `🆔 <b>معلومات المعرفات:</b>\n\n` +
      `• <b>معرف الغروب (Chat ID):</b> <code>${chatId}</code>\n` +
      `• <b>معرف حسابك (User ID):</b> <code>${userId}</code>\n` +
      `• <b>مفعل كغروب مشرفين:</b> ${isAdmin}`,
    { parse_mode: "HTML" }
  );
});

// حماية كافة الأوامر والأزرار التالية لتكون حصرياً داخل غروب المشرفين
const protectedAdmin = adminHandlers.use(adminGuard);

async function renderAdminNode(
  ctx: BotContext,
  nodeId: number | null,
  editCurrent = true
): Promise<void> {
  const view = await ctx.services.navigation.getMenuView(nodeId);
  const text = formatAdminMenuText(view);
  const keyboard = buildAdminMenuKeyboard(view);
  await safeEditOrReply(ctx, text, keyboard, editCurrent);
}

async function renderReorderScreen(
  ctx: BotContext,
  parentId: number | null,
  editCurrent = true
): Promise<void> {
  const view = await ctx.services.navigation.getMenuView(parentId);
  const text =
    `↕️ <b>ترتيب الأزرار</b>\n\n` +
    `اضغط (⬆️ للأعلى) أو (⬇️ للأسفل) بجانب أي زر لتغيير مكانه، ثم اضغط <b>حفظ الترتيب والرجوع</b>:`;
  const keyboard = buildReorderChildrenKeyboard(parentId, view.children);
  await safeEditOrReply(ctx, text, keyboard, editCurrent);
}

async function renderContentListScreen(
  ctx: BotContext,
  nodeId: number,
  editCurrent = true
): Promise<void> {
  const view = await ctx.services.navigation.getMenuView(nodeId);
  const lines = [
    `📂 <b>الملفات والرسائل الموجودة داخل «${escapeHtml(
      view.currentNode?.title ?? ""
    )}»:</b>`,
  ];

  if (view.contents.length === 0) {
    lines.push("\n<i>لا توجد ملفات أو رسائل مضافة هنا بعد.</i>");
  } else {
    lines.push(
      "\n• اضغط على اسم الملف لمشاهدته.\n• اضغط (🗑️ حذف) لإزالته من الزر:"
    );
  }

  const keyboard = buildAdminContentListKeyboard(nodeId, view.contents);
  await safeEditOrReply(ctx, lines.join("\n"), keyboard, editCurrent);
}

protectedAdmin.callbackQuery("a:noop", async (ctx) => {
  await ctx.answerCallbackQuery();
});

// 1. أمر تعديل الأزرار والملفات (/admin أو /panel أو كتابة "بانل" أو "لوحة التحكم")
const ADMIN_PANEL_TEXT_REGEX =
  /^(?:\/)?(?:admin|panel|بانل|بانل\s*الادمن|بانل\s*الأدمن|لوحة\s*الادمن|لوحة\s*الأدمن|لوحة\s*التحكم|ادمن|أدمن)$/i;

protectedAdmin.command(["admin", "panel"], async (ctx) => {
  if (ctx.from && ctx.chat) {
    await ctx.services.menuAdmin.clearSession(
      String(ctx.from.id),
      String(ctx.chat.id)
    );
  }
  await renderAdminNode(ctx, null, false);
});

protectedAdmin.hears(ADMIN_PANEL_TEXT_REGEX, async (ctx) => {
  if (ctx.from && ctx.chat) {
    await ctx.services.menuAdmin.clearSession(
      String(ctx.from.id),
      String(ctx.chat.id)
    );
  }
  await renderAdminNode(ctx, null, false);
});

// 2. أمر خريطة شجرة البوت (/tree) - مستقل لوحده
protectedAdmin.command("tree", async (ctx) => {
  const treeText = await ctx.services.navigation.buildFullTreeOverview();
  await safeEditOrReply(ctx, treeText, buildTreeOverviewKeyboard(), false);
});

protectedAdmin.callbackQuery("a:tree", async (ctx) => {
  const treeText = await ctx.services.navigation.buildFullTreeOverview();
  await safeEditOrReply(ctx, treeText, buildTreeOverviewKeyboard(), true);
});

// 3. أمر إحصائيات البوت (/stats) - مستقل لوحده
protectedAdmin.command("stats", async (ctx) => {
  const stats = await ctx.services.statsAndBroadcast.getStatistics();
  await safeEditOrReply(
    ctx,
    formatBotStatisticsText(stats),
    buildStatsKeyboard(),
    false
  );
});

protectedAdmin.callbackQuery("a:stats", async (ctx) => {
  const stats = await ctx.services.statsAndBroadcast.getStatistics();
  await safeEditOrReply(
    ctx,
    formatBotStatisticsText(stats),
    buildStatsKeyboard(),
    true
  );
});

// 5. أمر فحص توبيك السجلات (/test_logs)
protectedAdmin.command("test_logs", async (ctx) => {
  const adminGroupId = ctx.env.ADMIN_GROUP_ID?.trim();
  const topicId = ctx.env.LOGS_TOPIC_ID?.trim();

  if (!topicId) {
    await ctx.reply("❌ لم يتم تحديد LOGS_TOPIC_ID في إعدادات السيرفر.");
    return;
  }

  await SystemLogger.health(
    ctx.api,
    ctx.env,
    "فحص الاتصال بتوبيك السجلات",
    `✅ <b>توبيك السجلات متصل بنجاح!</b>\n\n• الغروب: <code>${adminGroupId}</code>\n• رقم التوبيك: <code>${topicId}</code>\n• التوقيت: <code>${new Date().toISOString()}</code>\n\nكافة تقارير الأعطال والمزامنة والنسخ الاحتياطي ستصل إلى هنا مباشرة.`
  );

  await ctx.reply("✅ تم إرسال رسالة فحص بنجاح إلى توبيك السجلات!");
});

// 6. أمر النسخ الاحتياطي الكامل فوراً (/backup)
protectedAdmin.command("backup", async (ctx) => {
  const statusMsg = await ctx.reply(
    "⏳ جاري توليد وتحزيم النسخة الاحتياطية الكاملة..."
  );

  try {
    const [nodes, contents] = await Promise.all([
      ctx.services.navigation.getAllNodes(),
      ctx.services.contentAdmin.getAllContents(),
    ]);

    const backupData = {
      service: "BDT Telegram Educational Bot",
      exported_at: new Date().toISOString(),
      stats: {
        total_nodes: nodes.length,
        total_contents: contents.length,
      },
      nodes,
      contents,
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `bdt_bot_backup_${dateStr}.json`;
    const fileBytes = new TextEncoder().encode(jsonStr);

    await ctx.replyWithDocument(new InputFile(fileBytes, filename), {
      caption:
        `💾 <b>نسخة احتياطية كاملة لقاعدة بيانات البوت</b>\n\n` +
        `• <b>تاريخ النسخة:</b> <code>${new Date().toISOString()}</code>\n` +
        `• <b>عدد الأقسام والأزرار:</b> <b>${nodes.length}</b>\n` +
        `• <b>عدد الملفات المسجلة:</b> <b>${contents.length}</b>\n\n` +
        `✅ احتفظ بهذا الملف بأمان، يحتوي على كافة معرّفات الشجرة والملفات.`,
      parse_mode: "HTML",
    });

    await tryDeleteMessage(ctx, String(ctx.chat.id), statusMsg.message_id);

    ctx.runInBackground(
      SystemLogger.info(
        ctx.api,
        ctx.env,
        "نسخة احتياطية جديدة",
        `💾 قام المشرف <b>${escapeHtml(
          ctx.from?.first_name ?? "مشرف"
        )}</b> (@${
          ctx.from?.username ?? "بدون_يوزر"
        }) بتوليد نسخة احتياطية كاملة (${nodes.length} زر، ${
          contents.length
        } ملف).`
      )
    );
  } catch (err) {
    await ctx.reply(`❌ فشل توليد النسخة الاحتياطية: ${String(err)}`);
    ctx.runInBackground(
      SystemLogger.error(ctx.api, ctx.env, "فشل إنشاء النسخة الاحتياطية", err)
    );
  }
});

// 7. أمر مزامنة ونقل الأرشيف إلى قناة المستودع الدائم (/sync_vault)
protectedAdmin.command("sync_vault", async (ctx) => {
  const storageChannelId = ctx.env.STORAGE_CHANNEL_ID?.trim();
  if (!storageChannelId) {
    await ctx.reply("❌ لم يتم ضبط معرف قناة التخزين STORAGE_CHANNEL_ID.");
    return;
  }

  const allContents = await ctx.services.contentAdmin.getAllContents();
  const pending = allContents.filter(
    (c) => c.sourceChatId !== storageChannelId
  );

  if (pending.length === 0) {
    await ctx.reply(
      `✅ <b>جميع ملفات البوت (${allContents.length} ملف) مؤمنة ومربوطة بالفعل داخل قناة المستودع الدائم!</b>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const kb = new InlineKeyboard()
    .text(`🚀 بدء نقل الـ ${pending.length} ملف الآن`, "a:vault_start:0")
    .row();

  await ctx.reply(
    `📦 <b>نظام مزامنة وتأمين الملفات في قناة المستودع</b>\n\n` +
      `• إجمالي الملفات في البوت: <b>${allContents.length}</b>\n` +
      `• الملفات المتبقي نقلها للمستودع: <b>${pending.length}</b>\n` +
      `• قناة المستودع الهدف: <code>${storageChannelId}</code>\n\n` +
      `سيتم النقل على دفعات آمنة ومنظمة مع إرسال تقارير حية ومباشرة في توبيك السجلات لمراقبة التقدم لحظياً.\n\n` +
      `اضغط الزر بالأسفل للبدء 👇`,
    { parse_mode: "HTML", reply_markup: kb }
  );
});

protectedAdmin.callbackQuery(/^a:vault_start:(\d+)$/, async (ctx) => {
  const storageChannelId = ctx.env.STORAGE_CHANNEL_ID?.trim();
  if (!storageChannelId) {
    await ctx.answerCallbackQuery({
      text: "قناة المستودع غير معرّفة",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({ text: "⏳ جاري نقل الدفعة..." });

  const allContents = await ctx.services.contentAdmin.getAllContents();
  const pending = allContents.filter(
    (c) => c.sourceChatId !== storageChannelId
  );

  if (pending.length === 0) {
    await safeEditOrReply(
      ctx,
      `🎉 <b>اكتملت مزامنة وتأمين كامل الأرشيف (${allContents.length} ملف) بنجاح 100%!</b>\n\nجميع الملفات أصبحت ثابتة ومحمية داخل قناة المستودع الدائم للأبد.`,
      new InlineKeyboard(),
      true
    );
    ctx.runInBackground(
      SystemLogger.info(
        ctx.api,
        ctx.env,
        "اكتملت مزامنة الأرشيف بالكامل",
        `🎉 تم بنجاح نقل وتأمين جميع ملفات البوت (${allContents.length} ملف) داخل قناة المستودع الدائم <code>${storageChannelId}</code> وتحديث قاعدة البيانات بالكامل.`
      )
    );
    return;
  }

  const batchSize = 25;
  const currentBatch = pending.slice(0, batchSize);

  let successCount = 0;
  let failCount = 0;

  for (const item of currentBatch) {
    try {
      let newMsgId: number | null = null;
      // 1. محاولة النسخ من الرسالة الأصلية
      try {
        const copied = await ctx.api.copyMessage(
          storageChannelId,
          item.sourceChatId,
          item.sourceMessageId
        );
        newMsgId = copied.message_id;
      } catch {
        // 2. إذا فشل النسخ، نرسل عبر file_id الاحتياطي
        if (item.fileId) {
          const caption = item.caption ?? undefined;
          let sent: any;
          switch (item.contentType) {
            case "video":
              sent = await ctx.api.sendVideo(storageChannelId, item.fileId, {
                caption,
              });
              break;
            case "audio":
              sent = await ctx.api.sendAudio(storageChannelId, item.fileId, {
                caption,
              });
              break;
            case "voice":
              sent = await ctx.api.sendVoice(storageChannelId, item.fileId, {
                caption,
              });
              break;
            case "photo":
              sent = await ctx.api.sendPhoto(storageChannelId, item.fileId, {
                caption,
              });
              break;
            default:
              sent = await ctx.api.sendDocument(
                storageChannelId,
                item.fileId,
                { caption }
              );
              break;
          }
          if (sent && "message_id" in sent) {
            newMsgId = sent.message_id;
          }
        }
      }

      if (newMsgId) {
        await ctx.services.contentAdmin.updateContentSource(
          item.id,
          storageChannelId,
          newMsgId
        );
        successCount++;
      } else {
        failCount++;
      }
    } catch (itemErr) {
      failCount++;
      console.warn(`[VaultSync] Failed item #${item.id}:`, itemErr);
    }
  }

  const remaining = pending.length - successCount;
  const totalTransferred = allContents.length - remaining;

  // إرسال تقرير الدفعة في توبيك السجلات
  ctx.runInBackground(
    SystemLogger.info(
      ctx.api,
      ctx.env,
      "تقدم مزامنة الأرشيف",
      `📦 تم نقل دفعة جديدة (${successCount} ملف).\n• الإجمالي المنقول حتى الآن: <b>${totalTransferred} / ${allContents.length}</b>\n• المتبقي: <b>${remaining}</b>`
    )
  );

  if (remaining <= 0) {
    await safeEditOrReply(
      ctx,
      `🎉 <b>اكتملت مزامنة وتأمين كامل الأرشيف (${allContents.length} ملف) بنجاح 100%!</b>\n\nجميع الملفات أصبحت ثابتة ومحمية داخل قناة المستودع الدائم للأبد.`,
      new InlineKeyboard(),
      true
    );
    return;
  }

  const nextKb = new InlineKeyboard()
    .text(
      `▶️ متابعة نقل الدفعة التالية (${remaining} متبقي)`,
      "a:vault_start:0"
    )
    .row();

  await safeEditOrReply(
    ctx,
    `⏳ <b>جاري نقل وتأمين الملفات في المستودع...</b>\n\n` +
      `• تم نقل وتثبيت: <b>${totalTransferred}</b> من أصل <b>${allContents.length}</b> ملف.\n` +
      `• المتبقي الآن: <b>${remaining}</b> ملف.\n\n` +
      `<i>(يمكنك مراقبة التقارير الحية في توبيك السجلات)</i>\n\n` +
      `اضغط للمتابعة 👇`,
    nextKb,
    true
  );
});

// 4. أمر الإذاعة العامة (/broadcast) - يعمل حصراً بالرد (Reply) على رسالة البوت!
protectedAdmin.command("broadcast", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;

  const sent = await ctx.reply(
    `📢 <b>إرسال رسالة عامة لكل طلاب البوت</b>\n\n` +
      `👈 <b>قم بالرد (Reply) على هذه الرسالة تحديداً</b> وأرسل الكليشة أو الصورة أو الملف الذي تريد إرساله للطلاب.\n\n` +
      `<i>(ملاحظة: لن يلتقط البوت أي رسالة في الغروب إلا إذا قمت بعمل رد Reply على هذه الرسالة).</i>`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("❌ إلغاء", "a:bc_abort"),
    }
  );

  await ctx.services.menuAdmin.setSession(
    String(ctx.from.id),
    String(ctx.chat.id),
    "BROADCAST",
    null,
    sent.message_id
  );
});

protectedAdmin.callbackQuery("a:bc_abort", async (ctx) => {
  if (ctx.from && ctx.chat) {
    await ctx.services.menuAdmin.clearSession(
      String(ctx.from.id),
      String(ctx.chat.id)
    );
  }
  if (ctx.chat && ctx.callbackQuery.message) {
    await tryDeleteMessage(ctx, ctx.chat.id, ctx.callbackQuery.message.message_id);
  }
  await ctx.answerCallbackQuery({ text: "تم إلغاء الإذاعة." });
});

protectedAdmin.command(["cancel", "done"], async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  const session = await ctx.services.menuAdmin.getSession(
    String(ctx.from.id),
    String(ctx.chat.id)
  );
  await tryDeleteMessage(ctx, ctx.chat.id, session?.panelMessageId);
  await ctx.services.menuAdmin.clearSession(
    String(ctx.from.id),
    String(ctx.chat.id)
  );
  await renderAdminNode(ctx, session?.targetNodeId ?? null, false);
});

// ════════════════════════════════════════════════════════════════════
// 📢 أزرار التحكم بالرسالة العامة (Broadcast) بعد معاينتها
// ════════════════════════════════════════════════════════════════════

// زر "تعديل الرسالة" قبل إرسالها
protectedAdmin.callbackQuery(/^a:bc_edit:(\d+)$/, async (ctx) => {
  const previewMessageId = Number(ctx.match[1]);
  if (!ctx.from || !ctx.chat) return;

  await tryDeleteMessage(ctx, ctx.chat.id, previewMessageId);

  const msgId = await safeEditOrReply(
    ctx,
    `✏️ <b>تعديل الرسالة العامة</b>\n\n` +
      `👈 <b>قم بالرد (Reply) على هذه الرسالة</b> وأرسل الرسالة أو الصورة الجديدة بعد تعديلها:`,
    new InlineKeyboard().text("❌ إلغاء", "a:bc_abort"),
    true
  );

  await ctx.services.menuAdmin.setSession(
    String(ctx.from.id),
    String(ctx.chat.id),
    "BROADCAST",
    null,
    msgId
  );
});

// زر "إلغاء وحذف"
protectedAdmin.callbackQuery(/^a:bc_del:(\d+)$/, async (ctx) => {
  const previewMessageId = Number(ctx.match[1]);
  if (!ctx.from || !ctx.chat) return;

  await tryDeleteMessage(ctx, ctx.chat.id, previewMessageId);
  await tryDeleteMessage(ctx, ctx.chat.id, ctx.callbackQuery.message?.message_id);
  await ctx.services.menuAdmin.clearSession(
    String(ctx.from.id),
    String(ctx.chat.id)
  );

  await ctx.answerCallbackQuery({
    text: "🗑️ تم حذف الرسالة وإلغاء الإرسال.",
  });
});

// زر "نعم، أرسلها للجميع الآن"
protectedAdmin.callbackQuery(/^a:bc_go:(\d+):(\d+):(\d+)$/, async (ctx) => {
  const sourceMessageId = Number(ctx.match[1]);
  const previewMessageId = Number(ctx.match[2]);
  const offset = Number(ctx.match[3]);

  if (!ctx.chat) return;
  const chatId = String(ctx.chat.id);

  const recipients =
    await ctx.services.statsAndBroadcast.getActiveRecipientIds();

  if (recipients.length === 0) {
    await ctx.answerCallbackQuery({
      text: "لا يوجد طلاب مشتركين في البوت حالياً.",
      show_alert: true,
    });
    if (previewMessageId > 0) {
      await tryDeleteMessage(ctx, chatId, previewMessageId);
    }
    return;
  }

  await ctx.answerCallbackQuery({
    text: "⏳ جاري الإرسال للطلاب...",
  });

  const chunkLimit = 35;
  const currentSlice = recipients.slice(offset, offset + chunkLimit);

  let sentInChunk = 0;
  let failedInChunk = 0;

  const parallelSize = 15;
  for (let i = 0; i < currentSlice.length; i += parallelSize) {
    const subBatch = currentSlice.slice(i, i + parallelSize);
    await Promise.all(
      subBatch.map(async (recipientId) => {
        try {
          await ctx.api.copyMessage(recipientId, chatId, sourceMessageId);
          sentInChunk++;
        } catch (err) {
          failedInChunk++;
          const errStr = String(err);
          if (
            errStr.includes("403") ||
            errStr.includes("blocked") ||
            errStr.includes("deactivated")
          ) {
            await ctx.services.statsAndBroadcast
              .markUserBlocked(recipientId)
              .catch(() => undefined);
          }
        }
      })
    );
  }

  const nextOffset = offset + currentSlice.length;

  if (nextOffset < recipients.length) {
    await safeEditOrReply(
      ctx,
      `⏳ <b>جاري إرسال الرسالة للطلاب...</b>\n\n` +
        `وصلت حتى الآن إلى <b>${nextOffset}</b> من أصل <b>${recipients.length}</b> طالب.\n` +
        `اضغط الزر بالأسفل لإكمال الإرسال لباقي الطلاب 👇`,
      buildBroadcastContinueKeyboard(
        sourceMessageId,
        nextOffset,
        recipients.length
      ),
      true
    );
    return;
  }

  await safeEditOrReply(
    ctx,
    `✅ <b>تم إرسال الرسالة للطلاب بنجاح!</b>\n\n` +
      `• وصلت إلى: <b>${sentInChunk + offset}</b> طالب`,
    new InlineKeyboard(),
    true
  );
});

// ════════════════════════════════════════════════════════════════════
// 🛠️ التنقل وتعديل الأزرار والملفات
// ════════════════════════════════════════════════════════════════════

protectedAdmin.callbackQuery("a:root", async (ctx) => {
  if (ctx.from && ctx.chat) {
    await ctx.services.menuAdmin.clearSession(
      String(ctx.from.id),
      String(ctx.chat.id)
    );
  }
  await renderAdminNode(ctx, null, true);
});

protectedAdmin.callbackQuery(/^a:nav:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  if (ctx.from && ctx.chat) {
    await ctx.services.menuAdmin.clearSession(
      String(ctx.from.id),
      String(ctx.chat.id)
    );
  }
  await renderAdminNode(ctx, nodeId, true);
});

protectedAdmin.callbackQuery(/^a:cancel:(.+)$/, async (ctx) => {
  const backTarget = ctx.match[1];
  if (ctx.from && ctx.chat) {
    await ctx.services.menuAdmin.clearSession(
      String(ctx.from.id),
      String(ctx.chat.id)
    );
  }

  if (backTarget === "a:root") {
    await renderAdminNode(ctx, null, true);
  } else if (backTarget.startsWith("a:nav:")) {
    const nodeId = Number(backTarget.replace("a:nav:", ""));
    await renderAdminNode(ctx, nodeId, true);
  } else {
    await renderAdminNode(ctx, null, true);
  }
});

// 1. إضافة زر جديد (مع اختيار موضعه: طبيعي مع زر جنبه أو بسطر لحاله)
protectedAdmin.callbackQuery(
  /^a:add_btn:(root|\d+)(?::(0|1))?$/,
  async (ctx) => {
    const rawTarget = ctx.match[1];
    const isFullWidth = ctx.match[2] === "1";
    const targetNodeId = rawTarget === "root" ? null : Number(rawTarget);

    if (!ctx.from || !ctx.chat) return;

    const layoutLabel = isFullWidth
      ? "بسطر لحاله"
      : "طبيعي (مع زر جنبه)";

    const msgId = await safeEditOrReply(
      ctx,
      `➕ <b>إضافة زر جديد</b>\n` +
        `📐 <b>موضع الزر المختار:</b> ${layoutLabel}\n\n` +
        `👈 <b>قم بالرد (Reply) على هذه الرسالة</b> واكتب اسم الزر الذي تريد إضافته.\n` +
        `<i>(يمكنك تغيير موضع الزر من الزرين بالأسفل قبل إرسال الاسم)</i>`,
      buildAddButtonKeyboard(targetNodeId, isFullWidth),
      true
    );

    await ctx.services.menuAdmin.setSession(
      String(ctx.from.id),
      String(ctx.chat.id),
      isFullWidth ? "ADD_CHILD_NODE_FULL" : "ADD_CHILD_NODE",
      targetNodeId,
      msgId
    );
  }
);

// تبديل موضع زر موجود حالياً (بين طبيعي وبسطر لحاله) بضغطة واحدة
protectedAdmin.callbackQuery(/^a:width:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  const updated = await ctx.services.menuAdmin.toggleNodeFullWidth(nodeId);
  await ctx.answerCallbackQuery({
    text: updated.isFullWidth
      ? "✅ أصبح الزر بسطر لحاله"
      : "✅ أصبح الزر طبيعياً (مع زر جنبه)",
  });
  await renderAdminNode(ctx, nodeId, true);
});

// تبديل موضع الزر من داخل شاشة الترتيب مباشرةً
protectedAdmin.callbackQuery(/^a:ro_width:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  const updated = await ctx.services.menuAdmin.toggleNodeFullWidth(nodeId);
  await ctx.answerCallbackQuery({
    text: updated.isFullWidth
      ? "✅ أصبح بسطر لحاله"
      : "✅ أصبح مع زر جنبه",
  });
  await renderReorderScreen(ctx, updated.parentId, true);
});

// 2. ترتيب الأزرار
protectedAdmin.callbackQuery(/^a:ro_menu:(root|\d+)$/, async (ctx) => {
  const rawTarget = ctx.match[1];
  const parentId = rawTarget === "root" ? null : Number(rawTarget);
  await renderReorderScreen(ctx, parentId, true);
});

protectedAdmin.callbackQuery(/^a:ro_(up|down):(\d+)$/, async (ctx) => {
  const direction = ctx.match[1] as "up" | "down";
  const nodeId = Number(ctx.match[2]);

  const movedNode = await ctx.services.menuAdmin.moveNodeOrder(
    nodeId,
    direction
  );
  await ctx.answerCallbackQuery();
  await renderReorderScreen(ctx, movedNode.parentId, true);
});

// 3. تغيير اسم الزر
protectedAdmin.callbackQuery(/^a:ren:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  if (!ctx.from || !ctx.chat) return;

  const view = await ctx.services.navigation.getMenuView(nodeId);
  const msgId = await safeEditOrReply(
    ctx,
    `✏️ <b>تغيير اسم زر «${escapeHtml(
      view.currentNode?.title ?? ""
    )}»</b>\n\n` +
      `👈 <b>قم بالرد (Reply) على هذه الرسالة</b> واكتب الاسم الجديد الذي تريده:`,
    buildCancelSessionKeyboard(nodeId, false),
    true
  );

  await ctx.services.menuAdmin.setSession(
    String(ctx.from.id),
    String(ctx.chat.id),
    "RENAME_NODE",
    nodeId,
    msgId
  );
});

// 4. حذف الزر
protectedAdmin.callbackQuery(/^a:del_ask:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  const view = await ctx.services.navigation.getMenuView(nodeId);

  await safeEditOrReply(
    ctx,
    `⚠️ هل أنت متأكد أنك تريد حذف زر <b>«${escapeHtml(
      view.currentNode?.title ?? ""
    )}»</b> مع كل ما بداخله؟`,
    buildDeleteNodeConfirmKeyboard(nodeId),
    true
  );
});

protectedAdmin.callbackQuery(/^a:del_yes:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  const parentId = await ctx.services.menuAdmin.deleteNode(nodeId);
  await ctx.answerCallbackQuery({
    text: "✅ تم حذف الزر.",
  });
  await renderAdminNode(ctx, parentId, true);
});

// 5. إضافة ملفات أو رسائل داخل الزر
protectedAdmin.callbackQuery(/^a:add_cnt:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  if (!ctx.from || !ctx.chat) return;

  const view = await ctx.services.navigation.getMenuView(nodeId);

  // إذا كان الزر مجلداً ولديه أزرار فرعية، نوضح للمشرف طريقة ظهور الملفات العامة
  const folderNote =
    view.children.length > 0
      ? `\n\n💡 <i>ملاحظة: هذا القسم يحتوي على أزرار فرعية. ستظهر هذه الملفات كـ «ملفات عامة للقسم» مع زر مخصص لها فوق الأزرار الفرعية.</i>`
      : "";

  const msgId = await safeEditOrReply(
    ctx,
    `📎 <b>إضافة ملفات أو رسائل داخل «${escapeHtml(
      view.currentNode?.title ?? ""
    )}»</b>\n\n` +
      `أرسل أو حوّل إلى هنا مباشرةً أي ملفات أو صور أو صوتيات أو رسائل نصية تريد وضعها في هذا الزر.${folderNote}\n\n` +
      `وعندما تنتهي اضغط على الزر بالأسفل 👇`,
    buildCancelSessionKeyboard(nodeId, true),
    true
  );

  await ctx.services.menuAdmin.setSession(
    String(ctx.from.id),
    String(ctx.chat.id),
    "ADD_CONTENT",
    nodeId,
    msgId
  );
});

// 6. استعراض وحذف وترتيب الملفات الموجودة في الزر
protectedAdmin.callbackQuery(/^a:list_cnt:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  if (ctx.from && ctx.chat) {
    await ctx.services.menuAdmin.clearSession(
      String(ctx.from.id),
      String(ctx.chat.id)
    );
  }
  await renderContentListScreen(ctx, nodeId, true);
});

protectedAdmin.callbackQuery(/^a:cnt_(up|down):(\d+)$/, async (ctx) => {
  const direction = ctx.match[1] as "up" | "down";
  const contentId = Number(ctx.match[2]);

  const moved = await ctx.services.contentAdmin.moveContentOrder(
    contentId,
    direction
  );
  await ctx.answerCallbackQuery();
  await renderContentListScreen(ctx, moved.nodeId, true);
});

protectedAdmin.callbackQuery(/^a:del_cnt:(\d+)$/, async (ctx) => {
  const contentId = Number(ctx.match[1]);
  if (ctx.from && ctx.chat) {
    await ctx.services.menuAdmin.clearSession(
      String(ctx.from.id),
      String(ctx.chat.id)
    );
  }
  const deleted = await ctx.services.contentAdmin.deleteContentItem(contentId);

  await ctx.answerCallbackQuery({
    text: "✅ تم حذف الملف.",
  });

  await renderContentListScreen(ctx, deleted.nodeId, true);
});

protectedAdmin.callbackQuery(/^a:clr_cnt_ask:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  if (ctx.from && ctx.chat) {
    await ctx.services.menuAdmin.clearSession(
      String(ctx.from.id),
      String(ctx.chat.id)
    );
  }
  const view = await ctx.services.navigation.getMenuView(nodeId);

  await safeEditOrReply(
    ctx,
    `⚠️ هل أنت متأكد أنك تريد حذف كل الملفات الموجودة داخل <b>«${escapeHtml(
      view.currentNode?.title ?? ""
    )}»</b>؟`,
    buildClearContentsConfirmKeyboard(nodeId),
    true
  );
});

protectedAdmin.callbackQuery(/^a:clr_cnt_yes:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  await ctx.services.contentAdmin.clearAllNodeContents(nodeId);
  await ctx.answerCallbackQuery({
    text: "✅ تم حذف الملفات.",
  });
  await renderAdminNode(ctx, nodeId, true);
});

// مشاهدة ملف واحد عند الضغط على اسمه في قائمة الملفات
protectedAdmin.callbackQuery(/^a:prev_item:(\d+)$/, async (ctx) => {
  const contentId = Number(ctx.match[1]);
  const item = await ctx.services.contentAdmin.getContentById(contentId);

  if (!item || !ctx.chat) {
    await ctx.answerCallbackQuery({
      text: "الملف غير موجود.",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  await deliverNodeContents(ctx, ctx.chat.id, [item]);
});

// ════════════════════════════════════════════════════════════════════
// 💬 استقبال الرسائل والملفات من المشرف
// ════════════════════════════════════════════════════════════════════

protectedAdmin.on("message", async (ctx, next) => {
  if (!ctx.from || !ctx.chat || !ctx.message) {
    return next();
  }

  if (ctx.message.text?.startsWith("/")) {
    return next();
  }

  const userId = String(ctx.from.id);
  const chatId = String(ctx.chat.id);
  const session = await ctx.services.menuAdmin.getSession(userId, chatId);

  if (!session || session.action === "IDLE") {
    return next();
  }

  // في حالة إضافة المحتوى (الملفات والرسائل): يلتقط البوت الملفات والرسائل المحوّلة مباشرةً بدون الحاجة لعمل Reply
  // أما في باقي الحالات (إضافة زر، تغيير اسم، إذاعة): يشترط الرد على رسالة البوت منعاً لالتقاط محادثات الأعضاء في الغروب
  if (session.action !== "ADD_CONTENT") {
    const repliedTo = ctx.message.reply_to_message;
    const isReplyToTargetMessage =
      session.panelMessageId !== null &&
      repliedTo?.message_id === session.panelMessageId;
    const isReplyToBot = repliedTo?.from?.is_bot ?? false;

    if (!isReplyToTargetMessage && !isReplyToBot) {
      return next();
    }
  }

  // 1. حالة الإذاعة العامة (/broadcast):
  if (session.action === "BROADCAST") {

    await tryDeleteMessage(ctx, chatId, session.panelMessageId);
    await ctx.services.menuAdmin.clearSession(userId, chatId);

    const stats = await ctx.services.statsAndBroadcast.getStatistics();

    // نسخ الرسالة لعرضها للمشرف
    const copiedPreview = await ctx.api.copyMessage(
      chatId,
      chatId,
      ctx.message.message_id
    );

    await ctx.reply(
      `👆 <b>هذه هي الرسالة التي ستصل للطلاب.</b>\n` +
        `هل هي جاهزة للإرسال؟`,
      {
        parse_mode: "HTML",
        reply_markup: buildBroadcastPreviewKeyboard(
          ctx.message.message_id,
          copiedPreview.message_id,
          stats.activeUsers
        ),
      }
    );
    return;
  }

  // 2. حالة إضافة زر جديد (طبيعي أو بسطر لحاله)
  if (
    session.action === "ADD_CHILD_NODE" ||
    session.action === "ADD_CHILD_NODE_FULL"
  ) {
    if (!ctx.message.text) {
      await ctx.reply("يرجى إرسال اسم الزر كتابةً.");
      return;
    }

    const isFullWidth = session.action === "ADD_CHILD_NODE_FULL";
    await ctx.services.menuAdmin.addChildNodesFromText(
      session.targetNodeId,
      ctx.message.text,
      isFullWidth
    );

    await tryDeleteMessage(ctx, chatId, session.panelMessageId);
    await ctx.services.menuAdmin.clearSession(userId, chatId);

    await renderAdminNode(ctx, session.targetNodeId, false);
    return;
  }

  // 3. حالة تغيير اسم الزر
  if (session.action === "RENAME_NODE" && session.targetNodeId !== null) {
    if (!ctx.message.text) {
      await ctx.reply("يرجى إرسال الاسم الجديد كتابةً.");
      return;
    }

    await ctx.services.menuAdmin.renameNode(
      session.targetNodeId,
      ctx.message.text
    );

    await tryDeleteMessage(ctx, chatId, session.panelMessageId);
    await ctx.services.menuAdmin.clearSession(userId, chatId);

    await renderAdminNode(ctx, session.targetNodeId, false);
    return;
  }

  // 4. حالة إضافة ملفات أو رسائل داخل الزر
  if (session.action === "ADD_CONTENT" && session.targetNodeId !== null) {
    const extracted = extractMessageMetadata(ctx.message);
    if (!extracted) {
      await ctx.reply(
        "يرجى إرسال ملف أو صورة أو فيديو أو تسجيل صوتي أو رسالة نصية."
      );
      return;
    }

    let finalSourceChatId = chatId;
    let finalSourceMessageId = ctx.message.message_id;

    // تأمين ونسخ فوري للملف داخل قناة المستودع الدائم
    const storageChannelId = ctx.env.STORAGE_CHANNEL_ID?.trim();
    if (storageChannelId && storageChannelId.length > 0) {
      try {
        const vaultCopy = await ctx.api.copyMessage(
          storageChannelId,
          chatId,
          ctx.message.message_id
        );
        finalSourceChatId = storageChannelId;
        finalSourceMessageId = vaultCopy.message_id;
      } catch (vaultErr) {
        console.warn(
          "[VaultStorage] Failed to copy incoming file to vault channel:",
          vaultErr
        );
      }
    }

    const saved = await ctx.services.contentAdmin.attachContent({
      nodeId: session.targetNodeId,
      contentType: extracted.contentType,
      sourceChatId: finalSourceChatId,
      sourceMessageId: finalSourceMessageId,
      fileId: extracted.fileId,
      title: extracted.title,
      caption: extracted.caption,
      isForwarded: extracted.isForwarded,
    });

    // تسجيل في توبيك السجلات
    ctx.runInBackground(
      SystemLogger.info(
        ctx.api,
        ctx.env,
        "إضافة محتوى جديد",
        `📥 قام المشرف <b>${escapeHtml(
          ctx.from?.first_name ?? "مشرف"
        )}</b> بإضافة ملف جديد: <b>«${escapeHtml(
          saved.title
        )}»</b> إلى القسم <code>#${session.targetNodeId}</code> وتم تأمينه في المستودع.`
      )
    );

    const allContents = await ctx.services.contentAdmin.getContents(
      session.targetNodeId
    );

    await tryDeleteMessage(ctx, chatId, session.panelMessageId);

    const typeBadge = extracted.isForwarded
      ? " <i>(محوّلة بالاسم الأصلي ↗️)</i>"
      : " <i>(باسم البوت 🤖)</i>";

    const statusMsg = await ctx.reply(
      `✅ تم حفظ <b>«${escapeHtml(saved.title)}»</b>${typeBadge} داخل الزر (المجموع الآن: ${
        allContents.length
      })\n\n` +
        `أرسل أو حوّل المزيد، أو اضغط الزر بالأسفل عند الانتهاء 👇`,
      {
        parse_mode: "HTML",
        reply_markup: buildCancelSessionKeyboard(session.targetNodeId, true),
      }
    );

    await ctx.services.menuAdmin.setSession(
      userId,
      chatId,
      "ADD_CONTENT",
      session.targetNodeId,
      statusMsg.message_id
    );
    return;
  }
});

interface ExtractedMessageMeta {
  contentType: ContentType;
  fileId: string | null;
  title: string;
  caption: string | null;
  isForwarded: boolean;
}

function extractMessageMetadata(msg: Message): ExtractedMessageMeta | null {
  const isForwarded = Boolean(
    msg.forward_origin ||
    (msg as any).forward_from ||
    (msg as any).forward_from_chat ||
    (msg as any).forward_sender_name ||
    (msg as any).forward_date
  );

  if (msg.document) {
    return {
      contentType: "document",
      fileId: msg.document.file_id,
      title: msg.document.file_name || "ملف",
      caption: msg.caption ?? null,
      isForwarded,
    };
  }

  if (msg.video) {
    return {
      contentType: "video",
      fileId: msg.video.file_id,
      title: msg.video.file_name || msg.caption?.slice(0, 40) || "فيديو",
      caption: msg.caption ?? null,
      isForwarded,
    };
  }

  if (msg.audio) {
    return {
      contentType: "audio",
      fileId: msg.audio.file_id,
      title:
        msg.audio.title ||
        msg.audio.file_name ||
        msg.caption?.slice(0, 40) ||
        "ملف صوتي",
      caption: msg.caption ?? null,
      isForwarded,
    };
  }

  if (msg.voice) {
    return {
      contentType: "voice",
      fileId: msg.voice.file_id,
      title: msg.caption?.slice(0, 40) || "بصمة صوتية",
      caption: msg.caption ?? null,
      isForwarded,
    };
  }

  if (msg.photo && msg.photo.length > 0) {
    const largestPhoto = msg.photo[msg.photo.length - 1];
    return {
      contentType: "photo",
      fileId: largestPhoto.file_id,
      title: msg.caption?.slice(0, 40) || "صورة",
      caption: msg.caption ?? null,
      isForwarded,
    };
  }

  if (msg.text) {
    const firstLine = msg.text.split(/\r?\n/)[0].trim();
    return {
      contentType: "text",
      fileId: null,
      title: firstLine.slice(0, 45) || "رسالة نصية",
      caption: msg.text,
      isForwarded,
    };
  }

  return null;
}
