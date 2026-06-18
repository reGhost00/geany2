project('geany', 'c',
	version: '2.2.0',
	default_options: ['c_std=c11', 'warning_level=2'])

gtk = dependency('gtk4', version: '>= 4.10')
gtksourceview = dependency('gtksourceview-5', version: '>= 5.0')

executable('geany',
	[
		'src/app.c',
		'src/main.c',
	],
	dependencies: [gtk, gtksourceview],
	install: true,
	win_subsystem: 'windows',
)
