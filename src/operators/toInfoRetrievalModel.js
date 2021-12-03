// const {of,zip} = require('rxjs');
// const {map,mergeMap} = require('rxjs/operators');

// const {client} = require('@buccaneerai/graphql-sdk');

// const relevantWindowsToPredictions = gql => relevantNoteWindows$ => (
//   relevantNoteWindows$.pipe(
//     mergeMap(noteWindows => zip(
//       of(noteWindows),
//       zip(...noteWindows.map(w => gql.findNoteWindows({filter: {_id: w._id}})))
//     )),
//     map(([noteWindows, predictionsForWindows]) => 'TODO')
//   )
// );

// const toInfoRetrievalModel = ({
//   graphqlUrl = process.env.GRAPHQL_URL,
//   token = process.env.JWT_TOKEN,
//   numberOfMatchesToConsider = 20,
//   _client = client,
// } = {}) => ({words}) => {
//   const gql = _client(({url: graphqlUrl, token}));
//   const text = words.reduce((acc, w) => `${acc} ${w.text}`, '');
//   const relevantNoteWindows$ = gql.findRelevantNoteWindows({
//     filter: {text},
//     queryOptions: {limit: numberOfMatchesToConsider},
//   });
//   const predictions$ = relevantNoteWindows$.pipe(
//     relevantWindowsToPredictions(gql)
//   );
//   return predictions$;
// };

// module.exports = toInfoRetrievalModel;
