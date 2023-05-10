const get = require('lodash/get');
const {map,catchError} = require('rxjs/operators');

const {client} = require('@buccaneerai/graphql-sdk');
const logger = require('@buccaneerai/logging-utils');


const fetchNoteWindow = ({
  _gql = client,
  _logger = logger,
  token = process.env.JWT_TOKEN,
  url = process.env.GRAPHQL_URL
} = {}) => ({noteWindowId}) => {
  const noteWindows$ = _gql({url, token}).findNoteWindows({filter: {_id: noteWindowId}}).pipe(
    map(response => {
      return get(response, 'noteWindows.0', {});
    }),
    catchError((error) => {
      _logger.error('Unable to fetch words');
      _logger.error(error);
      return [];
    })
  );
  return noteWindows$;
};

module.exports = fetchNoteWindow;
