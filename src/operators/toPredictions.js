const isArray = require('lodash/isArray');
const {of,merge,throwError} = require('rxjs');
const {map} = require('rxjs/operators');

// const toInfoRetrievalModel = require('../operators/toInfoRetrievalModel');
const toSpacyModel = require('./toSpacyModel');

const errors = {
  invalidWords: () => new Error('params.words must be an array'),
};

const pipelines = {
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
  // recSys: {
  //   options: {},
  //   operator: toRecSysModel,
  // },
  // topic: {
  //   options: {},
  //   operator: toTopicModel,
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

const toPredictions = (_pipelines = pipelines) => ({message, words}) => {
  if (!isArray(words)) return throwError(errors.invalidWords);
  if (words.length === 0) return of(); // no predictions
  const pipelineKeys = Object.keys(_pipelines);
  const observables = pipelineKeys.map(key => of(words).pipe(
    _pipelines[key].operator(_pipelines[key].options())
  ));
  const predictions$ = merge(...observables);
  return predictions$;
};

module.exports = toPredictions;
