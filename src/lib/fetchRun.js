const get = require('lodash/get');
const {map} = require('rxjs/operators');

const {client} = require('@buccaneerai/graphql-sdk');


const fetchRun = ({
  _gql = client,
  token = process.env.JWT_TOKEN,
  url = process.env.GRAPHQL_URL
} = {}) => ({runId}) => {
  const runs$ = _gql({url, token}).findRuns({filter: {_id: runId}}).pipe(
    map(response => {
      return get(response, 'runs.0', {});
    })
  );
  return runs$;
};

module.exports = fetchRun;
