import pluginVue from 'eslint-plugin-vue';
import vueTsEslintConfig from '@vue/eslint-config-typescript';
import vuePrettierConfig from '@vue/eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'out/**',
      'release/**',
      '**/*.json',
      '**/*.md',
      '**/*.d.ts',
      '.dev-userdata/**',
      'public/**',
      'server/**',
      // 第三方 vendored 代码（ffmpeg-audio 等）不参与本项目 lint
      'native/**/vendor/**',
      '.gitignore',
      '.DS_Store',
    ],
  },
  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),
  vuePrettierConfig,
  {
    rules: {
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          semi: true,
          trailingComma: 'all',
          // 与 .prettierrc 保持一致：否则 eslint 会强制 LF，
          // 而 Windows（core.autocrlf=true）工作区是 CRLF，导致 lint 与 format 互相覆盖
          endOfLine: 'auto',
        },
      ],
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // 允许以下划线开头的占位参数/变量，以及用「rest 兄弟」剔除属性的写法：
      // const { bigField: _bigField, ...rest } = payload;
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['build/**/*.js', 'scripts/**/*.js', 'scripts/**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // room-server 是独立部署的 Node 服务（与 server/** 一样不参与 Electron 构建），
    // 保持其原有排版以避免与线上副本产生整文件格式差异；其他 lint 规则仍然生效。
    files: ['room-server/**/*.js'],
    rules: {
      'prettier/prettier': 'off',
    },
  },
];
