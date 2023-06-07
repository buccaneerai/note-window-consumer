const get = require('lodash/get');
const {map} = require('rxjs/operators');

const {client} = require('@buccaneerai/graphql-sdk');

const fetchNoteWindows = ({
  _gql = client,
  // _logger = logger,
  token = process.env.JWT_TOKEN,
  url = process.env.GRAPHQL_URL
} = {}) => ({limit = 1, sortDir = 1, sortBy = 'windowIndex', filter = {}}) => {
  const noteWindows$ = _gql({url, token}).findNoteWindows({filter, queryOptions: { sortBy, sortDir, limit }}).pipe(
    map(response => {
      if (limit === 1) {
        return get(response, 'noteWindows.0', {});
      }
      return response.noteWindows || [];
    })
  );
  return noteWindows$;
};

module.exports = fetchNoteWindows;
