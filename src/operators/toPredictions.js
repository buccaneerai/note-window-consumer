const {merge} = require('rxjs');
const {map} = require('rxjs/operators');

const toInfoRetrievalModel = '../operators/toInfoRetrievalModel';
const toSpacyModel = '../operators/toSpacyModel';

const pipelines = {
  infoRetrieval: {
    options: () => ({
      graphqlUrl: process.env.GRAPHQL_URL,
    }),
    operator: toInfoRetrievalModel,
  },
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
  const observables = Object.keys(_pipelines).map(key => of(words).pipe(
    _pipelines[key].operator(_pipelines[key].options())
  ));
  const predictions$ = merge(...observables);
  return predictions$;
};

module.exports = toPredictions;
