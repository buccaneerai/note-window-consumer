const isArray = require('lodash/isArray');
const {of,merge,throwError} = require('rxjs');
// const {map} = require('rxjs/operators');

// const toInfoRetrievalModel = require('../operators/toInfoRetrievalModel');
const toSpacyModel = require('./toSpacyModel');
// const toYesNoQATopicModel = require('./toYesNoQATopicModel');
// const toRecSys = require('./toRecSys');
// const toRasaNLU = require('./toRasaNLU');

const errors = {
  invalidWords: () => new Error('params.words must be an array'),
};

const topicPipelines = {
  // infoRetrieval: {
  //   options: () => ({
  //     graphqlUrl: process.env.GRAPHQL_URL,
  //   }),
  //   operator: toInfoRetrievalModel,
  // },
  spacy: {
    options: () => ({
      spacyUrl: process.env.NLP_SERVICE_URL,
    }),
    operator: toSpacyModel,
  },
  // yesNoQATopicModel: {
  //   options: () => ({
  //     url: process.env.TRANSFORMER_SERVICE_URL,
  //   }),
  //   operator: toYesNoQATopicModel,
  // },
  // recSys: {
  //   options: {},
  //   operator: toRecSysModel,
  // },
  // topic: {
  //   options: {},
  //   operator: toTopicModel,
  // },
  // macaw: {
    // options: {},
    // operator: toMacawModel
  // },
  // bert: {
  //   options: {},
  //  operator: toBERTModel,
  // },
  // gpt3:
  //   options: {},
     // operator:  toGPT3Model
  // },
  // graphSimilarity: {
  //   options: {},
      // operator: toGraphSimilarityModel,
  // },
  // spectralClustering: {
  //   options: {},
    // operator: toSpectralClusteringModel
  // },
};

const toPredictions = ({_topicPipelines = topicPipelines} = {}) => ({words}) => {
  if (!isArray(words)) return throwError(errors.invalidWords);
  if (words.length === 0) return of(); // no predictions
  const pipelineKeys = Object.keys(_topicPipelines);
  const observables = pipelineKeys.map(key => of(words).pipe(
    _topicPipelines[key].operator(_topicPipelines[key].options())
  ));
  const predictions$ = merge(...observables);
  return predictions$;
};

module.exports = toPredictions;
