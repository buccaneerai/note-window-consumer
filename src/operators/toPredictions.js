const isArray = require('lodash/isArray');
const {EMPTY,of,merge,throwError} = require('rxjs');
const {catchError,defaultIfEmpty,reduce} = require('rxjs/operators');

const logger = require('@buccaneerai/logging-utils');

// const toInfoRetrievalModel = require('../operators/toInfoRetrievalModel');
// const toSpacyModel = require('./toSpacyModel');

// const toMedicalComprehend = require('./toMedicalComprehend');
const toChiefComplaint = require('./toChiefComplaint');
const toHPISummary = require('./toHPISummary');
const toRosTopicModel = require('./toRosTopicModel');
const toProblems = require('./toProblems');

const config = require('../lib/config');

const errors = {
  invalidWords: () => new Error('params.words must be an array'),
};

const pipelines = {
  chiefComplaint: {
    options: ({ runId, noteWindowId, start, version='0-0', id='chief-complaint-gpt-4' }) => {
      return {
        runId,
        noteWindowId,
        start,
        pipelineId: `${id}-${version}`,
        model: 'gpt-4'
      };
    },
    operator: toChiefComplaint,
  },
  hpiSummary: {
    options: ({ runId, noteWindowId, start, version='0-0', id='hpi-summary-gpt-4' }) => {
      return {
        runId,
        noteWindowId,
        start,
        pipelineId: `${id}-${version}`,
        model: 'gpt-4'
      };
    },
    operator: toHPISummary,
  },
  rosTopicModel: {
    options: ({ runId, noteWindowId, start, version='0-0', id='ros-topic-model' }) => {
      return {
        runId,
        noteWindowId,
        start,
        pipelineId: `${id}-${version}`,
        endpointName: config().ROS_TOPIC_MODEL_ENDPOINT || 'huggingface-pytorch-inference-2023-03-08-19-26-49-250'
      };
    },
    operator: toRosTopicModel,
  },
  problems: {
    options: ({ runId, noteWindowId, start, version='0-0', id='problems-gpt-4' }) => {
      return {
        runId,
        noteWindowId,
        start,
        pipelineId: `${id}-${version}`,
        model: 'gpt-4'
      };
    },
    operator: toProblems,
  },
  // medicalComprehend: {
  //   options: ({ runId, noteWindowId, version='1-0', id='medical-comprehend' }) => {
  //     return {
  //       runId,
  //       noteWindowId,
  //       pipelineId: `${id}-${version}`
  //     };
  //   },
  //   operator: toMedicalComprehend,
  // },
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
