/**
 * Item curation.
 * This module implements the per-item workflow:
 * 1. process suggestions (back-end service /suggest), see parseFreebaseClaims;
 * 2. match existing Wikidata statements, see matchClaims;
 * 3. fill HTML templates (AKA blue boxes), see get*Html;
 * 4. handle curation actions, see addClickHandlers;
 * 5. add approved suggestions to Wikidata, see create*;
 * 6. update the suggestions state (back-end service /curate), see setStatementState.
 */
(function(mw, ps) {
  console.log("PrimarySources - Item curation");

  // accessible object
  var itemCuration = {};

  // BEGIN: 1. process suggestions
  itemCuration.getFreebaseEntityData = function getFreebaseEntityData(qid, callback) {
    $.ajax({
      url: FAKE_OR_RANDOM_DATA ?
        ps.commons.API_ENDPOINTS.FREEBASE_ENTITY_DATA_URL.replace(/\{\{qid\}\}/, 'any') : ps.commons.API_ENDPOINTS.FREEBASE_ENTITY_DATA_URL.replace(/\{\{qid\}\}/, qid) + '&dataset=' +
        dataset
    }).done(function(data) {
      return callback(null, data);
    });
  }
  itemCuration.parseFreebaseClaims = function parseFreebaseClaims(freebaseEntityData, blacklistedSourceUrls) {
    var isBlacklisted = ps.commons.isBlackListedBuilder(blacklistedSourceUrls);

    var freebaseClaims = {};
    /* jshint ignore:start */
    /* jscs: disable */
    if (ps.commons.DEBUG) {
      if (qid === 'Q4115189') {
        // The sandbox item can be written to
        document.getElementById('content').style.backgroundColor = 'lime';
      }
    }
    if (ps.commons.FAKE_OR_RANDOM_DATA) {
      freebaseEntityData.push({
        statement: qid + '\tP31\tQ1\tP580\t+1840-01-01T00:00:00Z/9\tS143\tQ48183',
        state: ps.commons.STATEMENT_STATES.unapproved,
        id: 0,
        format: ps.commons.STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP108\tQ95\tS854\t"http://research.google.com/pubs/vrandecic.html"',
        state: ps.commons.STATEMENT_STATES.unapproved,
        id: 0,
        format: ps.commons.STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP108\tQ8288\tP582\t+2013-09-30T00:00:00Z/10\tS854\t"http://simia.net/wiki/Denny"\tS813\t+2015-02-14T00:00:00Z/11',
        state: ps.commons.STATEMENT_STATES.unapproved,
        id: 0,
        format: ps.commons.STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP1451\ten:"foo bar"\tP582\t+2013-09-30T00:00:00Z/10\tS854\t"http://www.ebay.com/itm/GNC-Mens-Saw-Palmetto-Formula-60-Tablets/301466378726?pt=LH_DefaultDomain_0&hash=item4630cbe1e6"',
        state: ps.commons.STATEMENT_STATES.unapproved,
        id: 0,
        format: ps.commons.STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP108\tQ8288\tP582\t+2013-09-30T00:00:00Z/10\tS854\t"https://lists.wikimedia.org/pipermail/wikidata-l/2013-July/002518.html"',
        state: ps.commons.STATEMENT_STATES.unapproved,
        id: 0,
        format: ps.commons.STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP1082\t-1234',
        state: ps.commons.STATEMENT_STATES.unapproved,
        id: 0,
        format: ps.commons.STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP625\t@-12.12334556/23.1234',
        state: ps.commons.STATEMENT_STATES.unapproved,
        id: 0,
        format: ps.commons.STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP646\t"/m/05zhl_"',
        state: ps.commons.STATEMENT_STATES.unapproved,
        id: 0,
        format: ps.commons.STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP569\t+1840-01-01T00:00:00Z/11\tS854\t"https://lists.wikimedia.org/pipermail/wikidata-l/2013-July/002518.html"',
        state: ps.commons.STATEMENT_STATES.unapproved,
        id: 0,
        format: ps.commons.STATEMENT_FORMAT
      });
    }
    /* jscs: enable */
    /* jshint ignore:end */
    // Unify statements, as some statements may appear more than once
    var statementUnique = function(haystack, needle) {
      for (var i = 0, lenI = haystack.length; i < lenI; i++) {
        if (haystack[i].statement === needle) {
          return i;
        }
      }
      return -1;
    };
    var statements = freebaseEntityData.filter(function(freebaseEntity, index, self) {
      return statementUnique(self, freebaseEntity.statement) === index;
    })
    // Only show v1 new statements
    .filter(function(freebaseEntity) {
      return freebaseEntity.format === ps.commons.STATEMENT_FORMAT &&
          freebaseEntity.state === ps.commons.STATEMENT_STATES.unapproved;
    })
    .map(function(freebaseEntity) {
      return ps.commons.parsePrimarySourcesStatement(freebaseEntity, isBlacklisted);
    });

    ps.commons.preloadEntityLabels(statements);

    statements.forEach(function(statement) {
      var predicate = statement.predicate;
      var key = statement.key;

      freebaseClaims[predicate] = freebaseClaims[predicate] || {};
      if (!freebaseClaims[predicate][key]) {
        freebaseClaims[predicate][key] = {
          id: statement.id,
          dataset: statement.dataset,
          object: statement.object,
          qualifiers: statement.qualifiers,
          sources: []
        };
      }

      if (statement.source.length > 0) {
        // TODO: find reference duplicates
        freebaseClaims[predicate][key].sources.push(statement.source);
      }
    });
    return freebaseClaims;
  }
  // END: 1. process suggestions

  // BEGIN: 2. match existing Wikidata statements
  var qid = null;
  itemCuration.getQid = function getQid() {
    var qidRegEx = /^Q\d+$/;
    var title = mw.config.get('wgTitle');
    return qidRegEx.test(title) ? title : false;
  }
  itemCuration.getWikidataEntityData = function getWikidataEntityData(qid, callback) {
    $.ajax({
      url: WIKIDATA_ENTITY_DATA_URL.replace(/\{\{qid\}\}/, qid) + '?revision=' +
          mw.config.get('wgRevisionId')
    }).done(function(data) {
      return callback(null, data.entities[qid]);
    }).fail(function() {
      return callback('Invalid revision ID ' + mw.config.get('wgRevisionId'));
    });
  }
  itemCuration.getFreebaseEntityData = function getFreebaseEntityData(qid, callback) {
    $.ajax({
      url: FAKE_OR_RANDOM_DATA ?
          FREEBASE_ENTITY_DATA_URL.replace(/\{\{qid\}\}/, 'any') :
          FREEBASE_ENTITY_DATA_URL.replace(/\{\{qid\}\}/, qid) + '&dataset=' +
          dataset
    }).done(function(data) {
      return callback(null, data);
    });
  }
  itemCuration.matchClaims = function matchClaims(wikidataClaims, freebaseClaims) {
    var existingClaims = {};
    var newClaims = {};
    for (var property in freebaseClaims) {
      if (wikidataClaims[property]) {
        existingClaims[property] = freebaseClaims[property];
        var propertyLinks =
            document.querySelectorAll('a[title="Property:' + property + '"]');
        [].forEach.call(propertyLinks, function(propertyLink) {
          propertyLink.parentNode.parentNode.classList
              .add('existing-property');
        });
        for (var freebaseKey in freebaseClaims[property]) {
          var freebaseObject = freebaseClaims[property][freebaseKey];
          var existingWikidataObjects = {};
          var lenI = wikidataClaims[property].length;
          for (var i = 0; i < lenI; i++) {
            var wikidataObject = wikidataClaims[property][i];
            buildValueKeysFromWikidataStatement(wikidataObject)
              .forEach(function(key) {
                existingWikidataObjects[key] = wikidataObject;
              });
          }
          if (existingWikidataObjects[freebaseKey]) {
            // Existing object
            if (freebaseObject.sources.length === 0) {
              // No source, duplicate statement
              setStatementState(freebaseObject.id, ps.commons.STATEMENT_STATES.duplicate, freebaseObject.dataset, 'claim')
              .done(function() {
                ps.commons.debug.log('Automatically duplicate statement ' +
                    freebaseObject.id);
              });
            } else {
              // maybe new sources
              prepareNewSources(
                  property,
                  freebaseObject,
                  existingWikidataObjects[freebaseKey]
              );
            }
          } else {
            // New object
            var isDuplicate = false;
            for (var c = 0; c < wikidataClaims[property].length; c++) {
              var wikidataObject = wikidataClaims[property][c];

              if (wikidataObject.mainsnak.snaktype === 'value' &&
                  jsonToTsvValue(wikidataObject.mainsnak.datavalue) === freebaseObject.object) {
                isDuplicate = true;
                ps.commons.debug.log('Duplicate found! ' + property + ':' + freebaseObject.object);

                // Add new sources to existing statement
                prepareNewSources(
                    property,
                    freebaseObject,
                    wikidataObject
                );
              }
            }

            if (!isDuplicate) {
              createNewStatement(property, freebaseObject);
            }
          }
        }
      } else {
        newClaims[property] = freebaseClaims[property];
      }
    }
    for (var property in newClaims) {
      var claims = newClaims[property];
      ps.commons.debug.log('New claim ' + property);
      createNewClaim(property, claims);
    }
  }
  // END 2. match existing Wikidata statements

  // BEGIN: 3. fill HTML templates
  itemCuration.getSourcesHtml = function getSourcesHtml(sources, property, object) {
    var sourcePromises = sources.map(function(source) {
      var sourceItemsPromises = source.map(function(snak) {
        return $.when(
            getValueHtml(snak.sourceProperty),
            getValueHtml(snak.sourceObject, snak.sourceProperty)
        ).then(function(formattedProperty, formattedValue) {
          return HTML_TEMPLATES.sourceItemHtml
            .replace(/\{\{source-property-html\}\}/g, formattedProperty)
            .replace(/\{\{source-object\}\}/g, formattedValue);
        });
      });

      return $.when.apply($, sourceItemsPromises).then(function() {
        return HTML_TEMPLATES.sourceHtml
          .replace(/\{\{data-source\}\}/g, escapeHtml(JSON.stringify(source)))
          .replace(/\{\{data-property\}\}/g, property)
          .replace(/\{\{data-object\}\}/g, escapeHtml(object.object))
          .replace(/\{\{data-dataset\}\}/g, object.dataset)
          .replace(/\{\{statement-id\}\}/g, source[0].sourceId)
          .replace(/\{\{source-html\}\}/g,
              Array.prototype.slice.call(arguments).join(''))
          .replace(/\{\{data-qualifiers\}\}/g, escapeHtml(JSON.stringify(
              object.qualifiers)));
      });
    });

    return $.when.apply($, sourcePromises).then(function() {
      return Array.prototype.slice.call(arguments).join('');
    });
  }
  itemCuration.getStatementHtml = function getStatementHtml(property, object) {
    return $.when(
        getQualifiersHtml(object.qualifiers),
        getSourcesHtml(object.sources, property, object),
        getValueHtml(object.object, property)
    ).then(function(qualifiersHtml, sourcesHtml, formattedValue) {
      return HTML_TEMPLATES.statementViewHtml
        .replace(/\{\{object\}\}/g, formattedValue)
        .replace(/\{\{data-object\}\}/g, escapeHtml(object.object))
        .replace(/\{\{data-property\}\}/g, property)
        .replace(/\{\{references\}\}/g,
          object.sources.length === 1 ?
              object.sources.length + ' reference' :
              object.sources.length + ' references')
        .replace(/\{\{sources\}\}/g, sourcesHtml)
        .replace(/\{\{qualifiers\}\}/g, qualifiersHtml)
        .replace(/\{\{statement-id\}\}/g, object.id)
        .replace(/\{\{data-dataset\}\}/g, object.dataset)
        .replace(/\{\{data-qualifiers\}\}/g, escapeHtml(JSON.stringify(
            object.qualifiers)))
        .replace(/\{\{data-sources\}\}/g, escapeHtml(JSON.stringify(
            object.sources)));
    });
  }
  // END: 3. fill HTML templates

  /**
   * 4. Handle curation actions:
   * approval, rejection, and editing.
   * In other words, handle clicks on the following buttons:
   * -approve claim;
   * -reject claim;
   * -approve reference;
   * -reject reference.
   */
  itemCuration.addClickHandlers = (function addClickHandlers() {

    var contentDiv = document.getElementById('content');
    contentDiv.addEventListener('click', function(event) {
      var classList = event.target.classList;
      if (!classList.contains('f2w-button')) {
        return;
      }
      event.preventDefault();
      event.target.innerHTML = '<img src="https://upload.wikimedia.org/' +
        'wikipedia/commons/f/f8/Ajax-loader%282%29.gif" class="ajax"/>';
      var statement = event.target.dataset;
      var predicate = statement.property;
      var object = statement.object;
      var quickStatement = qid + '\t' + predicate + '\t' + object;

      // BEGIN: claim curation
      if (classList.contains('f2w-property')) {
        var currentDataset = statement.dataset;
        var qualifiers = JSON.parse(statement.qualifiers);
        var sources = JSON.parse(statement.sources);
        // Claim approval
        if (classList.contains('f2w-approve')) {
          createClaim(qid, predicate, object, qualifiers)
            .fail(function(error) {
              return reportError(error);
            }).done(function(data) {
              /*
                The back end approves the claim and eventual qualifiers.
                See SPARQL queries in CurateServlet:
                https://github.com/marfox/pst-backend
              */
              setStatementState(quickStatement, ps.commons.STATEMENT_STATES.approved, currentDataset, 'claim')
                .done(function() {
                  ps.commons.debug.log('Approved claim [' + quickStatement + ']');
                  if (data.pageinfo && data.pageinfo.lastrevid) {
                    document.location.hash = 'revision=' +
                      data.pageinfo.lastrevid;
                  }
                  return document.location.reload();
                });
            });
        }
        // Claim rejection
        else if (classList.contains('f2w-reject')) {
          // The back end rejects everything (claim, qualifiers, references)
          setStatementState(quickStatement, ps.commons.STATEMENT_STATES.rejected, currentDataset, 'claim')
            .done(function() {
              ps.commons.debug.log('Rejected claim [' + quickStatement + ']');
              return document.location.reload();
            });
        }
      }
      // END: claim curation

      // BEGIN: reference curation
      else if (classList.contains('f2w-source')) {
        /*
          The reference key is the property/value pair, see parsePrimarySourcesStatment.
          Use it to build the QuickStatement needed to change the state in the back end.
          See CurateServlet#parseQuickStatement:
          https://github.com/marfox/pst-backend
        */
        var currentDataset = statement.dataset;
        var predicate = statement.property;
        var object = statement.object;
        var source = JSON.parse(statement.source);
        var qualifiers = JSON.parse(statement.qualifiers);
        var sourceQuickStatement = quickStatement + '\t' + source[0].key
          // Reference approval
        if (classList.contains('f2w-approve')) {
          getClaims(qid, predicate, function(err, claims) {
            var objectExists = false;
            for (var i = 0, lenI = claims.length; i < lenI; i++) {
              var claim = claims[i];
              if (
                claim.mainsnak.snaktype === 'value' &&
                jsonToTsvValue(claim.mainsnak.datavalue) === object
              ) {
                objectExists = true;
                break;
              }
            }
            // The claim is already in Wikidata: only create the reference
            if (objectExists) {
              createReference(qid, predicate, object, source,
                function(error, data) {
                  if (error) {
                    return reportError(error);
                  }
                  // The back end approves everything
                  setStatementState(sourceQuickStatement, ps.commons.STATEMENT_STATES.approved, currentDataset, 'reference')
                    .done(function() {
                      ps.commons.debug.log('Approved referenced claim [' + sourceQuickStatement + ']');
                      if (data.pageinfo && data.pageinfo.lastrevid) {
                        document.location.hash = 'revision=' +
                          data.pageinfo.lastrevid;
                      }
                      return document.location.reload();
                    });
                });
            }
            // New referenced claim: entirely create it
            else {
              createClaimWithReference(qid, predicate, object, qualifiers,
                  source)
                .fail(function(error) {
                  return reportError(error);
                })
                .done(function(data) {
                  // The back end approves everything
                  setStatementState(sourceQuickStatement, ps.commons.STATEMENT_STATES.approved, currentDataset, 'reference')
                    .done(function() {
                      ps.commons.debug.log('Approved referenced claim [' + sourceQuickStatement + ']');
                      if (data.pageinfo && data.pageinfo.lastrevid) {
                        document.location.hash = 'revision=' +
                          data.pageinfo.lastrevid;
                      }
                      return document.location.reload();
                    });
                });
            }
          });
        }
        // Reference rejection
        else if (classList.contains('f2w-reject')) {
          setStatementState(sourceQuickStatement, ps.commons.STATEMENT_STATES.rejected, currentDataset, 'reference').done(function() {
            ps.commons.debug.log('Rejected referenced claim [' + sourceQuickStatement + ']');
            return document.location.reload();
          });
        }
        // Reference edit
        else if (classList.contains('f2w-edit')) {
          var a = document.getElementById('f2w-' + sourceQuickStatement);

          var onClick = function(e) {
            if (isUrl(e.target.textContent)) {
              a.style.textDecoration = 'none';
              a.href = e.target.textContent;
            } else {
              a.style.textDecoration = 'line-through';
            }
          };
          a.addEventListener('input', onClick);

          a.addEventListener('blur', function() {
            a.removeEventListener(onClick);
            a.onClick = function() {
              return true;
            };
            a.contentEditable = false;
            event.target.textContent = 'edit';
            var buttons = event.target.parentNode.parentNode
              .querySelectorAll('a');
            [].forEach.call(buttons, function(button) {
              button.dataset.sourceObject = a.href;
            });
          });

          a.contentEditable = true;
        }
      }
      // END: reference curation
    });
  })();

  // BEGIN: 5. add approved suggestions to Wikidata
  itemCuration.createNewClaim = function createNewClaim(property, claims) {
    var newClaim = {
      property: property,
      objects: []
    };
    var objectsLength = Object.keys(claims).length;
    var i = 0;
    for (var key in claims) {
      var object = claims[key].object;
      var id = claims[key].id;
      var claimDataset = claims[key].dataset;
      var sources = claims[key].sources;
      var qualifiers = claims[key].qualifiers;
      newClaim.objects.push({
        object: object,
        id: id,
        dataset: claimDataset,
        qualifiers: qualifiers,
        sources: sources,
        key: key
      });
      (function(currentNewClaim, currentKey) {
        currentNewClaim.objects.forEach(function(object) {
          if (object.key !== currentKey) {
            return;
          }
          i++;
          if (i === objectsLength) {
            return createNewClaimList(currentNewClaim);
          }
        });
      })(newClaim, key);
    }
  }
  itemCuration.createNewClaimList = function createNewClaimList(newClaim) {
    var container = document
        .querySelector('.wikibase-statementgrouplistview')
        .querySelector('.wikibase-listview');
    var statementPromises = newClaim.objects.map(function(object) {
      return getStatementHtml(newClaim.property, object);
    });

    getValueHtml(newClaim.property).done(function(propertyHtml) {
      $.when.apply($, statementPromises).then(function() {
        var statementViewsHtml = Array.prototype.slice.call(arguments).join('');
        var mainHtml = HTML_TEMPLATES.mainHtml
            .replace(/\{\{statement-views\}\}/g, statementViewsHtml)
            .replace(/\{\{property\}\}/g, newClaim.property)
            .replace(/\{\{data-property\}\}/g, newClaim.property)
            .replace(/\{\{data-dataset\}\}/g, newClaim.dataset)
            .replace(/\{\{property-html\}\}/g, propertyHtml);

        var fragment = document.createDocumentFragment();
        var child = document.createElement('div');
        child.innerHTML = mainHtml;
        fragment.appendChild(child.firstChild);
        container.appendChild(fragment);
        appendToNav(container.lastChild);
      });
    });
  }
  // END: 5. add approved suggestions to Wikidata

  // BEGIN: 6. update the suggestions state
  itemCuration.setStatementState = function setStatementState(quickStatement, state, dataset, type) {
    if (!ps.commons.STATEMENT_STATES[state]) {
      reportError('Invalid statement state');
    }
    var data = {
      qs: quickStatement,
      state: state,
      dataset: dataset,
      type: type,
      user: mw.user.getName()
    }
    return $.post(FREEBASE_ps.commons.STATEMENT_APPROVAL_URL, JSON.stringify(data))
    .fail(function() {
      reportError('Set statement state to ' + state + ' failed.');
    });
  }
  // END: 6. update the suggestions state

  ps.itemCuration = itemCuration;

}(mediaWiki, primarySources));
