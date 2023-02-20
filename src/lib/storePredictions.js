const {concat,throwError} = require('rxjs');
const {defaultIfEmpty,mergeMap,tap} = require('rxjs/operators');
const {client} = require('@buccaneerai/graphql-sdk');

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
    findingAttributeCode,
    findingAttributeKey,
  }) => {
    return gql.createFindingInstance({
      runId,
      noteWindowId,
      findingCode,
    }).pipe(
      mergeMap(({createFindingInstance = {}}) => {
        // @TODO There may be different types later on
        let valuesKey = null;
        let values = [];
        if (findingAttributeKey === 'code') {
          valuesKey = 'codeValues';
          values = [findingAttributeCode];
        }
        if (!findingAttributeKey) {
          return throwError('Unimplemented findingAttributeKey');
        }
        const {
          _id: findingInstanceId,
          findingType = 'predicted',
        } = createFindingInstance;
        return gql.createVerifiedFinding({
          findingInstanceId,
          runId,
          noteWindowId,
          findingCode,
          findingType,
          findingAttributeKey,
          [valuesKey]: values,
        }).pipe(
          tap((data) => {
            debugger;
          })
        )
      })
    )
  });
  const result$ = concat(...observables).pipe(
    defaultIfEmpty([])
  );
  return result$;
};

module.exports = storePredictions;
