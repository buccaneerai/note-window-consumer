const {client} = require('@buccaneerai/graphql-sdk');

const updateNoteWindow = ({
  noteWindowId,
  _client = client,
  url = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
}) => {
  const update$ = _client({url, token}).updateNoteWindow({
    docId: noteWindowId,
    set: {
      queueWindow: true,
    },
  });
  return update$;
};

module.exports = updateNoteWindow;
