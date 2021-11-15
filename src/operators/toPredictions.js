const {merge} = require('rxjs');
const {map} = require('rxjs/operators');

const toInfoRetrievalModel = '../operators/toInfoRetrievalModel';
const toPatternMatchingModel = '../operators/toPatternMatchingModel';

const pipelines = {
  infoRetrieval: {
    options: {},
    operator: toInfoRetrievalModel,
  },
  spacy: {
    options: {},
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
  const observables = Object.keys(_pipelines).map(key => of(words).pipe(
    _pipelines[key].operator(_pipelines[key].options),
    map(predictions.map(p => ({...p, pipeline: key}))),
  ));
  const predictions$ = merge(...observables);
  return predictions$;
};

module.exports = toPredictions;
      // _getPatternMatchingPredictions()(), // TODO
      // _getRecSysPredictions
      // _getTopicModelPredictions
