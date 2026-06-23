// Shared type for content items passed to platform publishers.
// Replaces the old ReviewItem from telegram-bot.

export interface PublishItem {
  filePath: string;
  brand: string;
  keyword: string;
  contentType: string;
  content: string;
  status: string;
  generatedAt: string;
  params?: Record<string, string>;
}
