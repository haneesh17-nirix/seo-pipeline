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

export function parseReviewFile(filePath: string): { meta: ReviewMeta; body: string; brand: string; keyword: string; contentType: string; status: string; content: string; params: Record<string, string>; filePath: string; generatedAt: string } {
  const raw = fs.readFileSync(filePath, "utf8");
  const fmMatch = raw.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { meta: {} as ReviewMeta, body: raw, brand: "", keyword: "", contentType: "", status: "", content: raw, params: {}, filePath, generatedAt: "" };

  const meta: Partial<ReviewMeta> = {};
  for (const line of fmMatch[1].split("\n")) {
    const [k, ...rest] = line.split(":");
    if (k && rest.length) {
      const val = rest.join(":").trim().replace(/^"|"$/g, "");
      (meta as any)[k.trim()] = val;
    }
  }

  const body = fmMatch[2].replace(/<!--[\s\S]*?-->/g, "").trim();
  const m = meta as ReviewMeta;
  return {
    meta: m, body,
    brand: m.brand ?? "",
    keyword: m.keyword ?? "",
    contentType: m.contentType ?? "",
    status: m.status ?? "",
    content: body,
    params: (m.params as Record<string, string>) ?? {},
    filePath,
    generatedAt: m.generatedAt ?? "",
  };
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
    console.log(`  Looking for owner ${ownerId} in joined guilds...`);

    // Find the owner across all guilds the bot is in
    let ownerChannel: any = null;

    for (const [, guild] of c.guilds.cache) {
      try {
        const member = await guild.members.fetch(ownerId).catch(() => null);
        if (!member) continue;
        // Try DM first
        try {
          const dm = await member.createDM();
          ownerChannel = dm;
          console.log(`  Found owner in guild: ${guild.name} — using DM`);
          break;
        } catch {
          // DMs blocked — find a text channel the owner can see and bot can write to
          const channel = guild.channels.cache.find(
            (ch: any) =>
              ch.isTextBased() &&
              ch.permissionsFor(c.user!)?.has("SendMessages") &&
              ch.permissionsFor(member)?.has("ViewChannel")
          );
          if (channel) {
            ownerChannel = channel;
            console.log(`  DMs blocked — using channel #${(channel as any).name} in ${guild.name}`);
            break;
          }
        }
      } catch (err: any) {
        console.error(`  Error checking guild ${guild.name}:`, err.message);
      }
    }

    if (!ownerChannel) {
      console.error("  Could not reach owner. Check:");
      console.error("  1. Bot is in a server with you");
      console.error("  2. Discord Dev Portal → Bot → enable SERVER MEMBERS INTENT");
      console.error("  3. Or allow DMs from server members in your Privacy Settings");
      return;
    }

    (client as any)._ownerDm = ownerChannel;

    const pending = getAllPending();
    if (pending.length === 0) {
      await ownerChannel.send("✅ **Sahayi Approval Bot** is live. No pending items — I'll ping you when content is ready.");
    } else {
      await ownerChannel.send(`**Sahayi Approval Bot** is live.\n📋 **${pending.length} item(s)** pending review. Sending the first one now...`);
      await sendForReview(ownerChannel, pending[0]);
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
