const {DateTime} = require('luxon');

const {client} = require('@buccaneerai/graphql-sdk');

const timestamp = () => DateTime.now().toISO();

const updateWorkStatus = ({
  noteWindowId,
  _client = client,
  url = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
}) => {
  const update$ = _client({url, token}).updateNoteWindow({
    docId: noteWindowId,
    set: {
      workStatus: 'readyToAnnotate',
      predictionsDone: true,
      timePredictionsDone: timestamp(),
      timeReadyToAnnotate: timestamp(),
    },
  });
  return update$;
};

module.exports = updateWorkStatus;
module.exports.testExports = {timestamp};
