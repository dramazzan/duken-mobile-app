const buildArchs = process.env.EXPO_ANDROID_BUILD_ARCHS
  ? process.env.EXPO_ANDROID_BUILD_ARCHS.split(',').map((arch) => arch.trim()).filter(Boolean)
  : null;

module.exports = ({ config }) => {
  if (!buildArchs?.length) {
    return config;
  }

  return {
    ...config,
    plugins: (config.plugins ?? []).map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
        const pluginConfig = plugin[1] ?? {};

        return [
          plugin[0],
          {
            ...pluginConfig,
            android: {
              ...(pluginConfig.android ?? {}),
              buildArchs,
            },
          },
        ];
      }

      return plugin;
    }),
  };
};
