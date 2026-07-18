import React from 'react';

interface LogoProps {
	className?: string;
}

// Hust docs logo — briefcase mark + "Hust" wordmark with the Hust gradient,
// plus a muted "docs" tag. Mirrors the marketing site's HustLogo.
export const Logo: React.FC<LogoProps> = ({ className = '' }) => {
	return (
		<a
			href="/"
			aria-label="Hust Docs - Go to homepage"
			className={`text-current flex items-center gap-2.5 ${className}`}
		>
			<svg
				className="size-7 shrink-0"
				width={28}
				height={28}
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
			>
				<defs>
					<linearGradient id="hust-docs-logo" x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
						<stop stopColor="#a855f7" />
						<stop offset={1} stopColor="#6366f1" />
					</linearGradient>
				</defs>
				<rect x="2.5" y="7" width="19" height="13.5" rx="3" fill="url(#hust-docs-logo)" />
				<path
					d="M8.5 7V5.6A2.1 2.1 0 0 1 10.6 3.5h2.8A2.1 2.1 0 0 1 15.5 5.6V7"
					stroke="url(#hust-docs-logo)"
					strokeWidth="1.8"
					strokeLinecap="round"
					fill="none"
				/>
				<rect x="9.4" y="11.4" width="5.2" height="2.6" rx="1.3" fill="white" fillOpacity="0.9" />
			</svg>

			<span className="flex items-baseline gap-1.5">
				<span className="text-[17px] font-bold tracking-tight text-gray-900 dark:text-white">Hust</span>
				<span className="text-[13px] font-medium text-gray-400 dark:text-[#808098]">docs</span>
			</span>
		</a>
	);
};

export default Logo;
