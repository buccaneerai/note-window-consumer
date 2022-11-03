const axios = require('axios');
const get = require('lodash/get');
const {from,of,zip} = require('rxjs');
const {map,mergeMap,toList} = require('rxjs/operators');

const reduceWordsToString = require('../lib/reduceWordsToString');

const topics = [
  {
    findingCode: 'BC-chiefComplaintText',
    questions: ['Do they talk about why the patient visited the doctor?'],
    callback: null,
  },
  {
    findingCode: 'BC-hpiQualityString',
    questions: ['Do they talk about how the problem feels?'],
    callback: null,
  },
  {
    findingCode: 'BC-hpiOnset',
    questions: ['Do they talk about when the problem started?'],
    callback: null,
  },
  {
    findingCode: 'BC-hpiTimingString',
    questions: ['Do they talk about how frequently the problem happens?'],
    callback: null,
  },
  {
    findingCode: 'BC-aggravatingFactorsString',
    questions: ['Do they talk about what makes the problem worse?'],
    callback: null,
  },
  {
    findingCode: 'BC-hpiLocationString',
    questions: ['Do they talk about what part of the patient\'s body is affected?'],
    callback: null,
  },
  {
    findingCode: 'BC-relievingFactorsString',
    questions: ['Do they talk about what makes the problem better?'],
    callback: null,
  },
  {
    findingCode: 'BC-hpiSeverityString',
    questions: ['Is severity discussed?'],
    callback: null,
  },
  {
    findingCode: 'SYMPTOM',
    questions: ['Are symptoms discussed?'],
    callback: null,
  },
  {
    findingCode: 'FHIR-FamilyHistoryRecord',
    questions: ['Are medical problems of family members discussed?'],
    callback: null,
  },
  {
    findingCode: 'FHIR-MedicationStatement',
    questions: ['Do they talk about medications the patient is taking?'],
    callback: null,
  },
  {
    findingCode: 'FHIR-AllergyIntolerance',
    questions: ['Are allergies discussed?'],
    callback: null,
  },
  {
    findingCode: 'FHIR-ConditionPreexisting',
    questions: ['Are prior medical conditions discussed?'],
    callback: null,
  },
  {
    findingCode: 'FHIR-ConditionProblem',
    questions: ['Is a diagnosis discussed?'],
    callback: null,
  },
  {
    findingCode: 'FHIR-MedicationRequest',
    questions: ['Is a medication prescribed?'],
    callback: null,
  },
];

const mapToQueries = ({model, _topics = topics}) => wordsString => {
  const queries = _topics.flatMap(t =>
    t.questions.map(q => ({
      model,
      query: q,
      context: wordsString,
      options: {},
      code: t.findingCode,
      callback: t.callback,
    }))
  );
  return queries;
};

const toYesNoQaApi = ({
  url = process.env.TRANSFORMER_SERVICE_URL,
  token = process.env.JWT_TOKEN,
  _axios = axios
} = {}) => ({model, context, query, options}) => from(
  _axios({
    method: 'POST',
    url: `${url}/pipelines`,
    json: true,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {model, context, query, options}
  })
);

const mapResponseToConfidence = () => response => {
  const predictions = get(response, 'data.predictions', null);
  if (!predictions) return null;
  const positivePrediction = predictions.find(p => p.label === 'yes');
  return get(positivePrediction, 'score', null);
};

const mapResponseAndCodeToPrediction = ({
  runId,
  noteWindowId,
  strategy = 'boolQModel',
  model,
  _mapResponseToConfidence = mapResponseToConfidence,
}) => ([response, code]) => ({
  runId,
  noteWindowId,
  strategy,
  model,
  predictionTask: 'topic',
  findingCode: code,
  confidence: _mapResponseToConfidence()(response),
});

const toYesNoQaModel = ({
  runId,
  noteWindowId,
  model = 'roberta_base_qa_yn',
  url = process.env.TRANSFORMER_SERVICE_URL,
  _toYesNoQaApi = toYesNoQaApi,
}) => words$ => words$.pipe(
  map(reduceWordsToString()),
  map(mapToQueries({model})),
  mergeMap(queries => of(...queries)),
  mergeMap(query => zip(_toYesNoQaApi({url})(query), of(query.code))),
  map(mapResponseAndCodeToPrediction({runId, noteWindowId, model})),
  toList()
);

module.exports = toYesNoQaModel;
module.exports.testExports = {
  mapResponseToConfidence,
  mapResponseAndCodeToPrediction,
};
