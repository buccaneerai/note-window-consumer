const { of, from } = require('rxjs');
const get = require('lodash/get');
const { map, mergeMap, toArray, catchError, filter } = require('rxjs/operators');
const {Configuration, OpenAIApi} = require('openai');

const {client} = require('@buccaneerai/graphql-sdk');
const logger = require('@buccaneerai/logging-utils');

const openAiConf = new Configuration({apiKey: process.env.OPENAI_API_KEY});
const openai = new OpenAIApi(openAiConf);

const fetchVerifiedFinding = ({
  runId,
  graphqlUrl = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
  _client = client
}) => (text) => {
  const gql = _client({url: graphqlUrl, token});
  return gql.findVerifiedFindings({
    filter: {
      runId,
      findingCode: "F-ChiefComplaint",
      findingAttributeKey: "text"
    }
  }).pipe(
    map(({verifiedFindings = []}) => {
      return [text, verifiedFindings];
    }),
  );
};

const toOpenAI = ({
  model = 'gpt-4',
  _openai = openai,
  _logger = logger,
}) => ([text, verifiedFindings]) => {
  let verifiedFinding = {stringValues: ['', '']};
  if (verifiedFindings.length) {
    verifiedFinding = verifiedFindings[0]; // eslint-disable-line
  }
  const fullText = `${verifiedFinding.stringValues[1]} ${text}`;
  return from(_openai.createChatCompletion({
    model,
    messages: [
        {"role": "system", "content": "You are an assistant that reads transcripts between a patient and a doctor.  Your job is to answer the following questions about the conversation as accurately as possible. Never write the patient's name, gender or pronouns."},
        {"role": "user", "content": `The following is a transcript between a patient and a doctor: \`${fullText}\``},
        {"role": "user", "content": "With as few words as possible describe the chief complaint."}
    ]
  })).pipe(
    map((response) => {
      const value = get(response, 'data.choices[0].message.content', '');
      return {value, text, fullText, verifiedFinding};
    }),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return null;
    })
  );
};

const mapCodeToPredictions = ({
  pipelineId,
}) => ({
  value,
  fullText,
  verifiedFinding,
}) => {
  const prediction = {
    findingCode: 'F-ChiefComplaint',
    pipelineId,
    _id: verifiedFinding._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value, fullText],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
  return [prediction];
};

const toChiefComplaint = ({
  runId,
  noteWindowId,
  pipelineId,
  model,
  _fetchVerifiedFinding = fetchVerifiedFinding,
  _toOpenAI = toOpenAI,
  _logger = logger,
} = {}) => words$ => {
  return words$.pipe(
    map((words) => {
      return words.reduce((acc, w) => {
        if (acc.text !== undefined) {
          return `${acc.text} ${w.text}`;
        }
        return (acc ? `${acc} ${w.text}` : w.text);
      });
    }),
    filter((f) => f && f.length),
    mergeMap(_fetchVerifiedFinding({
      runId
    })),
    mergeMap(_toOpenAI({
      runId,
      model,
    })),
    map(mapCodeToPredictions({
      runId,
      noteWindowId,
      pipelineId,
    })),
    toArray(),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return of({});
    }),
    map(([predictions]) => {
      return predictions.filter((f) => f.findingCode);
    }),
  )
};

module.exports = toChiefComplaint;
