<?php
/**
 * Wikidata primary sources tool version 2.
 *
 * This extension is the front-end component of the tool.
 * See the following links for more information:
 * https://www.wikidata.org/wiki/Wikidata:Primary_sources_tool
 * https://phabricator.wikimedia.org/project/profile/2788/
 * https://meta.wikimedia.org/wiki/Grants:IEG/StrepHit:_Wikidata_Statements_Validation_via_References/Renewal/Timeline
 *
 * @file
 * @ingroup Extensions
 * @author Marco Fossati - User:Hjfocs
 * @author Tommaso Montefusco - User:Kiailandi
 * @version 2.0
 * @license GPL-3.0-or-later
 */

if ( function_exists( 'wfLoadExtension' ) ) {
	// Extension registration for MediaWiki 1.25 and later
	// https://www.mediawiki.org/wiki/Manual:Extension_registration#Migration_for_extension_developers
	wfLoadExtension( 'PrimarySources' );
	// Keep i18n globals so mergeMessageFileList.php doesn't break
	$wgMessagesDirs['PrimarySources'] = __DIR__ . '/i18n';
	wfWarn(
		'Deprecated PHP entry point used for the PrimarySources extension. ' .
		'Please use wfLoadExtension instead, ' .
		'see https://www.mediawiki.org/wiki/Extension_registration for more details.'
	);
	return;
} else {
	// Old registration way for previous versions of MediaWiki

	// See https://www.mediawiki.org/wiki/Manual:$wgExtensionCredits
	$wgExtensionCredits['datavalues'][] = [
		'path' => __FILE__,
		'name' => 'PrimarySources',
		'author' => [
			'Marco Fossati',
			'Tommaso Montefusco'
		],
		'version'  => '2.0',
		'url' => 'https://www.mediawiki.org/wiki/Extension:PrimarySources',
		'descriptionmsg' => 'primary-sources-desc'
	];

	$dir = __DIR__;
	$dirbasename = basename( $dir );

	// Register files
	$wgAutoloadClasses['PrimarySourcesHooks'] = $dir . '/PrimarySourcesHooks.php';
	$wgAutoloadClasses['SpecialPrimarySources'] = $dir . '/SpecialPrimarySources.php';

	$wgMessagesDirs['PrimarySources'] = __DIR__ . '/i18n';

	// Register hooks
	$wgHooks['BeforePageDisplay'][] = 'PrimarySourcesHooks::onBeforePageDisplay';
	$wgHooks['ResourceLoaderTestModules'][] = 'PrimarySourcesHooks::onResourceLoaderTestModules';

	// Register special pages
	// See http://www.mediawiki.org/wiki/Manual:Special_pages
	$wgSpecialPages['PrimarySources'] = 'SpecialPrimarySources';

	// Register JavaScript modules
	// See http://www.mediawiki.org/wiki/Manual:$wgResourceModules
	$wgResourceModules['ext.PrimarySources.globals'] = [
		'scripts' => 'modules/ext.PrimarySources.globals.js',
		'localBasePath' => $dir,
		'remoteExtPath' => $dirbasename
	];
	$wgResourceModules['ext.PrimarySources.commons'] = [
		'scripts' => 'modules/ext.PrimarySources.commons.js',
		'dependencies' => 'ext.PrimarySources.globals',
		'localBasePath' => $dir,
		'remoteExtPath' => $dirbasename
	];
	$wgResourceModules['ext.PrimarySources.templates'] = [
		'scripts' => 'modules/ext.PrimarySources.templates.js',
		'localBasePath' => $dir,
		'remoteExtPath' => $dirbasename
	];
	$wgResourceModules['ext.PrimarySources.referencePreview'] = [
		'scripts' => 'modules/ext.PrimarySources.referencePreview.js',
		'styles' => 'modules/ext.PrimarySources.referencePreview.css',
		'localBasePath' => $dir,
		'remoteExtPath' => $dirbasename
	];
	$wgResourceModules['ext.PrimarySources.itemCuration'] = [
		'scripts' => 'modules/ext.PrimarySources.itemCuration.js',
		'styles' => 'modules/ext.PrimarySources.itemCuration.css',
		'dependencies' => [
			'ext.PrimarySources.globals',
			'ext.PrimarySources.commons',
			'ext.PrimarySources.templates',
			'ext.PrimarySources.referencePreview'
		],
		'localBasePath' => $dir,
		'remoteExtPath' => $dirbasename
	];
	$wgResourceModules['ext.PrimarySources.filter'] = [
		'scripts' => 'modules/ext.PrimarySources.filter.js',
		'dependencies' => [
			'ext.PrimarySources.globals',
			'ext.PrimarySources.commons',
			'ext.PrimarySources.referencePreview'
		],
		'localBasePath' => $dir,
		'remoteExtPath' => $dirbasename
	];
	$wgResourceModules['ext.PrimarySources.sidebar'] = [
		'scripts' => 'modules/ext.PrimarySources.sidebar.js',
		'styles' => 'modules/ext.PrimarySources.sidebar.css',
		'dependencies' => [
			'ext.PrimarySources.globals',
			'ext.PrimarySources.commons',
			'ext.PrimarySources.filter'
		],
		'localBasePath' => $dir,
		'remoteExtPath' => $dirbasename
	];
}
