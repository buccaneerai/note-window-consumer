// const _ = require('lodash');
const {of,merge,zip} = require('rxjs');
const {map,mergeMap,share,toArray} = require('rxjs/operators');

const {client} = require('@buccaneerai/graphql-sdk');

const sendWordsToTopicModel = require('../lib/sendWordsToTopicModel');
const sendWordsToQAModel = require('../lib/sendWordsToQAModel');

const gql = ({
  url = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
}) => client({token, url});

const mapPredictionsToVerifiedFindings = ({
  runId,
  noteWindowId,
  pipelineId
}) => predictions => predictions.map(({findingAttribute, text}) => ({
  runId,
  noteWindowId,
  pipelineId,
  findingCode: findingAttribute.findingCode,
  findingAttributes: [
    {
      findingAttributeCode: findingAttribute.code,
      findingAttributeKey: findingAttribute.key,
      findingAttributeScore: 0.85,
      stringValues: [text],
    }
  ],
}));

const toQAPipeline = ({
  runId,
  noteWindowId,
  pipelineId,
  topicScoreThreshhold = 0.75,
  _gql = gql,
  _sendWordsToQAModel = sendWordsToQAModel,
  _sendWordsToTopicModel = sendWordsToTopicModel,
}) => string$ => {
  const stringSub$ = string$.pipe(share());
  const topicPreds$ = stringSub$.pipe(
    // predict which medical topics were discussed in the transcript
    mergeMap(_sendWordsToTopicModel()),
    // keep only predictions with high confidence
    map(preds => preds.filter(p => p.score > topicScoreThreshhold))
  );
  // calculate the QA predictions for the given topics
  const qaPreds$ = zip(stringSub$, topicPreds$).pipe(
    mergeMap(([string, topicPreds]) => zip(
      of(string),
      _gql().findFindingAttributes({
        filter: {codes: topicPreds.map(p => p.label)}
      }).pipe(map(res => res.findingAttributes))
    )),
    map(([transcriptString, findingAttributes]) => ({
      transcriptString,
      findingAttributes
    })),
    // mergeMap(([string, findingAttributes]) => merge(
    //   ...findingAttributes.map(findingAttribute =>
    //     _sendWordsToQAModel()([string, findingAttribute])
    //   )
    // )),
    mergeMap(_sendWordsToQAModel()),
    map(mapPredictionsToVerifiedFindings({runId, noteWindowId, pipelineId})),
    // toArray(),
  );
  return qaPreds$;
};

module.exports = toQAPipeline;
module.exports.testExports = {

};
