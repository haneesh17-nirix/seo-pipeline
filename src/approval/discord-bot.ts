import * as fs from "fs";
import * as path from "path";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  Interaction,
  Message,
  TextChannel,
} from "discord.js";

// ── Review file helpers ───────────────────────────────────────────────────────

interface ReviewMeta {
  brand: string;
  contentType: string;
  keyword: string;
  city?: string;
  serviceCategory?: string;
  generatedAt: string;
  status: string;
  postArchitecture?: string;
  referenceFrame?: string;
  params?: Record<string, string>;
}

function parseReviewFile(filePath: string): { meta: ReviewMeta; body: string } {
  const raw = fs.readFileSync(filePath, "utf8");
  const fmMatch = raw.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { meta: {} as ReviewMeta, body: raw };

  const meta: Partial<ReviewMeta> = {};
  for (const line of fmMatch[1].split("\n")) {
    const [k, ...rest] = line.split(":");
    if (k && rest.length) {
      const val = rest.join(":").trim().replace(/^"|"$/g, "");
      (meta as any)[k.trim()] = val;
    }
  }

  const body = fmMatch[2].replace(/<!--[\s\S]*?-->/g, "").trim();
  return { meta: meta as ReviewMeta, body };
}

export function updateReviewStatus(
  filePath: string,
  status: "approved" | "rejected" | "needs_revision",
  note?: string
): void {
  let raw = fs.readFileSync(filePath, "utf8");
  raw = raw.replace(/^status: .+$/m, `status: ${status}`);
  if (note) {
    raw = raw.replace(/^status: .+$/m, `status: ${status}\nreviewNote: "${note}"`);
  }
  fs.writeFileSync(filePath, raw, "utf8");
}

export function getAllPending(brandSlug?: string): string[] {
  const brandsDir = path.join(process.cwd(), "brands");
  const slugs = brandSlug
    ? [brandSlug]
    : fs.existsSync(brandsDir) ? fs.readdirSync(brandsDir) : [];

  const files: string[] = [];
  for (const slug of slugs) {
    const dir = path.join(brandsDir, slug, "output", "review-queue");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      const fp = path.join(dir, f);
      const { meta } = parseReviewFile(fp);
      if (meta.status === "pending_review") files.push(fp);
    }
  }
  return files.sort();
}

// ── Discord bot ───────────────────────────────────────────────────────────────

export async function startApprovalBot(token: string, ownerId: string): Promise<void> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  });

  // Map from message ID → review file path (for button interactions)
  const pendingMap = new Map<string, string>();

  async function sendForReview(channel: TextChannel | any, filePath: string): Promise<void> {
    const { meta, body } = parseReviewFile(filePath);
    const preview = body.slice(0, 800) + (body.length > 800 ? "\n..." : "");

    const archLine = meta.postArchitecture ? `\`${meta.postArchitecture}\`` : "";
    const frameLine = meta.referenceFrame ? `\`${meta.referenceFrame}\`` : "";

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📝 ${meta.contentType?.toUpperCase()} — ${meta.keyword}`)
      .addFields(
        { name: "Brand", value: meta.brand ?? "—", inline: true },
        { name: "City", value: meta.city ?? "—", inline: true },
        { name: "Category", value: meta.serviceCategory ?? "—", inline: true },
        ...(archLine ? [{ name: "Architecture", value: archLine, inline: true }] : []),
        ...(frameLine ? [{ name: "Frame", value: frameLine, inline: true }] : []),
        { name: "Preview", value: `\`\`\`\n${preview}\n\`\`\`` },
      )
      .setFooter({ text: path.basename(filePath) })
      .setTimestamp(new Date(meta.generatedAt));

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("approve")
        .setLabel("✅ Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("reject")
        .setLabel("❌ Reject")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("revision")
        .setLabel("✏️ Needs Revision")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("skip")
        .setLabel("⏭️ Skip")
        .setStyle(ButtonStyle.Secondary),
    );

    const msg: Message = await channel.send({ embeds: [embed], components: [row] });
    pendingMap.set(msg.id, filePath);
  }

  client.once(Events.ClientReady, async (c) => {
    console.log(`\n  Discord bot ready: ${c.user.tag}`);
    console.log(`  Fetching DM channel for owner ${ownerId}...`);

    try {
      const owner = await c.users.fetch(ownerId);
      const dm = await owner.createDM();

      // Send pending count on startup
      const pending = getAllPending();
      if (pending.length === 0) {
        await dm.send("✅ **Sahayi Approval Bot** is live. No pending items right now — I'll ping you when content is ready for review.");
      } else {
        await dm.send(`**Sahayi Approval Bot** is live.\n📋 **${pending.length} item(s)** pending review. Sending the first one now...`);
        await sendForReview(dm, pending[0]);
      }

      // Store dm channel reference for later use
      (client as any)._ownerDm = dm;
    } catch (err: any) {
      console.error("  Could not open DM with owner:", err.message);
      console.error("  Make sure the owner has DMs enabled from server members.");
    }
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isButton()) return;

    // Only respond to the owner
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "Only the owner can approve content.", ephemeral: true });
      return;
    }

    const filePath = pendingMap.get(interaction.message.id);
    if (!filePath) {
      await interaction.reply({ content: "This item is no longer in the queue.", ephemeral: true });
      return;
    }

    const action = interaction.customId as "approve" | "reject" | "revision" | "skip";

    if (action === "skip") {
      await interaction.reply({ content: "⏭️ Skipped — item stays in queue.", ephemeral: true });
      return;
    }

    if (action === "revision") {
      await interaction.reply({
        content: "✏️ What revision is needed? Reply here and I'll note it.",
        ephemeral: true,
      });
      updateReviewStatus(filePath, "needs_revision");
    } else {
      updateReviewStatus(filePath, action === "approve" ? "approved" : "rejected");
    }

    pendingMap.delete(interaction.message.id);

    // Disable buttons on the original message
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("done")
        .setLabel(
          action === "approve" ? "✅ Approved"
          : action === "reject"  ? "❌ Rejected"
          : "✏️ Revision requested"
        )
        .setStyle(
          action === "approve" ? ButtonStyle.Success
          : action === "reject"  ? ButtonStyle.Danger
          : ButtonStyle.Secondary
        )
        .setDisabled(true),
    );

    await interaction.update({ components: [disabledRow] });

    // Send next pending item if any
    const remaining = getAllPending();
    if (remaining.length > 0) {
      const dm = (client as any)._ownerDm;
      if (dm) {
        await dm.send(`📋 ${remaining.length} more pending. Sending next...`);
        await sendForReview(dm, remaining[0]);
      }
    } else {
      await (client as any)._ownerDm?.send("🎉 All caught up — no more pending items.");
    }
  });

  // Slash command: /queue — show count + next item
  client.on(Events.MessageCreate, async (msg: Message) => {
    if (msg.author.id !== ownerId || msg.author.bot) return;
    const text = msg.content.trim().toLowerCase();

    if (text === "/queue" || text === "/pending") {
      const pending = getAllPending();
      if (!pending.length) {
        await msg.reply("No pending items.");
        return;
      }
      await msg.reply(`📋 **${pending.length} pending.** Sending next...`);
      await sendForReview(msg.channel, pending[0]);
    }

    if (text === "/next") {
      const pending = getAllPending();
      if (!pending.length) { await msg.reply("Nothing pending."); return; }
      await sendForReview(msg.channel, pending[0]);
    }
  });

  await client.login(token);
  // Keep alive
  await new Promise(() => {});
}
