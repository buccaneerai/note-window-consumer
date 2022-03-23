const {mergeMap} = require('rxjs/operators');
const {client} = require('@buccaneerai/graphql-sdk');

const createTask = ({
  noteWindowId,
  _client = client,
  url = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
}) => {
  const gql = _client({url, token});
  const update$ = gql.createTask({noteWindowId}).pipe(
    mergeMap(response => gql.makeTaskReadyToAssign({
      taskId: response.createTask._id
    }))
  );
  return update$;
};

module.exports = createTask;
