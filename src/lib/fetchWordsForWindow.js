const get = require('lodash/get');
const {map} = require('rxjs/operators');

const {client} = require('@buccaneerai/graphql-sdk');
// const logger = require('@buccaneerai/logging-utils');

const fetchWordsForWindow = ({
  _gql = client,
  // _logger = logger,
  token = process.env.JWT_TOKEN,
  url = process.env.GRAPHQL_URL
} = {}) => ({noteWindowId}) => {
  const words$ = _gql({url, token}).findWords({filter: {noteWindowId}}).pipe(
    map(response => get(response, 'words', [])),
    // catchError((error) => {
    //   _logger.error(`Unable to fetch words for noteWindowId=${noteWindowId}`);
    //   _logger.error(error);
    //   // if we can't fetch any words, just return an empty array
    //   // fail open because otheriwse we won't be able to process whatever
    //   // context we currently have, especially if this is the last note window
    //   return [];
    // })
  );
  return words$;
};

module.exports = fetchWordsForWindow;
