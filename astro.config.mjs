// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: '.Net Field Guide',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/SETWorks' }],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Welcome', slug: 'getting-started/welcome' },
					],
				},
				{
					label: 'C#',
					collapsed: true,
					items: [{ autogenerate: { directory: 'csharp' } }],
				},
				{
					label: '.NET',
					collapsed: true,
					items: [{ autogenerate: { directory: 'dotnet' } }],
				},
				{
					label: 'ASP.NET Core',
					collapsed: true,
					items: [{ autogenerate: { directory: 'aspnet-core' } }],
				},
				{
					label: 'Blazor',
					collapsed: true,
					items: [{ autogenerate: { directory: 'blazor' } }],
				},
				{
					label: 'Application Design',
					collapsed: true,
					items: [{ autogenerate: { directory: 'application-design' } }],
				},
				{
					label: 'Useful Resources',
					collapsed: true,
					items: [{ autogenerate: { directory: 'resources' } }],
				},
			],
		}),
	],
});
