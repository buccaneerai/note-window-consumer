const get = require('lodash/get');
const {map,catchError} = require('rxjs/operators');

const {client} = require('@buccaneerai/graphql-sdk');
const logger = require('@buccaneerai/logging-utils');

const fetchWordsForWindow = ({
  _gql = client,
  _logger = logger,
  token = process.env.JWT_TOKEN,
  url = process.env.GRAPHQL_URL
} = {}) => ({noteWindowId}) => {
  const words$ = _gql({url, token}).findWords({filter: {noteWindowId}}).pipe(
    map(response => get(response, 'words', [])),
    catchError((error) => {
      _logger.error('Unable to fetch words');
      _logger.error(error);
      return [];
    })
  );
  return words$;
};

module.exports = fetchWordsForWindow;
