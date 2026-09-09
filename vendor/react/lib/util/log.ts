import { log as writeMessage } from 'node:console';
/**
 * Logs out a message if there is no format option set.
 * @param message - Message to log.
 */
function log(message: string) {
    if (!/=-(f|-format)=/.test(process.argv.join('='))) {
        writeMessage(message);
    }
}

export default log;
