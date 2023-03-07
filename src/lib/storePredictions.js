const {concat,forkJoin,of} = require('rxjs');
const {defaultIfEmpty,mergeMap,toArray} = require('rxjs/operators');
const {client} = require('@buccaneerai/graphql-sdk');
const logger = require('@buccaneerai/logging-utils');

const setValues = ({
  findingAttribute,
  findingAttributeKey,
  findingAttributeValue
}) => {
  let valuesKey = null;
  let values = [];

  if (findingAttribute.stringValues) { // pass string values through
    valuesKey = 'stringValues';
    values = findingAttribute.stringValues;
  } else {
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
        values = [findingAttributeValue];
        break;
      case 'bodySystem':
        valuesKey = 'stringValues';
        values = [findingAttributeValue];
        break;
      default:
        // if findingAttributeKey is not one of the above names, then
        // do nothing.
        break;
    }
  }
  return {valuesKey, values};
};

const mapToFinding = ({
  runId,
  noteWindowId,
  findingCode,
  pipelineId,
  findingInstanceId,
  findingType,
  gql,
  _logger = logger
}) => (f) => {
  const {
    findingAttributeKey,
    findingAttributeValue,
    findingAttributeScore = 0.5,
    findingAttributeDescription = '',
  } = f;

  const {valuesKey, values} = setValues({
    findingAttribute: f,
    findingAttributeKey,
    findingAttributeValue,
  });

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
};

const storePredictions = ({
  graphqlUrl = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
  _client = client,
} = {}) => ({predictions}) => {
  const gql = _client({url: graphqlUrl, token});
  const observables = predictions.map(({
    runId,
    noteWindowId,
    findingCode,
    findingAttributes,
    pipelineId,
  }) => {
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
        const findings = findingAttributes.map(
          mapToFinding({
            runId,
            noteWindowId,
            findingCode,
            pipelineId,
            findingInstanceId,
            findingType,
            gql
          })
        );

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
