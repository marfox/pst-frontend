<?php
/**
 * IngestDataset special page.
 * Lets a data provider upload and/or update one or more datasets
 * to the primary sources tool back end.
 *
 * @file
 * @ingroup Extensions
 * @author Marco Fossati - User:Hjfocs
 * @author Tommaso Montefusco - User:Kiailandi
 * @version 2.0
 * @license GPL-3.0-or-later
 */

class SpecialIngestDataset extends SpecialPage {

	// Back-end API endpoints
	const BASE_URI = 'https://pst.wmflabs.org/v2/';
	const DATASETS_SERVICE = self::BASE_URI . 'datasets';
	const UPLOAD_SERVICE = self::BASE_URI . 'upload';
	const UPDATE_SERVICE = self::BASE_URI . 'update';

	/**
	 * Initialize this special page.
	 */
	public function __construct() {
		parent::__construct( 'IngestDataset' );
	}

	/**
	 * Show this special page to the user.
	 *
	 * @param string $sub The subpage string argument (if any).
	 */
	public function execute( $sub ) {
		$out = $this->getOutput();
		$user = $this->getUser();
		// JSON keys of the /datasets service response
		$userKey = 'user';
		$datasetKey = 'dataset';

		$this->setHeaders();
		// According to https://www.mediawiki.org/wiki/Manual:Special_pages#The_localisation_file
		// setHeaders() should also add the '-summary' message located in the i18n folder.
		// This does not seem to work, so add it here to the output page
		$out->addWikiText(
			'Send your dataset to the primary sources tool back end.
			Please remember it must comply with the
			[[:mw:Wikibase/Indexing/RDF_Dump_Format#Data_model | Wikidata RDF data model]].'
		);

		if ( $user->isLoggedIn() ) {
			$datasets = json_decode( file_get_contents( self::DATASETS_SERVICE ) );
			$datasetCount = count( $datasets );
			$userDatasets = [];

			for ( $i = 0; $i < $datasetCount; $i++ ) {
				preg_match( '/User:([^\/]+)/', $datasets[$i]->$userKey, $re );
				if ( $re[1] == $user->getName() ) {
					array_push( $userDatasets, $datasets[$i]->$datasetKey );
				}
			}

			$userDatasetCount = count( $userDatasets );
			// Enable update only if the user has uploaded at least a dataset
			if ( $userDatasetCount > 0 ) {
				$out->addHTML( '<script>
								function swap(){
									if($("#swap").text() == "I want to update a dataset"){
										$("#uploadForm").hide();
										$("#updateForm").show();
										$("#swap").text("I want to upload a dataset");
									}
									else{
										$("#updateForm").hide();
										$("#uploadForm").show();
										$("#swap").text("I want to update a dataset");
									}
								}
								</script>'
				);

				$out->addHTML(
					'<button id="swap" onClick="swap()">I want to update a dataset</button>
					<br /><br />'
				);

				$updateHtml =
					'<form id="updateForm" action="' . self::UPDATE_SERVICE . '"
					method="post" enctype="multipart/form-data" style="display:none">
						<input type="hidden" name="user" value="' . $user->getName() . ' /">
						<fieldset>
							<legend>Update</legend>
							<table><tbody>
								<tr class="mw-htmlform-field-UpdateSourceField">
									<td class="mw-label">
										<label for="datasetToUpdate">Dataset name to update:</label>
									</td>
									<td class="mw-input">
										<select id="datasetToUpdate" name="dataset">';

				for ( $i = 0; $i < $userDatasetCount; $i++ ) {
					$updateHtml .=
						'<option value="' . $userDatasets[$i] . '">'
							. explode( '/', $userDatasets[$i] )[2] .
						'</option>';
				}

				$updateHtml .=
										'</select>
									</td>
								</tr>
								<tr class="mw-htmlform-field-UpdateSourceField">
									<td class="mw-label">
										<label for="datasetToRemove">Dataset file to remove:</label>
									</td>
									<td class="mw-input">
										<input id="datasetToRemove" name="remove" type="file" />
									</td>
								</tr>
								<tr class="mw-htmlform-field-UpdateSourceField">
									<td class="mw-label">
										<label for="datasetToAdd">Dataset file to add:</label>
									</td>
									<td class="mw-input">
										<input id="datasetToAdd" name="add" type="file" />
									</td>
								</tr>
								<tr>
									<td colspan="2" class="htmlform-tip">Maximum file size: 250 MB</td>
								</tr>
								<tr>
									<td colspan="2" class="htmlform-tip">File format allowed: RDF</td>
								</tr>
							</tbody></table>
						</fieldset>
						<span class="mw-htmlform-submit-buttons">
							<input type="button" onclick="
								if (
									$(\'#datasetToRemove\').get(0).files.length === 0 ||
									$(\'#datasetToAdd\').get(0).files.length === 0
								) {
									alert(\'Please select a file for both inputs\')
								} else {
									submit()
								}"
							title="Update your dataset" value="Submit" />
						</span>
					</form>';
				$out->addHTML( $updateHtml );
			}

			$out->addHTML(
				'<form id="uploadForm" action="' . self::UPLOAD_SERVICE . '"
				method="post" enctype="multipart/form-data">
					<input type="hidden" name="user" value="' . $user->getName() . '" />
					<fieldset>
					<legend>Upload</legend>
					<table><tbody>
						<tr class="mw-htmlform-field-HTMLTextField">
							<td class="mw-label">
								<label for="datasetName">Dataset name:</label>
							</td>
							<td class="mw-input">
								<input id="datasetName" type="text" name="name" />
							</td>
						</tr>
						<tr class="mw-htmlform-field-HTMLTextField">
							<td class="mw-label">
								<label for="datasetDescription">Dataset description (optional):</label>
							</td>
							<td class="mw-input">
								<textarea id="datasetDescription" name="description"></textarea>
							</td>
						</tr>
						<tr class="mw-htmlform-field-UploadSourceField">
							<td class="mw-label">
								<label for="datasetFiles">Dataset files:</label>
							</td>
							<td class="mw-input">
								<input id="datasetFiles" type="file" name="dataset" multiple />
							</td>
						</tr>
						<tr>
							<td colspan="2" class="htmlform-tip">Maximum file size: 250 MB</td>
						</tr>
						<tr>
							<td colspan="2" class="htmlform-tip">File format allowed: RDF</td>
						</tr>
					</tbody></table>
					</fieldset>
					<span class="mw-htmlform-submit-buttons">
						<input type="button" onclick="
							if ( $( \'#datasetFiles\' ).get( 0 ).files.length === 0 ) {
								alert( \'Please select a file\' )
							} else {
								submit()
							}"
						title="Upload your dataset" value="Submit" />
					</span>
				</form>'
			);

		} else {
			$out->addWikiText( "<big>'''Please log in to use this feature.'''</big>" );
		}
	}

	/**
	 * Make this special page appear on Special:SpecialPages under the
	 * 'Primary sources tool' section.
	 *
	 * @return string
	 */
	protected function getGroupName() {
		return 'primarysources';
	}
}
