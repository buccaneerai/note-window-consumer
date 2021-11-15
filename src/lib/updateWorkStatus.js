const {client} = require('@buccaneerai/graphql-sdk');

const updateWorkStatus = ({
  noteWindowId,
  workStatus,
  _client = client,
  url = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
}) => {
  const update$ = _client({url, token}).updateNoteWindow({
    docId: noteWindowId,
    set: {workStatus},
  });
  return update$;
};

module.exports = updateWorkStatus;
