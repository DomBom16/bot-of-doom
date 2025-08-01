import { client } from "@/client";
import {
  checkScheduledMessages,
  markMessageAsSent,
  ScheduledMessage,
} from "@/database/index";
import chalk from "chalk";

// Scheduled message checker - runs every minute
export async function processScheduledMessages() {
  try {
    const pendingMessages = await checkScheduledMessages();

    for (const message of pendingMessages) {
      try {
        const guild = client.guilds.cache.get(message.guildId);
        if (!guild) continue;

        const channel = guild.channels.cache.get(message.channelId);
        if (!channel || !channel.isTextBased()) continue;

        const targetUserIds = JSON.parse(message.targetUserIds);
        const mentions = targetUserIds
          .map((id: string) => `<@${id}>`)
          .join(" ");

        const sender = await client.users
          .fetch(message.userId)
          .catch(() => null);
        const senderName = sender?.id ? `<@${sender.id}>` : "Unknown User";

        await channel.send(
          `${mentions}\n\n📢 **${senderName} scheduled this ping:**\n${message.message}`,
        );

        // Handle recurring messages
        if (message.recurringInterval) {
          const newOccurrenceCount = (message.occurrenceCount || 0) + 1;

          // Check if we should continue recurring
          const shouldContinue =
            !message.maxOccurrences ||
            newOccurrenceCount < message.maxOccurrences;

          if (shouldContinue) {
            // Create next occurrence
            const nextScheduledTime = new Date(
              message.scheduledTime.getTime() +
                message.recurringInterval * 60 * 1000,
            );

            await ScheduledMessage.create({
              userId: message.userId,
              guildId: message.guildId,
              channelId: message.channelId,
              targetUserIds: message.targetUserIds,
              scheduledTime: nextScheduledTime,
              message: message.message,
              sent: false,
              recurringInterval: message.recurringInterval,
              maxOccurrences: message.maxOccurrences,
              occurrenceCount: newOccurrenceCount,
            });
          }
        }

        await markMessageAsSent(message.id);
      } catch (error) {
        console.error(
          chalk.red("[DB] Error sending scheduled message:"),
          error,
        );
        // Mark as sent to prevent retrying indefinitely
        await markMessageAsSent(message.id);
      }
    }
  } catch (error) {
    console.error(
      chalk.red("[DB] Error processing scheduled messages:"),
      error,
    );
  }
}
