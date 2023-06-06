const {client} = require('@buccaneerai/graphql-sdk');

const updateStatus = ({
  runId,
  _client = client,
  url = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
}) => {
  const update$ = _client({url, token}).updateRun({
    docId: runId,
    set: {
      status: 'finished',
    },
  });
  return update$;
};

module.exports = updateStatus;
