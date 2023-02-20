const isArray = require('lodash/isArray');
const {EMPTY,of,merge,throwError} = require('rxjs');
const {catchError,defaultIfEmpty,reduce} = require('rxjs/operators');

const logger = require('@buccaneerai/logging-utils');

// const toInfoRetrievalModel = require('../operators/toInfoRetrievalModel');
// const toSpacyModel = require('./toSpacyModel');

const toMedicalComprehend = require('./toMedicalComprehend');

const errors = {
  invalidWords: () => new Error('params.words must be an array'),
};

const pipelines = {
  medicalComprehend: {
    options: ({ runId, noteWindowId }) => {
      return {
        runId,
        noteWindowId,
      };
    },
    operator: toMedicalComprehend,
  },
  // infoRetrieval: {
  //   options: () => ({
  //     graphqlUrl: process.env.GRAPHQL_URL,
  //   }),
  //   operator: toInfoRetrievalModel,
  // },
  // spacy: {
  //   options: () => ({
  //     spacyUrl: process.env.NLP_SERVICE_URL,
  //   }),
  //   operator: toSpacyModel,
  // },
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

const toPredictions = ({_pipelines = pipelines, _logger = logger} = {}) => (
  ({message, words}) => {
    if (!isArray(words)) return throwError(errors.invalidWords);
    if (words.length === 0) return of(); // no predictions
    const pipelineKeys = Object.keys(_pipelines);
    const observables = pipelineKeys.map(key => of(words).pipe(
      _pipelines[key].operator(_pipelines[key].options(message)),
      // handle any uncaught errors in the pipelines
      catchError(err => {
        _logger.error(err);
        return EMPTY;
      })
    ));
    const predictions$ = merge(...observables).pipe(
      // accumulate all predictions into a single flattened array
      reduce((acc, next) => [...acc, ...next], []),
      // if no predictions are emitted, then emit an empty array
      defaultIfEmpty([])
    );
    return predictions$;
  }
);

module.exports = toPredictions;
