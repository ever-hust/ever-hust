import React from 'react';
import { translate } from '@docusaurus/Translate';
import { useColorMode } from '@docusaurus/theme-common';
import useIsBrowser from '@docusaurus/useIsBrowser';
import IconDarkMode from '@theme/Icon/DarkMode';
import IconLightMode from '@theme/Icon/LightMode';
import IconSystemColorMode from '@theme/Icon/SystemColorMode';

interface ThemeOption {
	readonly key: 'system' | 'light' | 'dark';
	/** What `setColorMode` stores; `null` is "System" (follow the OS, light when it can't be read). */
	readonly choice: 'light' | 'dark' | null;
	readonly label: string;
	readonly Icon: typeof IconSystemColorMode;
}

/**
 * Footer theme selector: System / Light / Dark.
 *
 * `colorModeChoice` is the visitor's stored pick, or `null` while they have not picked one (then the
 * site follows the OS). The server render, and the first client render that hydrates it, cannot read
 * that pick, so no button is pressed until the page has hydrated. The markup is the same either way.
 */
export function ThemeSelector(): React.ReactElement {
	const { colorModeChoice, setColorMode } = useColorMode();
	const isBrowser = useIsBrowser();

	const options: ThemeOption[] = [
		{
			key: 'system',
			choice: null,
			label: translate({
				id: 'footer.themeSelector.system',
				message: 'System theme',
				description: 'Footer theme selector: follow the operating system theme'
			}),
			Icon: IconSystemColorMode
		},
		{
			key: 'light',
			choice: 'light',
			label: translate({
				id: 'footer.themeSelector.light',
				message: 'Light theme',
				description: 'Footer theme selector: always use the light theme'
			}),
			Icon: IconLightMode
		},
		{
			key: 'dark',
			choice: 'dark',
			label: translate({
				id: 'footer.themeSelector.dark',
				message: 'Dark theme',
				description: 'Footer theme selector: always use the dark theme'
			}),
			Icon: IconDarkMode
		}
	];

	return (
		<div
			role="group"
			aria-label={translate({
				id: 'footer.themeSelector.label',
				message: 'Theme',
				description: 'Accessible name of the footer theme selector (System / Light / Dark)'
			})}
			className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-solid border-gray-200 bg-gray-100 p-0.5 dark:border-gray-800 dark:bg-gray-900"
		>
			{options.map(({ key, choice, label, Icon }) => {
				const pressed = isBrowser && colorModeChoice === choice;

				return (
					<button
						key={key}
						type="button"
						aria-label={label}
						aria-pressed={pressed}
						title={label}
						onClick={() => setColorMode(choice)}
						className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 p-0 transition-colors duration-200 ${
							pressed
								? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
								: 'bg-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
						}`}
					>
						<Icon width={16} height={16} aria-hidden="true" />
					</button>
				);
			})}
		</div>
	);
}
