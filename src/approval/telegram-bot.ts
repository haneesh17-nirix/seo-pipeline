import { Telegraf, Markup } from "telegraf";
import * as fs from "fs";
import * as path from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewItem {
  filePath: string;
  brand: string;
  contentType: string;
  keyword: string;
  status: "pending_review" | "approved" | "rejected" | "needs_revision";
  params: Record<string, string>;
  content: string;
  generatedAt: string;
  scheduledFor?: string;
  platform?: string;
}

// ── File helpers ──────────────────────────────────────────────────────────────

export function parseReviewFile(filePath: string): ReviewItem | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const fmMatch = raw.match(/^---\n([\s\S]+?)\n---/);
    if (!fmMatch) return null;

    const fm = fmMatch[1];
    const get = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "") ?? "";

    const content = raw.slice(fmMatch[0].length).replace(/<!--[\s\S]*?-->/g, "").trim();

    return {
      filePath,
      brand: get("brand"),
      contentType: get("contentType"),
      keyword: get("keyword"),
      status: get("status") as ReviewItem["status"],
      params: {
        tone: get("tone"),
        structure: get("structure"),
        literaryInfluence: (fm.match(/literaryInfluence: "(.+)"/)?.[1] ?? "").split("—")[0].trim(),
        languageRegister: (fm.match(/languageRegister: "(.+)"/)?.[1] ?? "").split("—")[0].trim(),
        experienceTone: (fm.match(/experienceTone: "(.+)"/)?.[1] ?? "").split("—")[0].trim(),
      },
      content,
      generatedAt: get("generatedAt"),
      scheduledFor: get("scheduledFor") || undefined,
      platform: get("platform") || undefined,
    };
  } catch {
    return null;
  }
}

export function updateReviewStatus(
  filePath: string,
  status: ReviewItem["status"],
  extras: Record<string, string> = {}
): void {
  let raw = fs.readFileSync(filePath, "utf8");
  raw = raw.replace(/^status: .+$/m, `status: ${status}`);
  for (const [key, val] of Object.entries(extras)) {
    if (raw.match(new RegExp(`^${key}:`, "m"))) {
      raw = raw.replace(new RegExp(`^${key}: .*$`, "m"), `${key}: ${val}`);
    } else {
      raw = raw.replace(/^---\n([\s\S]+?)\n---/, (m, fm) => `---\n${fm}\n${key}: ${val}\n---`);
    }
  }
  fs.writeFileSync(filePath, raw, "utf8");
}

export function getAllPending(brandSlug?: string): ReviewItem[] {
  const brandsDir = path.join(process.cwd(), "brands");
  const slugs = brandSlug
    ? [brandSlug]
    : fs.readdirSync(brandsDir).filter((d) => fs.existsSync(path.join(brandsDir, d, "brand.json")));

  const items: ReviewItem[] = [];
  for (const slug of slugs) {
    const queueDir = path.join(brandsDir, slug, "output", "review-queue");
    if (!fs.existsSync(queueDir)) continue;
    for (const f of fs.readdirSync(queueDir).filter((f) => f.endsWith(".md"))) {
      const item = parseReviewFile(path.join(queueDir, f));
      if (item && item.status === "pending_review") items.push(item);
    }
  }
  return items.sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
}

// ── Telegram bot ──────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

function formatPreview(item: ReviewItem): string {
  const preview = truncate(item.content, 800);
  return [
    `📝 *${item.contentType.toUpperCase()}* — ${item.brand}`,
    `🔑 Keyword: ${item.keyword}`,
    `🎨 ${item.params.tone} | ${item.params.experienceTone?.split(" ")[0]}`,
    `📚 ${item.params.literaryInfluence}`,
    `🗣 ${item.params.languageRegister}`,
    ``,
    `─────────────────`,
    preview,
  ].join("\n");
}

export function startApprovalBot(token: string, ownerId: number): void {
  const bot = new Telegraf(token);

  // Only respond to the owner
  bot.use((ctx, next) => {
    if (ctx.from?.id !== ownerId) {
      ctx.reply("Unauthorised.");
      return;
    }
    return next();
  });

  // /queue — show pending count and first item
  bot.command("queue", async (ctx) => {
    const pending = getAllPending();
    if (!pending.length) {
      await ctx.reply("✅ Review queue is empty.");
      return;
    }
    await ctx.reply(`📬 ${pending.length} item(s) pending review. Sending first item...`);
    await sendReviewItem(ctx, pending[0]);
  });

  // /pending <brand> — filter by brand
  bot.command("pending", async (ctx) => {
    const brand = ctx.message.text.split(" ")[1];
    const items = getAllPending(brand);
    if (!items.length) {
      await ctx.reply(`✅ No pending items${brand ? ` for ${brand}` : ""}.`);
      return;
    }
    await ctx.reply(`📬 ${items.length} pending for ${brand ?? "all brands"}.`);
    await sendReviewItem(ctx, items[0]);
  });

  // /next — send next pending item
  bot.command("next", async (ctx) => {
    const pending = getAllPending();
    if (!pending.length) {
      await ctx.reply("✅ Nothing left to review.");
      return;
    }
    await sendReviewItem(ctx, pending[0]);
  });

  // Inline button callbacks
  bot.action(/^approve:(.+)$/, async (ctx) => {
    const filePath = Buffer.from(ctx.match[1], "base64").toString("utf8");
    updateReviewStatus(filePath, "approved");
    await ctx.answerCbQuery("✅ Approved — added to publish queue");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

    // Show next
    const next = getAllPending();
    if (next.length) {
      await ctx.reply(`📬 ${next.length} remaining. Next item:`);
      await sendReviewItem(ctx, next[0]);
    } else {
      await ctx.reply("🎉 All items reviewed!");
    }
  });

  bot.action(/^reject:(.+)$/, async (ctx) => {
    const filePath = Buffer.from(ctx.match[1], "base64").toString("utf8");
    updateReviewStatus(filePath, "rejected");
    await ctx.answerCbQuery("❌ Rejected");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    const next = getAllPending();
    if (next.length) await sendReviewItem(ctx, next[0]);
  });

  bot.action(/^revise:(.+)$/, async (ctx) => {
    const filePath = Buffer.from(ctx.match[1], "base64").toString("utf8");
    updateReviewStatus(filePath, "needs_revision");
    await ctx.answerCbQuery("✏️ Marked for revision");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(`📁 Edit the file and re-run generate to replace it:\n\`${filePath}\``);
  });

  bot.action(/^schedule:(.+)$/, async (ctx) => {
    const filePath = Buffer.from(ctx.match[1], "base64").toString("utf8");
    updateReviewStatus(filePath, "approved");
    await ctx.answerCbQuery("⏰ Approved for scheduling");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply("⏰ Content approved. It will be published at the next scheduled slot.");
  });

  bot.launch();
  console.log("  ✓ Approval bot running. Send /queue to your bot to start reviewing.");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

async function sendReviewItem(ctx: any, item: ReviewItem): Promise<void> {
  const encodedPath = Buffer.from(item.filePath).toString("base64");
  const preview = formatPreview(item);

  await ctx.replyWithMarkdown(
    preview,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Approve", `approve:${encodedPath}`),
        Markup.button.callback("❌ Reject", `reject:${encodedPath}`),
      ],
      [
        Markup.button.callback("✏️ Needs revision", `revise:${encodedPath}`),
        Markup.button.callback("⏰ Schedule", `schedule:${encodedPath}`),
      ],
    ])
  );
}
