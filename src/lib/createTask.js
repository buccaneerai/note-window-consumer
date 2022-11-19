const {throwError} = require('rxjs');
const {mergeMap} = require('rxjs/operators');
const {client} = require('@buccaneerai/graphql-sdk');

const errors = {
  noteWindowIdRequired: () => new Error('noteWindowId is required'),
};

const createTask = ({
  noteWindowId,
  _client = client,
  url = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
}) => {
  if (!noteWindowId) return throwError(errors.noteWindowIdRequired());
  const gql = _client({url, token});
  const update$ = gql.createTask({doc: {noteWindowId}}).pipe(
    mergeMap(response => gql.makeTaskReadyToAssign({
      taskId: response.createTask._id
    }))
  );
  return update$;
};

module.exports = createTask;
