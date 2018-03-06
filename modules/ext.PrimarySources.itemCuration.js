/**
 * Item curation.
 * This module implements the item-based workflow:
 * 1. process suggestions (back-end service /suggest);
 * 2. fill HTML templates (AKA blue boxes) with suggestions data;
 * 3. match existing Wikidata statements and display blue boxes accordingly;
 * 4. handle curation actions (AKA approve/reject buttons);
 *   4.1. add approved suggestions to Wikidata;
 *   4.2. update the suggestions state (back-end service /curate).
 */
(function(mw, $) {
  console.log("Primary sources tool - Item curation");
  
  var ps = mw.ps || {};
  // The current item
  var qid = null;

  // accessible object
  ps.itemCuration = {
    // BEGIN: 1. process suggestions
    getFreebaseEntityData: function getFreebaseEntityData(qid, callback) {
      $.ajax({
        url: FAKE_OR_RANDOM_DATA ?
          ps.globals.API_ENDPOINTS.RANDOM_SERVICE :
          ps.globals.API_ENDPOINTS.SUGGEST_SERVICE.replace(/\{\{qid\}\}/, qid) + '&dataset=' +
          ps.globals.DATASET
      }).done(function(data) {
        return callback(null, data);
      });
    },
    parseFreebaseClaims: function parseFreebaseClaims(freebaseEntityData, blacklistedSourceUrls) {
        var isBlacklisted = ps.commons.isBlackListedBuilder(blacklistedSourceUrls);

        var freebaseClaims = {};
        /* jshint ignore:start */
        /* jscs: disable */
        if (ps.globals.DEBUG) {
          if (qid === 'Q4115189') {
            // The sandbox item can be written to
            document.getElementById('content').style.backgroundColor = 'lime';
          }
        }
        if (ps.globals.FAKE_OR_RANDOM_DATA) {
          freebaseEntityData.push({
            statement: qid + '\tP31\tQ1\tP580\t+1840-01-01T00:00:00Z/9\tS143\tQ48183',
            state: ps.globals.STATEMENT_STATES.unapproved,
            id: 0,
            format: ps.globals.STATEMENT_FORMAT
          });
          freebaseEntityData.push({
            statement: qid + '\tP108\tQ95\tS854\t"http://research.google.com/pubs/vrandecic.html"',
            state: ps.globals.STATEMENT_STATES.unapproved,
            id: 0,
            format: ps.globals.STATEMENT_FORMAT
          });
          freebaseEntityData.push({
            statement: qid + '\tP108\tQ8288\tP582\t+2013-09-30T00:00:00Z/10\tS854\t"http://simia.net/wiki/Denny"\tS813\t+2015-02-14T00:00:00Z/11',
            state: ps.globals.STATEMENT_STATES.unapproved,
            id: 0,
            format: ps.globals.STATEMENT_FORMAT
          });
          freebaseEntityData.push({
            statement: qid + '\tP1451\ten:"foo bar"\tP582\t+2013-09-30T00:00:00Z/10\tS854\t"http://www.ebay.com/itm/GNC-Mens-Saw-Palmetto-Formula-60-Tablets/301466378726?pt=LH_DefaultDomain_0&hash=item4630cbe1e6"',
            state: ps.globals.STATEMENT_STATES.unapproved,
            id: 0,
            format: ps.globals.STATEMENT_FORMAT
          });
          freebaseEntityData.push({
            statement: qid + '\tP108\tQ8288\tP582\t+2013-09-30T00:00:00Z/10\tS854\t"https://lists.wikimedia.org/pipermail/wikidata-l/2013-July/002518.html"',
            state: ps.globals.STATEMENT_STATES.unapproved,
            id: 0,
            format: ps.globals.STATEMENT_FORMAT
          });
          freebaseEntityData.push({
            statement: qid + '\tP1082\t-1234',
            state: ps.globals.STATEMENT_STATES.unapproved,
            id: 0,
            format: ps.globals.STATEMENT_FORMAT
          });
          freebaseEntityData.push({
            statement: qid + '\tP625\t@-12.12334556/23.1234',
            state: ps.globals.STATEMENT_STATES.unapproved,
            id: 0,
            format: ps.globals.STATEMENT_FORMAT
          });
          freebaseEntityData.push({
            statement: qid + '\tP646\t"/m/05zhl_"',
            state: ps.globals.STATEMENT_STATES.unapproved,
            id: 0,
            format: ps.globals.STATEMENT_FORMAT
          });
          freebaseEntityData.push({
            statement: qid + '\tP569\t+1840-01-01T00:00:00Z/11\tS854\t"https://lists.wikimedia.org/pipermail/wikidata-l/2013-July/002518.html"',
            state: ps.globals.STATEMENT_STATES.unapproved,
            id: 0,
            format: ps.globals.STATEMENT_FORMAT
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
            return freebaseEntity.format === ps.globals.STATEMENT_FORMAT &&
              freebaseEntity.state === ps.globals.STATEMENT_STATES.unapproved;
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
    },
    // END: 1. process suggestions

    // BEGIN: 2. fill HTML templates
    getQualifiersHtml: function getQualifiersHtml(qualifiers) {
      var qualifierPromises = qualifiers.map(function(qualifier) {
        return $.when(
          getValueHtml(qualifier.qualifierProperty),
          getValueHtml(qualifier.qualifierObject, qualifier.qualifierProperty)
        ).then(function(formattedProperty, formattedValue) {
          return HTML_TEMPLATES.qualifierHtml
            .replace(/\{\{qualifier-property-html\}\}/g, formattedProperty)
            .replace(/\{\{qualifier-object\}\}/g, formattedValue);
        });
      });

      return $.when.apply($, qualifierPromises).then(function() {
        return Array.prototype.slice.call(arguments).join('');
      });
    },
    getSourcesHtml: function getSourcesHtml(sources, property, object) {
      var sourcePromises = sources.map(function(source) {
        var sourceItemsPromises = source.map(function(snak) {
          return $.when(
            ps.commons.getValueHtml(snak.sourceProperty),
            ps.commons.getValueHtml(snak.sourceObject, snak.sourceProperty)
          ).then(function(formattedProperty, formattedValue) {
            return ps.template.HTML_TEMPLATES.sourceItemHtml
              .replace(/\{\{source-property-html\}\}/g, formattedProperty)
              .replace(/\{\{source-object\}\}/g, formattedValue);
          });
        });

        return $.when.apply($, sourceItemsPromises).then(function() {
          return ps.template.HTML_TEMPLATES.sourceHtml
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
    },
    escapeHtml: function escapeHtml(html) {
      return html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;');
    },
    getStatementHtml: function getStatementHtml(property, object) {
        return $.when(
          getQualifiersHtml(object.qualifiers),
          getSourcesHtml(object.sources, property, object),
          ps.commons.getValueHtml(object.object, property)
        ).then(function(qualifiersHtml, sourcesHtml, formattedValue) {
          return ps.template.HTML_TEMPLATES.statementViewHtml
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
    },
    // END: 2. fill HTML templates

    // BEGIN: 3. match existing Wikidata statements
    getQid: function getQid() {
      var qidRegEx = /^Q\d+$/;
      var title = mw.config.get('wgTitle');
      return qidRegEx.test(title) ? title : false;
    },
    getWikidataEntityData: function getWikidataEntityData(qid, callback) {
      var revisionId = mw.config.get('wgRevisionId')
      $.ajax({
        url: ps.globals.API_ENDPOINTS.WIKIDATA_ENTITY_DATA_URL.replace(/\{\{qid\}\}/, qid) + '?revision=' + mw.config.get('wgRevisionId')
      }).done(function(data) {
        return callback(null, data.entities[qid]);
      }).fail(function() {
        return callback('Invalid revision ID ' + mw.config.get('wgRevisionId'));
      });
    },
    getFreebaseEntityData: function getFreebaseEntityData(qid, callback) {
      $.ajax({
        url: ps.globals.FAKE_OR_RANDOM_DATA ?
          ps.globals.SUGGEST_SERVICE.replace(/\{\{qid\}\}/, 'any') : ps.globals.SUGGEST_SERVICE.replace(/\{\{qid\}\}/, qid) + '&dataset=' +
          ps.globals.DATASET
      }).done(function(data) {
        return callback(null, data);
      });
    },
    createNewSources: function createNewSources(sources, property, object, statementId) {
      getSourcesHtml(sources, property, object).then(function(html) {
        var fragment = document.createDocumentFragment();
        var child = document.createElement('div');
        child.innerHTML = html;
        fragment.appendChild(child);
        // Need to find the correct reference
        var container = document
          .getElementsByClassName('wikibase-statement-' + statementId)[0];
        // Open the references toggle
        var toggler = container.querySelector('a.ui-toggler');
        if (toggler.classList.contains('ui-toggler-toggle-collapsed')) {
          toggler.click();
        }
        var label = toggler.querySelector('.ui-toggler-label');
        var oldLabel =
          parseInt(label.textContent.replace(/.*?(\d+).*?/, '$1'), 10);
        // Update the label
        var newLabel = oldLabel += sources.length;
        newLabel = newLabel === 1 ? '1 reference' : newLabel + ' references';
        label.textContent = newLabel;
        // Append the references
        container = container
          .querySelector('.wikibase-statementview-references');
        // Create wikibase-listview if not found
        if (!container.querySelector('.wikibase-listview')) {
          var sourcesListView = document.createElement('div');
          sourcesListView.className = 'wikibase-listview';
          container.insertBefore(sourcesListView, container.firstChild);
        }
        container = container.querySelector('.wikibase-listview');
        container.appendChild(fragment);
        ps.referencePreview.appendPreviewButton($(container).children().last());
      });
    },
    prepareNewSources: function prepareNewSources(property, object, wikidataStatement) {
      var wikidataSources = ('references' in wikidataStatement) ? wikidataStatement.references : [];
      var existingSources = {};
      for (var i in wikidataSources) {
        var snakBag = wikidataSources[i].snaks;
        for (var prop in snakBag) {
          if (!(prop in existingSources)) {
            existingSources[prop] = {};
          }
          for (var j in snakBag[prop]) {
            var snak = snakBag[prop][j];
            if (snak.snaktype === 'value') {
              existingSources[prop]
                [ps.commons.jsonToTsvValue(snak.datavalue, snak.datatype)] = true;
            }
          }
        }
      }
      // Filter already present sources
      object.sources = object.sources.filter(function(source) {
        return source.filter(function(snak) {
          return !existingSources[snak.sourceProperty] ||
            !existingSources[snak.sourceProperty][snak.sourceObject];
        }).length > 0;
      });

      return createNewSources(
        object.sources,
        property,
        object,
        wikidataStatement.id
      );
    },
    createNewStatement: function createNewStatement(property, object) {
      getStatementHtml(property, object).then(function(html) {
        var fragment = document.createDocumentFragment();
        var child = document.createElement('div');
        child.innerHTML = html;
        fragment.appendChild(child.firstChild);
        var container = document.getElementById(property)
          .querySelector('.wikibase-statementlistview-listview');
        container.appendChild(fragment);
        ps.sidebar.appendToNav(document.getElementById(property));
        ps.referencePreview.appendPreviewButton($(container).children().last());
      });
    },
    createNewClaim: function createNewClaim(property, claims) {
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
    },
    createNewClaimList: function createNewClaimList(newClaim) {
      var container = document
        .querySelector('.wikibase-statementgrouplistview')
        .querySelector('.wikibase-listview');
      var statementPromises = newClaim.objects.map(function(object) {
        return getStatementHtml(newClaim.property, object);
      });

      ps.commons.getValueHtml(newClaim.property).done(function(propertyHtml) {
        $.when.apply($, statementPromises).then(function() {
          var statementViewsHtml = Array.prototype.slice.call(arguments).join('');
          var mainHtml = ps.template.HTML_TEMPLATES.mainHtml
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
          ps.sidebar.appendToNav(container.lastChild);
          ps.referencePreview.appendPreviewButton($(container).children().last());
        });
      });
    },
    matchClaims: function matchClaims(wikidataClaims, freebaseClaims) {
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
              ps.commons.buildValueKeysFromWikidataStatement(wikidataObject)
                .forEach(function(key) {
                  existingWikidataObjects[key] = wikidataObject;
                });
            }
            if (existingWikidataObjects[freebaseKey]) {
              // Existing object
              if (freebaseObject.sources.length === 0) {
                // No source, duplicate statement
                ps.commons.setStatementState(freebaseObject.id, ps.globals.STATEMENT_STATES.duplicate, freebaseObject.dataset, 'claim')
                  .done(function() {
                    ps.globals.debug.log('Automatically duplicate statement ' +
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
                  ps.commons.jsonToTsvValue(wikidataObject.mainsnak.datavalue) === freebaseObject.object) {
                  isDuplicate = true;
                  ps.globals.debug.log('Duplicate found! ' + property + ':' + freebaseObject.object);

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
        ps.globals.debug.log('New claim ' + property);
        createNewClaim(property, claims);
      }
    },
    // END 3. match existing Wikidata statements

    /**
     * 4. Handle curation actions:
     * approval, rejection, and editing.
     * In other words, handle clicks on the following buttons:
     * -approve;
     * -reject.
     * TODO there is some code for reference editing, which doesn't seem to work
     */
    addClickHandlers: function addClickHandlers() {
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

        /* BEGIN: reference curation */
        if (classList.contains('f2w-source')) {
          /*
            The reference key is the property/value pair, see ps.commons.parsePrimarySourcesStatment.
            Use it to build the QuickStatement needed to change the state in the back end.
            See CurateServlet#parseQuickStatement:
            https://github.com/marfox/pst-backend
          */
          var dataset = statement.dataset;
          var predicate = statement.property;
          var object = statement.object;
          var source = JSON.parse(statement.source);
          var qualifiers = JSON.parse(statement.qualifiers);
          var sourceQuickStatement = quickStatement + '\t' + source[0].key;
            // Reference approval
          if (classList.contains('f2w-approve')) {
            ps.commons.getClaims(qid, predicate, function(err, claims) {
              var objectExists = false;
              for (var i = 0, lenI = claims.length; i < lenI; i++) {
                var claim = claims[i];
                if (
                  claim.mainsnak.snaktype === 'value' &&
                  ps.commons.jsonToTsvValue(claim.mainsnak.datavalue) === object
                ) {
                  objectExists = true;
                  break;
                }
              }
              // The claim is already in Wikidata: only create the reference
              if (objectExists) {
                ps.commons.createReference(qid, predicate, object, source,
                  function(error, data) {
                    if (error) {
                      return ps.commons.reportError(error);
                    }
                    // The back end approves everything
                    ps.commons.setStatementState(sourceQuickStatement, ps.globals.STATEMENT_STATES.approved, dataset, 'reference')
                      .done(function() {
                        ps.globals.debug.log('Approved referenced claim [' + sourceQuickStatement + ']');
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
                ps.commons.createClaimWithReference(qid, predicate, object, qualifiers,
                    source)
                  .fail(function(error) {
                    return ps.commons.reportError(error);
                  })
                  .done(function(data) {
                    // The back end approves everything
                    ps.commons.setStatementState(sourceQuickStatement, ps.globals.STATEMENT_STATES.approved, dataset, 'reference')
                      .done(function() {
                        ps.globals.debug.log('Approved referenced claim [' + sourceQuickStatement + ']');
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
            ps.commons.setStatementState(sourceQuickStatement, ps.globals.STATEMENT_STATES.rejected, dataset, 'reference').done(function() {
              ps.globals.debug.log('Rejected referenced claim [' + sourceQuickStatement + ']');
              return document.location.reload();
            });
          }
          // Reference edit
          // TODO doesn't seem to work
          else if (classList.contains('f2w-edit')) {
            var a = document.getElementById('f2w-' + sourceQuickStatement);

            var onClick = function(e) {
              if (ps.commons.isUrl(e.target.textContent)) {
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
        /* END: reference curation */
      });
    }
  };


  (function init() {
    
    !function(n,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t(n.async=n.async||{})}(this,function(n){"use strict";function t(n,t){t|=0;for(var e=Math.max(n.length-t,0),r=Array(e),u=0;u<e;u++)r[u]=n[t+u];return r}function e(n){var t=typeof n;return null!=n&&("object"==t||"function"==t)}function r(n){setTimeout(n,0)}function u(n){return function(e){var r=t(arguments,1);n(function(){e.apply(null,r)})}}function o(n){return it(function(t,r){var u;try{u=n.apply(this,t)}catch(n){return r(n)}e(u)&&"function"==typeof u.then?u.then(function(n){i(r,null,n)},function(n){i(r,n.message?n:new Error(n))}):r(null,u)})}function i(n,t,e){try{n(t,e)}catch(n){at(c,n)}}function c(n){throw n}function f(n){return lt&&"AsyncFunction"===n[Symbol.toStringTag]}function a(n){return f(n)?o(n):n}function l(n){return function(e){var r=t(arguments,1),u=it(function(t,r){var u=this;return n(e,function(n,e){a(n).apply(u,t.concat(e))},r)});return r.length?u.apply(this,r):u}}function s(n){var t=dt.call(n,gt),e=n[gt];try{n[gt]=void 0;var r=!0}catch(n){}var u=mt.call(n);return r&&(t?n[gt]=e:delete n[gt]),u}function p(n){return jt.call(n)}function h(n){return null==n?void 0===n?kt:St:(n=Object(n),Lt&&Lt in n?s(n):p(n))}function y(n){if(!e(n))return!1;var t=h(n);return t==wt||t==xt||t==Ot||t==Et}function v(n){return"number"==typeof n&&n>-1&&n%1==0&&n<=At}function d(n){return null!=n&&v(n.length)&&!y(n)}function m(){}function g(n){return function(){if(null!==n){var t=n;n=null,t.apply(this,arguments)}}}function b(n,t){for(var e=-1,r=Array(n);++e<n;)r[e]=t(e);return r}function j(n){return null!=n&&"object"==typeof n}function S(n){return j(n)&&h(n)==It}function k(){return!1}function L(n,t){return t=null==t?Wt:t,!!t&&("number"==typeof n||Nt.test(n))&&n>-1&&n%1==0&&n<t}function O(n){return j(n)&&v(n.length)&&!!de[h(n)]}function w(n){return function(t){return n(t)}}function x(n,t){var e=Pt(n),r=!e&&zt(n),u=!e&&!r&&$t(n),o=!e&&!r&&!u&&Le(n),i=e||r||u||o,c=i?b(n.length,String):[],f=c.length;for(var a in n)!t&&!we.call(n,a)||i&&("length"==a||u&&("offset"==a||"parent"==a)||o&&("buffer"==a||"byteLength"==a||"byteOffset"==a)||L(a,f))||c.push(a);return c}function E(n){var t=n&&n.constructor,e="function"==typeof t&&t.prototype||xe;return n===e}function A(n,t){return function(e){return n(t(e))}}function T(n){if(!E(n))return Ee(n);var t=[];for(var e in Object(n))Te.call(n,e)&&"constructor"!=e&&t.push(e);return t}function B(n){return d(n)?x(n):T(n)}function F(n){var t=-1,e=n.length;return function(){return++t<e?{value:n[t],key:t}:null}}function I(n){var t=-1;return function(){var e=n.next();return e.done?null:(t++,{value:e.value,key:t})}}function _(n){var t=B(n),e=-1,r=t.length;return function(){var u=t[++e];return e<r?{value:n[u],key:u}:null}}function M(n){if(d(n))return F(n);var t=Ft(n);return t?I(t):_(n)}function U(n){return function(){if(null===n)throw new Error("Callback was already called.");var t=n;n=null,t.apply(this,arguments)}}function z(n){return function(t,e,r){function u(n,t){if(f-=1,n)c=!0,r(n);else{if(t===Tt||c&&f<=0)return c=!0,r(null);o()}}function o(){for(;f<n&&!c;){var t=i();if(null===t)return c=!0,void(f<=0&&r(null));f+=1,e(t.value,t.key,U(u))}}if(r=g(r||m),n<=0||!t)return r(null);var i=M(t),c=!1,f=0;o()}}function P(n,t,e,r){z(t)(n,a(e),r)}function V(n,t){return function(e,r,u){return n(e,t,r,u)}}function q(n,t,e){function r(n,t){n?e(n):++o!==i&&t!==Tt||e(null)}e=g(e||m);var u=0,o=0,i=n.length;for(0===i&&e(null);u<i;u++)t(n[u],u,U(r))}function D(n){return function(t,e,r){return n(Fe,t,a(e),r)}}function R(n,t,e,r){r=r||m,t=t||[];var u=[],o=0,i=a(e);n(t,function(n,t,e){var r=o++;i(n,function(n,t){u[r]=t,e(n)})},function(n){r(n,u)})}function C(n){return function(t,e,r,u){return n(z(e),t,a(r),u)}}function $(n,t){for(var e=-1,r=null==n?0:n.length;++e<r&&t(n[e],e,n)!==!1;);return n}function W(n){return function(t,e,r){for(var u=-1,o=Object(t),i=r(t),c=i.length;c--;){var f=i[n?c:++u];if(e(o[f],f,o)===!1)break}return t}}function N(n,t){return n&&Ve(n,t,B)}function Q(n,t,e,r){for(var u=n.length,o=e+(r?1:-1);r?o--:++o<u;)if(t(n[o],o,n))return o;return-1}function G(n){return n!==n}function H(n,t,e){for(var r=e-1,u=n.length;++r<u;)if(n[r]===t)return r;return-1}function J(n,t,e){return t===t?H(n,t,e):Q(n,G,e)}function K(n,t){for(var e=-1,r=null==n?0:n.length,u=Array(r);++e<r;)u[e]=t(n[e],e,n);return u}function X(n){return"symbol"==typeof n||j(n)&&h(n)==De}function Y(n){if("string"==typeof n)return n;if(Pt(n))return K(n,Y)+"";if(X(n))return $e?$e.call(n):"";var t=n+"";return"0"==t&&1/n==-Re?"-0":t}function Z(n,t,e){var r=-1,u=n.length;t<0&&(t=-t>u?0:u+t),e=e>u?u:e,e<0&&(e+=u),u=t>e?0:e-t>>>0,t>>>=0;for(var o=Array(u);++r<u;)o[r]=n[r+t];return o}function nn(n,t,e){var r=n.length;return e=void 0===e?r:e,!t&&e>=r?n:Z(n,t,e)}function tn(n,t){for(var e=n.length;e--&&J(t,n[e],0)>-1;);return e}function en(n,t){for(var e=-1,r=n.length;++e<r&&J(t,n[e],0)>-1;);return e}function rn(n){return n.split("")}function un(n){return Je.test(n)}function on(n){return n.match(hr)||[]}function cn(n){return un(n)?on(n):rn(n)}function fn(n){return null==n?"":Y(n)}function an(n,t,e){if(n=fn(n),n&&(e||void 0===t))return n.replace(yr,"");if(!n||!(t=Y(t)))return n;var r=cn(n),u=cn(t),o=en(r,u),i=tn(r,u)+1;return nn(r,o,i).join("")}function ln(n){return n=n.toString().replace(gr,""),n=n.match(vr)[2].replace(" ",""),n=n?n.split(dr):[],n=n.map(function(n){return an(n.replace(mr,""))})}function sn(n,t){var e={};N(n,function(n,t){function r(t,e){var r=K(u,function(n){return t[n]});r.push(e),a(n).apply(null,r)}var u,o=f(n),i=!o&&1===n.length||o&&0===n.length;if(Pt(n))u=n.slice(0,-1),n=n[n.length-1],e[t]=u.concat(u.length>0?r:n);else if(i)e[t]=n;else{if(u=ln(n),0===n.length&&!o&&0===u.length)throw new Error("autoInject task functions require explicit parameters.");o||u.pop(),e[t]=u.concat(r)}}),qe(e,t)}function pn(){this.head=this.tail=null,this.length=0}function hn(n,t){n.length=1,n.head=n.tail=t}function yn(n,t,e){function r(n,t,e){if(null!=e&&"function"!=typeof e)throw new Error("task callback must be a function");if(l.started=!0,Pt(n)||(n=[n]),0===n.length&&l.idle())return at(function(){l.drain()});for(var r=0,u=n.length;r<u;r++){var o={data:n[r],callback:e||m};t?l._tasks.unshift(o):l._tasks.push(o)}at(l.process)}function u(n){return function(t){i-=1;for(var e=0,r=n.length;e<r;e++){var u=n[e],o=J(c,u,0);o>=0&&c.splice(o,1),u.callback.apply(u,arguments),null!=t&&l.error(t,u.data)}i<=l.concurrency-l.buffer&&l.unsaturated(),l.idle()&&l.drain(),l.process()}}if(null==t)t=1;else if(0===t)throw new Error("Concurrency must not be zero");var o=a(n),i=0,c=[],f=!1,l={_tasks:new pn,concurrency:t,payload:e,saturated:m,unsaturated:m,buffer:t/4,empty:m,drain:m,error:m,started:!1,paused:!1,push:function(n,t){r(n,!1,t)},kill:function(){l.drain=m,l._tasks.empty()},unshift:function(n,t){r(n,!0,t)},remove:function(n){l._tasks.remove(n)},process:function(){if(!f){for(f=!0;!l.paused&&i<l.concurrency&&l._tasks.length;){var n=[],t=[],e=l._tasks.length;l.payload&&(e=Math.min(e,l.payload));for(var r=0;r<e;r++){var a=l._tasks.shift();n.push(a),c.push(a),t.push(a.data)}i+=1,0===l._tasks.length&&l.empty(),i===l.concurrency&&l.saturated();var s=U(u(n));o(t,s)}f=!1}},length:function(){return l._tasks.length},running:function(){return i},workersList:function(){return c},idle:function(){return l._tasks.length+i===0},pause:function(){l.paused=!0},resume:function(){l.paused!==!1&&(l.paused=!1,at(l.process))}};return l}function vn(n,t){return yn(n,1,t)}function dn(n,t,e,r){r=g(r||m);var u=a(e);jr(n,function(n,e,r){u(t,n,function(n,e){t=e,r(n)})},function(n){r(n,t)})}function mn(){var n=K(arguments,a);return function(){var e=t(arguments),r=this,u=e[e.length-1];"function"==typeof u?e.pop():u=m,dn(n,e,function(n,e,u){e.apply(r,n.concat(function(n){var e=t(arguments,1);u(n,e)}))},function(n,t){u.apply(r,[n].concat(t))})}}function gn(n){return n}function bn(n,t){return function(e,r,u,o){o=o||m;var i,c=!1;e(r,function(e,r,o){u(e,function(r,u){r?o(r):n(u)&&!i?(c=!0,i=t(!0,e),o(null,Tt)):o()})},function(n){n?o(n):o(null,c?i:t(!1))})}}function jn(n,t){return t}function Sn(n){return function(e){var r=t(arguments,1);r.push(function(e){var r=t(arguments,1);"object"==typeof console&&(e?console.error&&console.error(e):console[n]&&$(r,function(t){console[n](t)}))}),a(e).apply(null,r)}}function kn(n,e,r){function u(n){if(n)return r(n);var e=t(arguments,1);e.push(o),c.apply(this,e)}function o(n,t){return n?r(n):t?void i(u):r(null)}r=U(r||m);var i=a(n),c=a(e);o(null,!0)}function Ln(n,e,r){r=U(r||m);var u=a(n),o=function(n){if(n)return r(n);var i=t(arguments,1);return e.apply(this,i)?u(o):void r.apply(null,[null].concat(i))};u(o)}function On(n,t,e){Ln(n,function(){return!t.apply(this,arguments)},e)}function wn(n,t,e){function r(n){return n?e(n):void i(u)}function u(n,t){return n?e(n):t?void o(r):e(null)}e=U(e||m);var o=a(t),i=a(n);i(u)}function xn(n){return function(t,e,r){return n(t,r)}}function En(n,t,e){Fe(n,xn(a(t)),e)}function An(n,t,e,r){z(t)(n,xn(a(e)),r)}function Tn(n){return f(n)?n:it(function(t,e){var r=!0;t.push(function(){var n=arguments;r?at(function(){e.apply(null,n)}):e.apply(null,n)}),n.apply(this,t),r=!1})}function Bn(n){return!n}function Fn(n){return function(t){return null==t?void 0:t[n]}}function In(n,t,e,r){var u=new Array(t.length);n(t,function(n,t,r){e(n,function(n,e){u[t]=!!e,r(n)})},function(n){if(n)return r(n);for(var e=[],o=0;o<t.length;o++)u[o]&&e.push(t[o]);r(null,e)})}function _n(n,t,e,r){var u=[];n(t,function(n,t,r){e(n,function(e,o){e?r(e):(o&&u.push({index:t,value:n}),r())})},function(n){n?r(n):r(null,K(u.sort(function(n,t){return n.index-t.index}),Fn("value")))})}function Mn(n,t,e,r){var u=d(t)?In:_n;u(n,t,a(e),r||m)}function Un(n,t){function e(n){return n?r(n):void u(e)}var r=U(t||m),u=a(Tn(n));e()}function zn(n,t,e,r){r=g(r||m);var u={},o=a(e);P(n,t,function(n,t,e){o(n,t,function(n,r){return n?e(n):(u[t]=r,void e())})},function(n){r(n,u)})}function Pn(n,t){return t in n}function Vn(n,e){var r=Object.create(null),u=Object.create(null);e=e||gn;var o=a(n),i=it(function(n,i){var c=e.apply(null,n);Pn(r,c)?at(function(){i.apply(null,r[c])}):Pn(u,c)?u[c].push(i):(u[c]=[i],o.apply(null,n.concat(function(){var n=t(arguments);r[c]=n;var e=u[c];delete u[c];for(var o=0,i=e.length;o<i;o++)e[o].apply(null,n)})))});return i.memo=r,i.unmemoized=n,i}function qn(n,e,r){r=r||m;var u=d(e)?[]:{};n(e,function(n,e,r){a(n)(function(n,o){arguments.length>2&&(o=t(arguments,1)),u[e]=o,r(n)})},function(n){r(n,u)})}function Dn(n,t){qn(Fe,n,t)}function Rn(n,t,e){qn(z(t),n,e)}function Cn(n,t){if(t=g(t||m),!Pt(n))return t(new TypeError("First argument to race must be an array of functions"));if(!n.length)return t();for(var e=0,r=n.length;e<r;e++)a(n[e])(t)}function $n(n,e,r,u){var o=t(n).reverse();dn(o,e,r,u)}function Wn(n){var e=a(n);return it(function(n,r){return n.push(function(n,e){if(n)r(null,{error:n});else{var u;u=arguments.length<=2?e:t(arguments,1),r(null,{value:u})}}),e.apply(this,n)})}function Nn(n,t,e,r){Mn(n,t,function(n,t){e(n,function(n,e){t(n,!e)})},r)}function Qn(n){var t;return Pt(n)?t=K(n,Wn):(t={},N(n,function(n,e){t[e]=Wn.call(this,n)})),t}function Gn(n){return function(){return n}}function Hn(n,t,e){function r(n,t){if("object"==typeof t)n.times=+t.times||o,n.intervalFunc="function"==typeof t.interval?t.interval:Gn(+t.interval||i),n.errorFilter=t.errorFilter;else{if("number"!=typeof t&&"string"!=typeof t)throw new Error("Invalid arguments for async.retry");n.times=+t||o}}function u(){f(function(n){n&&l++<c.times&&("function"!=typeof c.errorFilter||c.errorFilter(n))?setTimeout(u,c.intervalFunc(l)):e.apply(null,arguments)})}var o=5,i=0,c={times:o,intervalFunc:Gn(i)};if(arguments.length<3&&"function"==typeof n?(e=t||m,t=n):(r(c,n),e=e||m),"function"!=typeof t)throw new Error("Invalid arguments for async.retry");var f=a(t),l=1;u()}function Jn(n,t){qn(jr,n,t)}function Kn(n,t,e){function r(n,t){var e=n.criteria,r=t.criteria;return e<r?-1:e>r?1:0}var u=a(t);Ie(n,function(n,t){u(n,function(e,r){return e?t(e):void t(null,{value:n,criteria:r})})},function(n,t){return n?e(n):void e(null,K(t.sort(r),Fn("value")))})}function Xn(n,t,e){var r=a(n);return it(function(u,o){function i(){var t=n.name||"anonymous",r=new Error('Callback function "'+t+'" timed out.');r.code="ETIMEDOUT",e&&(r.info=e),f=!0,o(r)}var c,f=!1;u.push(function(){f||(o.apply(null,arguments),clearTimeout(c))}),c=setTimeout(i,t),r.apply(null,u)})}function Yn(n,t,e,r){for(var u=-1,o=tu(nu((t-n)/(e||1)),0),i=Array(o);o--;)i[r?o:++u]=n,n+=e;return i}function Zn(n,t,e,r){var u=a(e);Me(Yn(0,n,1),t,u,r)}function nt(n,t,e,r){arguments.length<=3&&(r=e,e=t,t=Pt(n)?[]:{}),r=g(r||m);var u=a(e);Fe(n,function(n,e,r){u(t,n,e,r)},function(n){r(n,t)})}function tt(n,e){var r,u=null;e=e||m,Fr(n,function(n,e){a(n)(function(n,o){r=arguments.length>2?t(arguments,1):o,u=n,e(!n)})},function(){e(u,r)})}function et(n){return function(){return(n.unmemoized||n).apply(null,arguments)}}function rt(n,e,r){r=U(r||m);var u=a(e);if(!n())return r(null);var o=function(e){if(e)return r(e);if(n())return u(o);var i=t(arguments,1);r.apply(null,[null].concat(i))};u(o)}function ut(n,t,e){rt(function(){return!n.apply(this,arguments)},t,e)}var ot,it=function(n){return function(){var e=t(arguments),r=e.pop();n.call(this,e,r)}},ct="function"==typeof setImmediate&&setImmediate,ft="object"==typeof process&&"function"==typeof process.nextTick;ot=ct?setImmediate:ft?process.nextTick:r;var at=u(ot),lt="function"==typeof Symbol,st="object"==typeof global&&global&&global.Object===Object&&global,pt="object"==typeof self&&self&&self.Object===Object&&self,ht=st||pt||Function("return this")(),yt=ht.Symbol,vt=Object.prototype,dt=vt.hasOwnProperty,mt=vt.toString,gt=yt?yt.toStringTag:void 0,bt=Object.prototype,jt=bt.toString,St="[object Null]",kt="[object Undefined]",Lt=yt?yt.toStringTag:void 0,Ot="[object AsyncFunction]",wt="[object Function]",xt="[object GeneratorFunction]",Et="[object Proxy]",At=9007199254740991,Tt={},Bt="function"==typeof Symbol&&Symbol.iterator,Ft=function(n){return Bt&&n[Bt]&&n[Bt]()},It="[object Arguments]",_t=Object.prototype,Mt=_t.hasOwnProperty,Ut=_t.propertyIsEnumerable,zt=S(function(){return arguments}())?S:function(n){return j(n)&&Mt.call(n,"callee")&&!Ut.call(n,"callee")},Pt=Array.isArray,Vt="object"==typeof n&&n&&!n.nodeType&&n,qt=Vt&&"object"==typeof module&&module&&!module.nodeType&&module,Dt=qt&&qt.exports===Vt,Rt=Dt?ht.Buffer:void 0,Ct=Rt?Rt.isBuffer:void 0,$t=Ct||k,Wt=9007199254740991,Nt=/^(?:0|[1-9]\d*)$/,Qt="[object Arguments]",Gt="[object Array]",Ht="[object Boolean]",Jt="[object Date]",Kt="[object Error]",Xt="[object Function]",Yt="[object Map]",Zt="[object Number]",ne="[object Object]",te="[object RegExp]",ee="[object Set]",re="[object String]",ue="[object WeakMap]",oe="[object ArrayBuffer]",ie="[object DataView]",ce="[object Float32Array]",fe="[object Float64Array]",ae="[object Int8Array]",le="[object Int16Array]",se="[object Int32Array]",pe="[object Uint8Array]",he="[object Uint8ClampedArray]",ye="[object Uint16Array]",ve="[object Uint32Array]",de={};de[ce]=de[fe]=de[ae]=de[le]=de[se]=de[pe]=de[he]=de[ye]=de[ve]=!0,de[Qt]=de[Gt]=de[oe]=de[Ht]=de[ie]=de[Jt]=de[Kt]=de[Xt]=de[Yt]=de[Zt]=de[ne]=de[te]=de[ee]=de[re]=de[ue]=!1;var me="object"==typeof n&&n&&!n.nodeType&&n,ge=me&&"object"==typeof module&&module&&!module.nodeType&&module,be=ge&&ge.exports===me,je=be&&st.process,Se=function(){try{return je&&je.binding("util")}catch(n){}}(),ke=Se&&Se.isTypedArray,Le=ke?w(ke):O,Oe=Object.prototype,we=Oe.hasOwnProperty,xe=Object.prototype,Ee=A(Object.keys,Object),Ae=Object.prototype,Te=Ae.hasOwnProperty,Be=V(P,1/0),Fe=function(n,t,e){var r=d(n)?q:Be;r(n,a(t),e)},Ie=D(R),_e=l(Ie),Me=C(R),Ue=V(Me,1),ze=l(Ue),Pe=function(n){var e=t(arguments,1);return function(){var r=t(arguments);return n.apply(null,e.concat(r))}},Ve=W(),qe=function(n,e,r){function u(n,t){j.push(function(){f(n,t)})}function o(){if(0===j.length&&0===v)return r(null,y);for(;j.length&&v<e;){var n=j.shift();n()}}function i(n,t){var e=b[n];e||(e=b[n]=[]),e.push(t)}function c(n){var t=b[n]||[];$(t,function(n){n()}),o()}function f(n,e){if(!d){var u=U(function(e,u){if(v--,arguments.length>2&&(u=t(arguments,1)),e){var o={};N(y,function(n,t){o[t]=n}),o[n]=u,d=!0,b=Object.create(null),r(e,o)}else y[n]=u,c(n)});v++;var o=a(e[e.length-1]);e.length>1?o(y,u):o(u)}}function l(){for(var n,t=0;S.length;)n=S.pop(),t++,$(s(n),function(n){0===--k[n]&&S.push(n)});if(t!==h)throw new Error("async.auto cannot execute tasks due to a recursive dependency")}function s(t){var e=[];return N(n,function(n,r){Pt(n)&&J(n,t,0)>=0&&e.push(r)}),e}"function"==typeof e&&(r=e,e=null),r=g(r||m);var p=B(n),h=p.length;if(!h)return r(null);e||(e=h);var y={},v=0,d=!1,b=Object.create(null),j=[],S=[],k={};N(n,function(t,e){if(!Pt(t))return u(e,[t]),void S.push(e);var r=t.slice(0,t.length-1),o=r.length;return 0===o?(u(e,t),void S.push(e)):(k[e]=o,void $(r,function(c){if(!n[c])throw new Error("async.auto task `"+e+"` has a non-existent dependency `"+c+"` in "+r.join(", "));i(c,function(){o--,0===o&&u(e,t)})}))}),l(),o()},De="[object Symbol]",Re=1/0,Ce=yt?yt.prototype:void 0,$e=Ce?Ce.toString:void 0,We="\\ud800-\\udfff",Ne="\\u0300-\\u036f\\ufe20-\\ufe23",Qe="\\u20d0-\\u20f0",Ge="\\ufe0e\\ufe0f",He="\\u200d",Je=RegExp("["+He+We+Ne+Qe+Ge+"]"),Ke="\\ud800-\\udfff",Xe="\\u0300-\\u036f\\ufe20-\\ufe23",Ye="\\u20d0-\\u20f0",Ze="\\ufe0e\\ufe0f",nr="["+Ke+"]",tr="["+Xe+Ye+"]",er="\\ud83c[\\udffb-\\udfff]",rr="(?:"+tr+"|"+er+")",ur="[^"+Ke+"]",or="(?:\\ud83c[\\udde6-\\uddff]){2}",ir="[\\ud800-\\udbff][\\udc00-\\udfff]",cr="\\u200d",fr=rr+"?",ar="["+Ze+"]?",lr="(?:"+cr+"(?:"+[ur,or,ir].join("|")+")"+ar+fr+")*",sr=ar+fr+lr,pr="(?:"+[ur+tr+"?",tr,or,ir,nr].join("|")+")",hr=RegExp(er+"(?="+er+")|"+pr+sr,"g"),yr=/^\s+|\s+$/g,vr=/^(?:async\s+)?(function)?\s*[^\(]*\(\s*([^\)]*)\)/m,dr=/,/,mr=/(=.+)?(\s*)$/,gr=/((\/\/.*$)|(\/\*[\s\S]*?\*\/))/gm;pn.prototype.removeLink=function(n){return n.prev?n.prev.next=n.next:this.head=n.next,n.next?n.next.prev=n.prev:this.tail=n.prev,n.prev=n.next=null,this.length-=1,n},pn.prototype.empty=function(){for(;this.head;)this.shift();return this},pn.prototype.insertAfter=function(n,t){t.prev=n,t.next=n.next,n.next?n.next.prev=t:this.tail=t,n.next=t,this.length+=1},pn.prototype.insertBefore=function(n,t){t.prev=n.prev,t.next=n,n.prev?n.prev.next=t:this.head=t,n.prev=t,this.length+=1},pn.prototype.unshift=function(n){this.head?this.insertBefore(this.head,n):hn(this,n)},pn.prototype.push=function(n){this.tail?this.insertAfter(this.tail,n):hn(this,n)},pn.prototype.shift=function(){return this.head&&this.removeLink(this.head)},pn.prototype.pop=function(){return this.tail&&this.removeLink(this.tail)},pn.prototype.toArray=function(){for(var n=Array(this.length),t=this.head,e=0;e<this.length;e++)n[e]=t.data,t=t.next;return n},pn.prototype.remove=function(n){for(var t=this.head;t;){var e=t.next;n(t)&&this.removeLink(t),t=e}return this};var br,jr=V(P,1),Sr=function(){return mn.apply(null,t(arguments).reverse())},kr=Array.prototype.concat,Lr=function(n,e,r,u){u=u||m;var o=a(r);Me(n,e,function(n,e){o(n,function(n){return n?e(n):e(null,t(arguments,1))})},function(n,t){for(var e=[],r=0;r<t.length;r++)t[r]&&(e=kr.apply(e,t[r]));return u(n,e)})},Or=V(Lr,1/0),wr=V(Lr,1),xr=function(){var n=t(arguments),e=[null].concat(n);return function(){var n=arguments[arguments.length-1];return n.apply(this,e)}},Er=D(bn(gn,jn)),Ar=C(bn(gn,jn)),Tr=V(Ar,1),Br=Sn("dir"),Fr=V(An,1),Ir=D(bn(Bn,Bn)),_r=C(bn(Bn,Bn)),Mr=V(_r,1),Ur=D(Mn),zr=C(Mn),Pr=V(zr,1),Vr=function(n,t,e,r){r=r||m;var u=a(e);Me(n,t,function(n,t){u(n,function(e,r){return e?t(e):t(null,{key:r,val:n})})},function(n,t){for(var e={},u=Object.prototype.hasOwnProperty,o=0;o<t.length;o++)if(t[o]){var i=t[o].key,c=t[o].val;u.call(e,i)?e[i].push(c):e[i]=[c]}return r(n,e)})},qr=V(Vr,1/0),Dr=V(Vr,1),Rr=Sn("log"),Cr=V(zn,1/0),$r=V(zn,1);br=ft?process.nextTick:ct?setImmediate:r;var Wr=u(br),Nr=function(n,t){var e=a(n);return yn(function(n,t){e(n[0],t)},t,1)},Qr=function(n,t){var e=Nr(n,t);return e.push=function(n,t,r){if(null==r&&(r=m),"function"!=typeof r)throw new Error("task callback must be a function");if(e.started=!0,Pt(n)||(n=[n]),0===n.length)return at(function(){e.drain()});t=t||0;for(var u=e._tasks.head;u&&t>=u.priority;)u=u.next;for(var o=0,i=n.length;o<i;o++){var c={data:n[o],priority:t,callback:r};u?e._tasks.insertBefore(u,c):e._tasks.push(c)}at(e.process)},delete e.unshift,e},Gr=D(Nn),Hr=C(Nn),Jr=V(Hr,1),Kr=function(n,t){t||(t=n,n=null);var e=a(t);return it(function(t,r){function u(n){e.apply(null,t.concat(n))}n?Hn(n,u,r):Hn(u,r)})},Xr=D(bn(Boolean,gn)),Yr=C(bn(Boolean,gn)),Zr=V(Yr,1),nu=Math.ceil,tu=Math.max,eu=V(Zn,1/0),ru=V(Zn,1),uu=function(n,e){function r(t){var e=a(n[o++]);t.push(U(u)),e.apply(null,t)}function u(u){return u||o===n.length?e.apply(null,arguments):void r(t(arguments,1))}if(e=g(e||m),!Pt(n))return e(new Error("First argument to waterfall must be an array of functions"));if(!n.length)return e();var o=0;r([])},ou={applyEach:_e,applyEachSeries:ze,apply:Pe,asyncify:o,auto:qe,autoInject:sn,cargo:vn,compose:Sr,concat:Or,concatLimit:Lr,concatSeries:wr,constant:xr,detect:Er,detectLimit:Ar,detectSeries:Tr,dir:Br,doDuring:kn,doUntil:On,doWhilst:Ln,during:wn,each:En,eachLimit:An,eachOf:Fe,eachOfLimit:P,eachOfSeries:jr,eachSeries:Fr,ensureAsync:Tn,every:Ir,everyLimit:_r,everySeries:Mr,filter:Ur,filterLimit:zr,filterSeries:Pr,forever:Un,groupBy:qr,groupByLimit:Vr,groupBySeries:Dr,log:Rr,map:Ie,mapLimit:Me,mapSeries:Ue,mapValues:Cr,mapValuesLimit:zn,mapValuesSeries:$r,memoize:Vn,nextTick:Wr,parallel:Dn,parallelLimit:Rn,priorityQueue:Qr,queue:Nr,race:Cn,reduce:dn,reduceRight:$n,reflect:Wn,reflectAll:Qn,reject:Gr,rejectLimit:Hr,rejectSeries:Jr,retry:Hn,retryable:Kr,seq:mn,series:Jn,setImmediate:at,some:Xr,someLimit:Yr,someSeries:Zr,sortBy:Kn,timeout:Xn,times:eu,timesLimit:Zn,timesSeries:ru,transform:nt,tryEach:tt,unmemoize:et,until:ut,waterfall:uu,whilst:rt,all:Ir,any:Xr,forEach:En,forEachSeries:Fr,forEachLimit:An,forEachOf:Fe,forEachOfSeries:jr,forEachOfLimit:P,inject:dn,foldl:dn,foldr:$n,select:Ur,selectLimit:zr,selectSeries:Pr,wrapSync:o};n.default=ou,n.applyEach=_e,n.applyEachSeries=ze,n.apply=Pe,n.asyncify=o,n.auto=qe,n.autoInject=sn,n.cargo=vn,n.compose=Sr,n.concat=Or,n.concatLimit=Lr,n.concatSeries=wr,n.constant=xr,n.detect=Er,n.detectLimit=Ar,n.detectSeries=Tr,n.dir=Br,n.doDuring=kn,n.doUntil=On,n.doWhilst=Ln,n.during=wn,n.each=En,n.eachLimit=An,n.eachOf=Fe,n.eachOfLimit=P,n.eachOfSeries=jr,n.eachSeries=Fr,n.ensureAsync=Tn,n.every=Ir,n.everyLimit=_r,n.everySeries=Mr,n.filter=Ur,n.filterLimit=zr,n.filterSeries=Pr,n.forever=Un,n.groupBy=qr,n.groupByLimit=Vr,n.groupBySeries=Dr,n.log=Rr,n.map=Ie,n.mapLimit=Me,n.mapSeries=Ue,n.mapValues=Cr,n.mapValuesLimit=zn,n.mapValuesSeries=$r,n.memoize=Vn,n.nextTick=Wr,n.parallel=Dn,n.parallelLimit=Rn,n.priorityQueue=Qr,n.queue=Nr,n.race=Cn,n.reduce=dn,n.reduceRight=$n,n.reflect=Wn,n.reflectAll=Qn,n.reject=Gr,n.rejectLimit=Hr,n.rejectSeries=Jr,n.retry=Hn,n.retryable=Kr,n.seq=mn,n.series=Jn,n.setImmediate=at,n.some=Xr,n.someLimit=Yr,n.someSeries=Zr,n.sortBy=Kn,n.timeout=Xn,n.times=eu,n.timesLimit=Zn,n.timesSeries=ru,n.transform=nt,n.tryEach=tt,n.unmemoize=et,n.until=ut,n.waterfall=uu,n.whilst=rt,n.all=Ir,n.allLimit=_r,n.allSeries=Mr,n.any=Xr,n.anyLimit=Yr,n.anySeries=Zr,n.find=Er,n.findLimit=Ar,n.findSeries=Tr,n.forEach=En,n.forEachSeries=Fr,n.forEachLimit=An,n.forEachOf=Fe,n.forEachOfSeries=jr,n.forEachOfLimit=P,n.inject=dn,n.foldl=dn,n.foldr=$n,n.select=Ur,n.selectLimit=zr,n.selectSeries=Pr,n.wrapSync=o,Object.defineProperty(n,"__esModule",{value:!0})});

    mw.ps.itemCuration.addClickHandlers();
    
    if ((mw.config.get('wgPageContentModel') !== 'wikibase-item') ||
        (mw.config.get('wgIsRedirect')) ||
        // Do not run on diff pages
        (document.location.search.indexOf('&diff=') !== -1) ||
        // Do not run on history pages
        (document.location.search.indexOf('&action=history') !== -1)) {
      return;
    }
    qid = mw.ps.itemCuration.getQid();
    if (!qid) {
      return debug.log('Did not manage to load the QID.');
    }
    async = window.async;
    async.parallel({
      blacklistedSourceUrls: mw.ps.commons.getBlacklistedSourceUrlsWithCallback,
      whitelistedSourceUrls: mw.ps.commons.getWhitelistedSourceUrlsWithCallback,
      wikidataEntityData: ps.itemCuration.getWikidataEntityData.bind(null, qid),
      freebaseEntityData: ps.itemCuration.getFreebaseEntityData.bind(null, qid),
    }, function(err, results) {
      if (err) {
        reportError(err);
      }
      // See https://www.mediawiki.org/wiki/Wikibase/Notes/JSON
      var wikidataEntityData = results.wikidataEntityData;
      var wikidataClaims = wikidataEntityData.claims || {};

      var freebaseEntityData = results.freebaseEntityData;
      var blacklistedSourceUrls = results.blacklistedSourceUrls;
      var freebaseClaims = ps.itemCuration.parseFreebaseClaims(freebaseEntityData,
          blacklistedSourceUrls);

      ps.itemCuration.matchClaims(wikidataClaims, freebaseClaims);
    });
  })();

  mw.ps = ps;

})(mediaWiki, jQuery);