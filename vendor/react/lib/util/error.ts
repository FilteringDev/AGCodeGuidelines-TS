import { error as writeError } from 'node:console';
/**
 * Logs out a message if there is no format option set.
 * @param message - Message to log.
 */
function error(message: string) {
    if (!/=-(f|-format)=/.test(process.argv.join('='))) {
        writeError(message);
    }
}

export default error;
