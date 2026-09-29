const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withAthleteNJava17Toolchain(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('AthleteN requires a Groovy Android root build.gradle for the Java toolchain fix.');
    }

    const marker = 'ATHLETEN_JAVA17_TOOLCHAIN_FIX';
    if (mod.modResults.contents.includes(marker)) return mod;

    mod.modResults.contents += `\n/* ${marker} */\nsubprojects { subproject ->\n  subproject.tasks.withType(org.gradle.api.tasks.compile.JavaCompile).configureEach {\n    def toolchains = subproject.extensions.findByType(org.gradle.jvm.toolchain.JavaToolchainService)\n    if (toolchains != null) {\n      javaCompiler = toolchains.compilerFor {\n        languageVersion = org.gradle.jvm.toolchain.JavaLanguageVersion.of(17)\n      }\n    }\n  }\n}\n`;
    return mod;
  });
};
