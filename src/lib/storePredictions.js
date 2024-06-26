const pick = require('lodash/pick');
const {concat,forkJoin,of} = require('rxjs');
const {defaultIfEmpty,mergeMap,toArray} = require('rxjs/operators');
const {client} = require('@buccaneerai/graphql-sdk');
const logger = require('@buccaneerai/logging-utils');

const storePredictions = ({
  graphqlUrl = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
  _client = client,
  _logger = logger,
} = {}) => ({predictions}) => {
  const gql = _client({url: graphqlUrl, token});
  const observables = predictions.map(({
    runId,
    noteWindowId,
    findingCode,
    findingAttributes,
    pipelineId,
    _id,
  }) => {
    // Hacky but works for now, we are going to update a single verifiedFinding
    // instead of creating a new findingInstance and verifiedFinding. We should
    // revisit this later to make it more robust
    if (_id) {
      const findingAttribute = findingAttributes[0] || {};
      const set = pick(findingAttribute, [
        'codeValues',
        'stringValues',
        'numberValues',
        'booleanValues',
        'categoryValues',
        'dateValues',
      ]);
      return gql.updateVerifiedFinding({
        docId: _id,
        set
      })
    }
    return gql.createFindingInstance({
      runId,
      noteWindowId,
      findingCode,
    }).pipe(
      mergeMap(({createFindingInstance = {}}) => {
        const {
          _id: findingInstanceId,
          findingType = 'predicted',
        } = createFindingInstance;

        // iterate over each finding creating its insert observable
        const findings = findingAttributes.map((f) => {
          const {
            findingAttributeKey,
            findingAttributeValue,
            findingAttributeScore = 0.5,
            findingAttributeDescription = '',
            stringValues,
          } = f;
          let valuesKey = null;
          let values = [];

          // @TODO pull the findingAttribute json files from clinical-api
          // not super urgent as I doubt this will be changing much if ever.
          switch(findingAttributeKey) {
            case 'code':
              valuesKey = 'codeValues';
              values = [findingAttributeValue];
              break;
            case 'isAsserted':
              valuesKey = 'booleanValues';
              values = [findingAttributeValue];
              break;
            case 'text':
              valuesKey = 'stringValues';
              if (stringValues) {
                values = stringValues;
              } else {
                values = [findingAttributeValue];
              }
              break;
            case 'bodySystem':
              valuesKey = 'stringValues';
              values = [findingAttributeValue];
              break;
            default:
              break;
          }

          if (!findingAttributeKey) {
            _logger.error(`Unimplemented findingAttribute type ${findingAttributeKey}`);
            return of({});
          }

          const payload = {
            findingInstanceId,
            runId,
            noteWindowId,
            pipelineId,
            findingCode,
            findingType,
            findingAttributeKey,
            findingAttributeDescription,
            findingAttributeScore,
            [valuesKey]: values,
          };

          if (findingCode === 'F-ChiefComplaint') {
            // insert chief complaint finding attributes only
            // if they don't already exist
            payload.filter = {
              runId,
              findingCode,
              findingAttributeKey,
            }
          }

          return gql.createVerifiedFinding(payload);
        });

        return forkJoin(...findings);
      })
    )
  });
  const result$ = concat(...observables).pipe(
    toArray(),
    defaultIfEmpty([])
  );
  return result$;
};

module.exports = storePredictions;
