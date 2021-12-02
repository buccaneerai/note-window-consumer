const get = require('lodash/get');
const {map} = require('rxjs/operators');

const {client} = require('@buccaneerai/graphql-sdk');

const fetchWordsForWindow = ({
  _gql = client,
  token = process.env.JWT_TOKEN,
  url = process.env.GRAPHQL_URL
} = {}) => ({noteWindowId}) => {
  const words$ = _gql({url, token}).findWords({filter: {noteWindowId}}).pipe(
    map(response => get(response, 'words', []))
  );
  return words$;
};

module.exports = fetchWordsForWindow;
