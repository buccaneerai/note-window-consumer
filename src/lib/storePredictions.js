const {merge} = require('rxjs');
const {client} = require('@buccaneerai/graphql-sdk');

const storePredictions = ({
  graphqlUrl = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
  _client = client,
} = {}) => ({predictions}) => {
  const gql = _client({url: graphqlUrl, token});
  const observables = predictions.map(p => gql.createPredictedFinding(p));
  const result$ = merge(...observables);
  return result$;
};

module.exports = storePredictions;
