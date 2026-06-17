import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

require('dotenv').config();

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DNS || null;

/**
 * Hust documentation site → https://docs.hust.so
 * Content is rendered from the repo's top-level `docs/` folder (../../docs).
 */
const config: Config = {
	themes: [
		[
			'@easyops-cn/docusaurus-search-local',
			{
				hashed: true,
				language: ['en'],
				highlightSearchTermsOnTargetPage: true,
				explicitSearchResultPath: true,
				docsRouteBasePath: '/',
				docsDir: '../../docs'
			}
		],
		'@docusaurus/theme-mermaid'
	],
	plugins: [
		SENTRY_DSN &&
			process.env.NODE_ENV === 'production' && [
				'docusaurus-plugin-sentry',
				{ DSN: process.env.NEXT_PUBLIC_SENTRY_DNS }
			]
	],
	title: 'Hust',
	tagline: 'The Anti-Hustle Career OS — Documentation',
	favicon: 'img/favicon.ico',
	url: 'https://docs.hust.so',
	baseUrl: '/',
	organizationName: 'ever-hust',
	projectName: 'ever-hust',
	onBrokenLinks: 'warn',
	markdown: {
		// 'detect' parses .md as CommonMark (lenient) and .mdx as MDX — keeps the
		// existing hand-written docs building without MDX-escaping every `<`/`{`.
		format: 'detect',
		mermaid: true,
		hooks: {
			onBrokenMarkdownLinks: 'warn'
		}
	},
	staticDirectories: ['static'],
	i18n: {
		defaultLocale: 'en',
		// Start English-only; the marketing site's 13 locales can be added later.
		locales: ['en']
	},
	presets: [
		[
			'classic',
			{
				blog: false,
				docs: {
					sidebarPath: './sidebarsPlatform.ts',
					path: '../../docs/',
					routeBasePath: '/',
					editUrl: 'https://github.com/ever-hust/ever-hust/tree/develop/',
					// Keep internal working docs + machine-readable specs off the public site.
					exclude: ['**/internal/**']
				},
				theme: {
					customCss: './src/css/custom.css'
				}
			}
		]
	],
	themeConfig: {
		colorMode: {
			defaultMode: 'dark'
		},
		navbar: {
			title: 'Hust Docs',
			items: [
				{ type: 'docSidebar', sidebarId: 'platformSidebar', position: 'left', label: 'Docs' },
				{ href: 'https://hust.so', label: 'Website', position: 'right' },
				{ href: 'https://app.hust.so', label: 'Open app', position: 'right' },
				{
					href: 'https://github.com/ever-hust',
					label: 'GitHub',
					position: 'right',
					className: 'header-github-link'
				}
			]
		},
		footer: {
			style: 'dark',
			links: [
				{
					title: 'Docs',
					items: [
						{ label: 'Home', to: '/' },
						{ label: 'PRD', to: '/PRD' },
						{ label: 'Architecture Decisions', to: '/ARCHITECTURE-DECISIONS' },
						{ label: 'Gauzy Integration', to: '/GAUZY-INTEGRATION' }
					]
				},
				{
					title: 'Product',
					items: [
						{ label: 'Website', href: 'https://hust.so' },
						{ label: 'App', href: 'https://app.hust.so' },
						{ label: 'Open Source', href: 'https://hust.so/oss' }
					]
				},
				{
					title: 'More',
					items: [
						{ label: 'Hust on GitHub', href: 'https://github.com/ever-hust' },
						{ label: 'Ever Jobs (OSS engine)', href: 'https://github.com/ever-co/ever-jobs' }
					]
				}
			],
			copyright: `Copyright © ${new Date().getFullYear()} <a href="https://ever.co/" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">Ever Co. LTD.</a> — Hust is open source under AGPL-3.0.`
		},
		prism: {
			theme: prismThemes.github,
			darkTheme: prismThemes.dracula
		}
	}
};

export default config;
