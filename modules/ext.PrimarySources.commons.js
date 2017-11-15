/**
 * Commons module.
 * Contains functions used by both the main components:
 * item-based curation and filter.
 */
(function(mw, ps) {
    console.log("Primary sources tool - common functions");
    
    // accessible object
    var commons = {};
    
    /**
   * Return a list of black listed source urls from
   * https://www.wikidata.org/wiki/Wikidata:Primary_sources_tool/URL_blacklist
   * saved in localStorage
   * @returns {*}
   */
    commons.getBlacklistedSourceUrls = function getBlacklistedSourceUrls() {
        var now = Date.now();
        if (localStorage.getItem('f2w_blacklist')) {
            var blacklist = JSON.parse(localStorage.getItem('f2w_blacklist'));
            if (!blacklist.timestamp) {
                blacklist.timestamp = 0;
            }
            if (now - blacklist.timestamp < ps.globals.CACHE_EXPIRY) {
                ps.commons.debug.log('Using cached source URL blacklist');
                return $.Deferred().resolve(blacklist.data);
            }
        }
        return $.ajax({
            url: ps.globals.API_ENDPOINTS.FREEBASE_SOURCE_URL_BLACKLIST,
            data: {
                origin: '*'
            }
        }).then(function(data) {
            if (data && data.parse && data.parse.text && data.parse.text['*']) {
                var blacklist = data.parse.text['*'].replace(/\n/g, '').replace(/^.*?<ul>(.*?)<\/ul>.*?$/g, '$1').replace(/<\/li>/g, '').split('<li>').slice(1).map(function(url) {
                    return url.trim();
                }).filter(function(url) {
                    var copy = url;

                    if (/\s/g.test(copy) || !/\./g.test(copy)) {
                        return false;
                    }
                    if (!/^https?:\/\//.test(copy)) {
                        copy = 'http://' + url;
                    }
                    try {
                        var newUrl = new URL(copy);
                        var resul = newUrl.host !== '';
                        return resul;
                    } catch (e) {
                        console.log("ERROR");
                        console.log(e);
                        return false;
                    }
                });
                ps.commons.debug.log('Caching source URL blacklist');

                localStorage.setItem('f2w_blacklist', JSON.stringify({
                    timestamp: now,
                    data: blacklist
                }));
                return blacklist;
            } else {
                // Fail silently
                ps.commons.debug.log('Could not obtain blacklisted source URLs');
                return [];
            }
        });
    };

    /**
   *
   * @param blacklistedSourceUrls
   * @returns {Function}
   */
    commons.isBlackListedBuilder = function isBlackListedBuilder(blacklistedSourceUrls) {
        return function(url) {
            try {
                var url = new URL(url);
            } catch (e) {
                return false;
            }

            for (var i in blacklistedSourceUrls) {
                if (url.host.indexOf(blacklistedSourceUrls[i]) !== -1) {
                    return true;
                }
            }
            return false;
        }
        ;
    };

    /**
   * Obtain dataset list
   * @param callback
   * @returns {*}
   */
    commons.getPossibleDatasets = function getPossibleDatasets(callback) {
        var now = Date.now();
        if (localStorage.getItem('f2w_dataset')) {
            var blacklist = JSON.parse(localStorage.getItem('f2w_dataset'));
            if (!blacklist.timestamp) {
                blacklist.timestamp = 0;
            }
            if (now - blacklist.timestamp < ps.globals.CACHE_EXPIRY) {
                return callback(blacklist.data);
            }
        }
        $.ajax({
            url: ps.globals.API_ENDPOINTS.FREEBASE_DATASETS,
            data: {
                origin: '*'
            }
        }).done(function(data) {
            localStorage.setItem('f2w_dataset', JSON.stringify({
                timestamp: now,
                data: data
            }));
            return callback(data);
        }).fail(function() {
            ps.commons.debug.log('Could not obtain datasets');
        });
    };

    // BEGIN: format data
    var valueHtmlCache = {};
    commons.getValueHtml = function getValueHtml(value, property) {
        var cacheKey = property + '\t' + value;
        if (cacheKey in valueHtmlCache) {
            return valueHtmlCache[cacheKey];
        }
        var parsed = commons.tsvValueToJson(value);
        var dataValue = {
            type: getValueTypeFromDataValueType(parsed.type),
            value: parsed.value
        };
        var options = {
            'lang': mw.language.getFallbackLanguageChain()[0] || 'en'
        };

        if (parsed.type === 'string') {
            // Link to external database
            valueHtmlCache[cacheKey] = getUrlFormatter(property).then(function(urlFormatter) {
                if (urlFormatter === '') {
                    return parsed.value;
                } else {
                    var url = urlFormatter.replace('$1', parsed.value);
                    return '<a rel="nofollow" class="external free" href="' + url + '">' + parsed.value + '</a>';
                }
            });
        } else if (parsed.type === 'url') {
            valueHtmlCache[cacheKey] = $.Deferred().resolve('<a rel="nofollow" class="external free" href="' + parsed.value + '">' + parsed.value + '</a>');
        } else if (parsed.type === 'wikibase-item' || parsed.type === 'wikibase-property') {
            return getEntityLabel(value).then(function(label) {
                return '<a href="/entity/' + value + '">' + label + '</a>';
                //TODO: better URL
            });
        } else {
            var api = new mw.Api();
            valueHtmlCache[cacheKey] = api.get({
                action: 'wbformatvalue',
                generate: 'text/html',
                datavalue: JSON.stringify(dataValue),
                datatype: parsed.type,
                options: JSON.stringify(options)
            }).then(function(result) {
                // Create links for geocoordinates
                if (parsed.type === 'globe-coordinate') {
                    var url = 'https://tools.wmflabs.org/geohack/geohack.php' + '?language=' + mw.config.get('wgUserLanguage') + '&params=' + dataValue.value.latitude + '_N_' + dataValue.value.longitude + '_E_globe:earth';
                    return '<a rel="nofollow" class="external free" href="' + url + '">' + result.result + '</a>';
                }

                return result.result;
            });
        }

        return valueHtmlCache[cacheKey];
    };
    // END: format data
    
    // BEGIN: Primary sources tool API calls
    // Update the suggestions state
    commons.setStatementState = function setStatementState(quickStatement, state, dataset, type) {
      if (!ps.globals.STATEMENT_STATES[state]) {
        commons.reportError('Invalid statement state');
      }
      var data = {
        qs: quickStatement,
        state: state,
        dataset: dataset,
        type: type,
        user: mw.user.getName()
      };
      return $.post(ps.globals.API_ENDPOINTS.FREEBASE_STATEMENT_APPROVAL_URL, JSON.stringify(data))
      .fail(function() {
        commons.reportError('Set statement state to ' + state + ' failed.');
      });
    };
    // END: Primary sources tool API calls
    
    /* BEGIN: Wikibase API calls */
    // BEGIN: post approved claims to Wikidata
    // https://www.wikidata.org/w/api.php?action=help&modules=wbcreateclaim
    commons.createClaim = function createClaim(subject, predicate, object, qualifiers) {
        var value = (commons.tsvValueToJson(object)).value;
        var api = new mw.Api();
        return api.postWithToken('csrf', {
            action: 'wbcreateclaim',
            entity: subject,
            property: predicate,
            snaktype: 'value',
            value: JSON.stringify(value),
            summary: WIKIDATA_API_COMMENT
        }).then(function(data) {
            // We save the qualifiers sequentially in order to avoid edit conflict
            var saveQualifiers = function() {
                var qualifier = qualifiers.pop();
                if (qualifier === undefined) {
                    return data;
                }

                var value = (commons.tsvValueToJson(qualifier.qualifierObject)).value;
                return api.postWithToken('csrf', {
                    action: 'wbsetqualifier',
                    claim: data.claim.id,
                    property: qualifier.qualifierProperty,
                    snaktype: 'value',
                    value: JSON.stringify(value),
                    summary: WIKIDATA_API_COMMENT
                }).then(saveQualifiers);
            };

            return saveQualifiers();
        });
    };

    // https://www.wikidata.org/w/api.php?action=help&modules=wbsetreference
    commons.createReference = function createReference(subject, predicate, object, sourceSnaks, callback) {
        var api = new mw.Api();
        api.get({
            action: 'wbgetclaims',
            entity: subject,
            property: predicate
        }).then(function(data) {
            var index = -1;
            for (var i = 0, lenI = data.claims[predicate].length; i < lenI; i++) {
                var claimObject = data.claims[predicate][i];
                var mainSnak = claimObject.mainsnak;
                if (mainSnak.snaktype === 'value' && jsonToTsvValue(mainSnak.datavalue, mainSnak.datatype) === object) {
                    index = i;
                    break;
                }
            }
            return api.postWithToken('csrf', {
                action: 'wbsetreference',
                statement: data.claims[predicate][index].id,
                snaks: JSON.stringify(formatSourceForSave(sourceSnaks)),
                summary: WIKIDATA_API_COMMENT
            });
        }).done(function(data) {
            return callback(null, data);
        }).fail(function(error) {
            return callback(error);
        });
    };

    // combines the 2 functions above
    commons.createClaimWithReference = function createClaimWithReference(subject, predicate, object, qualifiers, sourceSnaks) {
        var api = new mw.Api();
        return createClaim(subject, predicate, object, qualifiers).then(function(data) {
            return api.postWithToken('csrf', {
                action: 'wbsetreference',
                statement: data.claim.id,
                snaks: JSON.stringify(formatSourceForSave(sourceSnaks)),
                summary: WIKIDATA_API_COMMENT
            });
        });
    };
    // END: post approved claims to Wikidata

    // BEGIN: get existing claims from Wikidata
    // https://www.wikidata.org/w/api.php?action=help&modules=wbgetclaims
    commons.getClaims = function getClaims(subject, predicate, callback) {
        var api = new mw.Api();
        api.get({
            action: 'wbgetclaims',
            entity: subject,
            property: predicate
        }).done(function(data) {
            return callback(null, data.claims[predicate] || []);
        }).fail(function(error) {
            return callback(error);
        });
    };
    // END:  get existing claims from Wikidata
    function getFewEntityLabels(entityIds) {
      if (entityIds.length === 0) {
        return $.Deferred().resolve({});
      }
      var api = new mw.Api();
      var language = mw.config.get('wgUserLanguage');
      return api.get({
        action: 'wbgetentities',
        ids: entityIds.join('|'),
        props: 'labels',
        languages: language,
        languagefallback: true
      }).then(function(data) {
        var labels = {};
        for (var id in data.entities) {
          var entity = data.entities[id];
          if (entity.labels && entity.labels[language]) {
            labels[id] = entity.labels[language].value;
          } else {
            labels[id] = entity.id;
          }
        }
        return labels;
      });
    }
    /* END: Wikibase API calls */

    // BEGIN: utilities
    commons.debug = {
        log: function(message) {
            if (ps.globals.DEBUG) {
                console.log('PST: ' + message);
            }
        }
    };

    commons.reportError = function reportError(error) {
        mw.notify(error, {
            autoHide: false,
            tag: 'ps-error'
        });
    };

    commons.isUrl = function isUrl(url) {
        if (typeof URL !== 'function') {
            return url.indexOf('http') === 0;
            // TODO: very bad fallback hack
        }

        try {
            url = new URL(url.toString());
            return url.protocol.indexOf('http') === 0 && url.host;
        } catch (e) {
            return false;
        }
    };

    commons.buildValueKeysFromWikidataStatement = function buildValueKeysFromWikidataStatement(statement) {
      var mainSnak = statement.mainsnak;
      if (mainSnak.snaktype !== 'value') {
        return [mainSnak.snaktype];
      }

      var keys = [jsonToTsvValue(mainSnak.datavalue, mainSnak.datatype)];

      if (statement.qualifiers) {
        var qualifierKeyParts = [];
        $.each(statement.qualifiers, function(_, qualifiers) {
          qualifiers.forEach(function(qualifier) {
            qualifierKeyParts.push(
                qualifier.property + '\t' +
                    commons.jsonToTsvValue(qualifier.datavalue, qualifier.datatype)
            );
          });
        });
        qualifierKeyParts.sort();
        keys.push(keys[0] + '\t' + qualifierKeyParts.join('\t'));
      }

      return keys;
    };

    commons.jsonToTsvValue = function jsonToTsvValue(dataValue, dataType) {
      if (!dataValue.type) {
        commons.debug.log('No data value type given');
        return dataValue.value;
      }
      switch (dataValue.type) {
      case 'quantity':
        return dataValue.value.amount;
      case 'time':
        var time = dataValue.value.time;

        // Normalize the timestamp
        if (dataValue.value.precision < 11) {
          time = time.replace('-01T', '-00T');
        }
        if (dataValue.value.precision < 10) {
          time = time.replace('-01-', '-00-');
        }

        return time + '/' + dataValue.value.precision;
      case 'globecoordinate':
        return '@' + dataValue.value.latitude + '/' + dataValue.value.longitude;
      case 'monolingualtext':
        return dataValue.value.language + ':' + JSON.stringify(dataValue.value.text);
      case 'string':
        var str = (dataType === 'url') ? normalizeUrl(dataValue.value)
                                       : dataValue.value;
        return JSON.stringify(str);
      case 'wikibase-entityid':
        switch (dataValue.value['entity-type']) {
          case 'item':
            return 'Q' + dataValue.value['numeric-id'];
          case 'property':
            return 'P' + dataValue.value['numeric-id'];
        }
      }
      commons.debug.log('Unknown data value type ' + dataValue.type);
      return dataValue.value;
    };

    commons.tsvValueToJson = function tsvValueToJson(value) {
      // From https://www.wikidata.org/wiki/Special:ListDatatypes and
      // https://de.wikipedia.org/wiki/Wikipedia:Wikidata/Wikidata_Spielwiese
      // https://www.wikidata.org/wiki/Special:EntityData/Q90.json

      // Q1
      var itemRegEx = /^Q\d+$/;

      // P1
      var propertyRegEx = /^P\d+$/;

      // @43.3111/-16.6655
      var coordinatesRegEx = /^@([+\-]?\d+(?:.\d+)?)\/([+\-]?\d+(?:.\d+))?$/;

      // fr:"Les Misérables"
      var languageStringRegEx = /^(\w+):("[^"\\]*(?:\\.[^"\\]*)*")$/;

      // +2013-01-01T00:00:00Z/10
      /* jshint maxlen: false */
      var timeRegEx = /^[+-]\d+-\d\d-\d\dT\d\d:\d\d:\d\dZ\/\d+$/;
      /* jshint maxlen: 80 */

      // +/-1234.4567
      var quantityRegEx = /^[+-]\d+(\.\d+)?$/;

      if (itemRegEx.test(value)) {
        return {
          type: 'wikibase-item',
          value: {
            'entity-type': 'item',
            'numeric-id': parseInt(value.replace(/^Q/, ''))
          }
        };
      } else if (propertyRegEx.test(value)) {
        return {
          type: 'wikibase-property',
          value: {
            'entity-type': 'property',
            'numeric-id': parseInt(value.replace(/^P/, ''))
          }
        };
      } else if (coordinatesRegEx.test(value)) {
        var latitude = value.replace(coordinatesRegEx, '$1');
        var longitude = value.replace(coordinatesRegEx, '$2');
        return {
          type: 'globe-coordinate',
          value: {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            altitude: null,
            precision: computeCoordinatesPrecision(latitude, longitude),
            globe: 'http://www.wikidata.org/entity/Q2'
          }
        };
      } else if (languageStringRegEx.test(value)) {
        return {
          type: 'monolingualtext',
          value: {
            language: value.replace(languageStringRegEx, '$1'),
            text: JSON.parse(value.replace(languageStringRegEx, '$2'))
          }
        };
      } else if (timeRegEx.test(value)) {
        var parts = value.split('/');
        return {
          type: 'time',
          value: {
            time: parts[0],
            timezone: 0,
            before: 0,
            after: 0,
            precision: parseInt(parts[1]),
            calendarmodel: 'http://www.wikidata.org/entity/Q1985727'
          }
        };
      } else if (quantityRegEx.test(value)) {
        return {
          type: 'quantity',
          value: {
            amount: value,
            unit: '1'
          }
        };
      } else {
        try {
          value = JSON.parse(value);
        } catch(e) { //If it is an invalid JSON we assume it is the value
          if (!(e instanceof SyntaxError)) {
            throw e;
          }
        }
        if (isUrl(value)) {
          return {
            type: 'url',
            value: normalizeUrl(value)
          };
        } else {
          return {
            type: 'string',
            value: value
          };
        }
      }
    };

    commons.parsePrimarySourcesStatement = function parsePrimarySourcesStatement(statement, isBlacklisted) {

      // The full QuickStatement acts as the ID
      var id = statement.statement;
      var dataset = statement.dataset;
      var line = statement.statement.split(/\t/);
      var subject = line[0];
      var predicate = line[1];
      var object = line[2];
      var qualifiers = [];
      var source = [];
      var key = object;
      // Handle any qualifiers and/or sources
      var qualifierKeyParts = [];
      var lineLength = line.length;

      for (var i = 3; i < lineLength; i += 2) {
        if (i === lineLength - 1) {
          commons.debug.log('Malformed qualifier/source pieces');
          break;
        }
        if (/^P\d+$/.exec(line[i])) {
          var qualifierKey = line[i] + '\t' + line[i + 1];
          qualifiers.push({
            qualifierProperty: line[i],
            qualifierObject: line[i + 1],
            key: qualifierKey
          });
          qualifierKeyParts.push(qualifierKey);
        } else if (/^S\d+$/.exec(line[i])) {
          source.push({
            sourceProperty: line[i].replace(/^S/, 'P'),
            sourceObject: line[i + 1],
            sourceType: (commons.tsvValueToJson(line[i + 1])).type,
            sourceId: id,
            key: line[i] + '\t' + line[i + 1]
          });
        }

        qualifierKeyParts.sort();
        key += '\t' + qualifierKeyParts.join('\t');

        // Filter out blacklisted source URLs
        source = source.filter(function(source) {
          if (source.sourceType === 'url') {
            var url = source.sourceObject.replace(/^"/, '').replace(/"$/, '');
            var blacklisted = isBlacklisted(url);
            if (blacklisted) {
              commons.debug.log('Encountered blacklisted reference URL ' + url);
              var sourceQuickStatement = subject + '\t' + predicate + '\t' + object + '\t' + source.key;
              (function(currentId, currentUrl) {
                commons.setStatementState(currentId, commons.STATEMENT_STATES.blacklisted, dataset, 'reference')
                  .done(function() {
                    commons.debug.log('Automatically blacklisted statement ' +
                      currentId + ' with blacklisted reference URL ' +
                      currentUrl);
                  });
              })(sourceQuickStatement, url);
            }
            // Return the opposite, i.e., the whitelisted URLs
            return !blacklisted;
          }
          return true;
        });
      }

      return {
        id: id,
        dataset: dataset,
        subject: subject,
        predicate: predicate,
        object: object,
        qualifiers: qualifiers,
        source: source,
        key: key
      };
    };


    commons.preloadEntityLabels = function preloadEntityLabels(statements) {
      var entityIds = [];
      statements.forEach(function(statement) {
        entityIds = entityIds.concat(extractEntityIdsFromStatement(statement));
      });
      loadEntityLabels(entityIds);
    };

    function extractEntityIdsFromStatement(statement) {
        function isEntityId(str) {
            return /^[PQ]\d+$/.test(str);
        }

        var entityIds = [statement.subject, statement.predicate];

        if (isEntityId(statement.object)) {
            entityIds.push(statement.object);
        }

        statement.qualifiers.forEach(function(qualifier) {
            entityIds.push(qualifier.qualifierProperty);
            if(isEntityId(qualifier.qualifierObject)) {
                entityIds.push(qualifier.qualifierObject);
            }
        });

        statement.source.forEach(function(snak) {
            entityIds.push(snak.sourceProperty);
            if(isEntityId(snak.sourceObject)) {
                entityIds.push(snak.sourceObject);
            }
        });

        return entityIds;
    }


    var entityLabelCache = {};
    // Only called by getValueHtml
    function getEntityLabel(entityId) {
      if(!(entityId in entityLabelCache)) {
        loadEntityLabels([entityId]);
      }

      return entityLabelCache[entityId];
    }
    // The 2 functions below are only called by preloadEntityLabels
    function loadEntityLabels(entityIds) {
      entityIds = entityIds.filter(function(entityId) {
        return !(entityId in entityLabelCache);
      });
      if(entityIds.length === 0) {
        return;
      }

      var promise = getEntityLabels(entityIds);
      entityIds.forEach(function(entityId) {
        entityLabelCache[entityId] = promise.then(function(labels) {
          return labels[entityId];
        });
      });
    }

    function getEntityLabels(entityIds) {
      //Split entityIds per bucket in order to match limits
      var buckets = [];
      var currentBucket = [];

      entityIds.forEach(function(entityId) {
        currentBucket.push(entityId);
        if(currentBucket.length > 40) {
          buckets.push(currentBucket);
          currentBucket = [];
        }
      });
      buckets.push(currentBucket);

      var promises = buckets.map(function(bucket) {
        return getFewEntityLabels(bucket);
      });

      return $.when.apply(this, promises).then(function() {
        return $.extend.apply(this, arguments);
      });
    }

    function formatSourceForSave(sourceSnaks) {
        var result = {};
        sourceSnaks.forEach(function(snak) {
            result[snak.sourceProperty] = [];
        });

        sourceSnaks.forEach(function(snak) {
            var dataValue = commons.tsvValueToJson(snak.sourceObject);
            var type = getValueTypeFromDataValueType(dataValue.type);

            result[snak.sourceProperty].push({
                snaktype: 'value',
                property: snak.sourceProperty,
                datavalue: {
                    type: type,
                    value: dataValue.value
                }
            });
        });

        return result;
    }

    function getValueTypeFromDataValueType(dataValueType) {
        return wikibase.dataTypeStore.getDataType(dataValueType)
            .getDataValueType();
    }

    // END: utilities

    ps.commons = commons;

}(mediaWiki, primarySources));
