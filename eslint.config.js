import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	{
		ignores: [
			'**/node_modules/**',
			'**/build/**',
			'**/dist/**',
			'**/.svelte-kit/**',
			'**/coverage/**',
			'apps/reader/android/**',
			'docs/reference/**',
			'tmp/**',
			'brand/**',
			// Real third-party pages and scripts, kept exactly as captured: not our code to lint.
			'apps/reader/src/lib/partner/test-fixtures/**'
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
		}
	}
);
