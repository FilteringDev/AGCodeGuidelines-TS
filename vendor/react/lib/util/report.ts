import type { RuleContext, ReportDetails } from '../../types';

import dependency0 from './message';

const getMessageData = dependency0;

/**
 * @param context The rule context.
 * @param message The message value.
 * @param messageId The message id value.
 * @param data The data value.
 */
export default function report(
    context: RuleContext,
    message: string,
    messageId: string | false | null | undefined,
    data: ReportDetails,
) {
    context.report(Object.assign(getMessageData(messageId, message), data));
}
