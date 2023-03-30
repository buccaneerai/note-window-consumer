const get = require('lodash/get');
const {map} = require('rxjs/operators');

const {client} = require('@buccaneerai/graphql-sdk');

const fetchNoteWindow = ({
  _gql = client,
  token = process.env.JWT_TOKEN,
  url = process.env.GRAPHQL_URL
} = {}) => ({noteWindowId}) => {
  const noteWindows$ = _gql({url, token}).findNoteWindows({filter: {_id: noteWindowId}}).pipe(
    map(response => {
      return get(response, 'noteWindows.0', {});
    })
  );
  return noteWindows$;
};

module.exports = fetchNoteWindow;
