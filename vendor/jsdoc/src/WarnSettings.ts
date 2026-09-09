const WarnSettings = function WarnSettings() {
    const warnedSettings: WeakMap<object, Set<string>> = new WeakMap();

    return {
        /**
         * Warn only once for each context and setting
         * @param context The rule context.
         * @param setting The setting value.
         * @returns The result of this check.
         */
        hasBeenWarned(
            context: object,
            setting: string,
        ): boolean {
            return (
                warnedSettings.has(context)
                 && (
                     warnedSettings.get(context) as Set<string>
                 ).has(setting)
            );
        },

        /**
         * @param context The rule context.
         * @param setting The setting value.
         */
        markSettingAsWarned(
            context: object,
            setting: string,
        ): void {
            if (!warnedSettings.has(context)) {
                warnedSettings.set(context, new Set());
            }
            (
                warnedSettings.get(context) as Set<string>
            ).add(setting);
        },
    };
};

export default WarnSettings;
