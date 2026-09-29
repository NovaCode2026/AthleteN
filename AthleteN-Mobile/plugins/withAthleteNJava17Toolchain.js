const { withProjectBuildGradle } = require('@expo/config-plugins');

// Java 17 is configured through Gradle's installation settings in gradle.properties.
// This plugin intentionally does not mutate JavaCompile.javaCompiler because Gradle 9
// can finalize that property before Expo's app compile task is created.
module.exports = function withAthleteNJava17Toolchain(config) {
  return withProjectBuildGradle(config, (mod) => mod);
};
