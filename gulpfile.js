const { src, dest } = require('gulp');
const path = require('path');

function buildIcons() {
	return src(['nodes/**/*.svg', 'nodes/**/*.png'])
		.pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;
