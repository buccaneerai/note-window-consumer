const _ = require('lodash');
const {EMPTY,of,merge,throwError} = require('rxjs');
const {catchError,defaultIfEmpty,map,reduce} = require('rxjs/operators');

const logger = require('@buccaneerai/logging-utils');

// const toInfoRetrievalModel = require('../operators/toInfoRetrievalModel');
// const toSpacyModel = require('./toSpacyModel');

const toMedicalComprehend = require('./toMedicalComprehend');
const toQAPipeline = require('./toQAPipeline');

const errors = {
  invalidWords: () => new Error('params.words must be an array'),
};

const mapWordsToString = () => words => words.reduce(
  (acc, w) => `${acc} ${_.get(w, 'text', '')}`,
  ''
);

const pipelines = {
  medicalComprehend: {
    mapToInput: null,
    options: ({ runId, noteWindowId, version='1-0', id='medical-comprehend' }) => {
      return {
        runId,
        noteWindowId,
        pipelineId: `${id}-${version}`,
      };
    },
    operator: toMedicalComprehend,
  },
  topicQAPipeline: {
    mapToInput: mapWordsToString(),
    options: ({ runId, noteWindowId, version = '0-3', id = 'topic-qa-pipeline' }) => ({
      runId, noteWindowId, pipelineId: `${id}-${version}`,
    }),
    operator: toQAPipeline,
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
    if (!_.isArray(words)) return throwError(errors.invalidWords);
    if (words.length === 0) return of(); // no predictions
    const pipelineKeys = Object.keys(_pipelines);
    const observables = pipelineKeys.map(key => of(words).pipe(
      // apply pre-processing step if provided
      map(_.get(_pipelines, `${key}.mapToInput`, null) || (x => x)),
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
