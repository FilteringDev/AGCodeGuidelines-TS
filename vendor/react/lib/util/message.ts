/**
 * @file Message descriptors for the modern Oxlint reporting API.
 */
import type { ReportMessage } from '../../types';

/**
 * @param messageId The message id value.
 * @param message The message value.
 * @returns The result of this check.
 */
export default function getMessageData(
    messageId: string | false | null | undefined,
    message: string,
): ReportMessage {
    return messageId ? { messageId } : { message };
}
