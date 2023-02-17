const get = require('lodash/get');
const {DateTime} = require('luxon');
const uniqBy = require('lodash/uniqBy');
const axios = require('axios');
const {
  from,
  of,
  merge
} = require('rxjs');
const { map, mergeMap, reduce, concatMap, tap } = require('rxjs/operators');
const {
  ComprehendMedicalClient,
  InferSNOMEDCTCommand,
  InferICD10CMCommand,
  InferRxNormCommand,
 } = require("@aws-sdk/client-comprehendmedical");
const {client} = require('@buccaneerai/graphql-sdk');

const config = require('../lib/config.js');

const timestamp = () => DateTime.now().toISO();


const ORIGINAL_TEXT = "Patient Briar Hayfield, born June 10th, 1985, presents with a severe headache, nausea and vomiting. Patient blood pressure and blood ox is normal. Took a blood sample to test for norovirus. Prescribing 8 mg of Zofran twice a day and ibuprofen as needed for the headache. I instructed the patient to sleep and stay well hydrated and to schedule a follow-up appointment in 2 weeks.";
let WORDS = ORIGINAL_TEXT.split(' ');
WORDS = WORDS.map((w) => {
  return {text: w};
});


const medicalClient = new ComprehendMedicalClient({ region: config().AWS_REGION || config().AWS_DEFAULT_REGION });

const toAWSMedicalComprehendAPI = ({
  _client = medicalClient,
}) => text => {
  const snomed = new InferSNOMEDCTCommand({Text: text});
  const icd10 = new InferICD10CMCommand({Text: text});
  const rxnorm = new InferRxNormCommand({Text: text});
  return merge(
    from(_client.send(snomed)).pipe(
      map((response) => {
        return {
          type: 'rawSNOMEDCT',
          response,
        };
      })
    ),
    from(_client.send(icd10)).pipe(
      map((response) => {
        return {
          type: 'rawICD10',
          response,
        };
      })
    ),
    from(_client.send(rxnorm)).pipe(
      map((response) => {
        return {
          type: 'rawRXNORM',
          response,
        };
      })
    )
  );
};

const updateNoteWindow = ({
  noteWindowId,
  _client = client,
  url = config().GRAPHQL_URL,
  token = config().JWT_TOKEN,
}) => (results) => {
  const {
    type,
    response
  } = results;
  const update$ = _client({url, token}).updateNoteWindow({
    docId: noteWindowId,
    set: {
      [type]: JSON.stringify(response.Entities || [])
    },
  });
  return update$;
};

const mapMedicalComprehendResponseToPredictions = ({
  runId,
  noteWindowId
}) => (results) => {
  debugger;
  return [];
};

const toMedicalComprehend = ({
  runId,
  noteWindowId,
  _toAWSMedicalComprehendAPI = toAWSMedicalComprehendAPI,
  _mapMedicalComprehendResponseToPredictions = mapMedicalComprehendResponseToPredictions,
  _updateNoteWindow = updateNoteWindow,
} = {}) => words$ => {
  return words$.pipe(
    reduce((acc, w) => {
      if (acc.text) {
        return `${acc.text} ${w.text}`;
      }
      return (acc ? `${acc} ${w.text}` : w.text)
    }),
    mergeMap(_toAWSMedicalComprehendAPI({})),
    mergeMap(
      _updateNoteWindow({
        runId,
        noteWindowId,
      }),
      _mapMedicalComprehendResponseToPredictions({
        runId,
        noteWindowId,
      })
    ),
  )
};

const words$ = of(...WORDS).pipe(
  toMedicalComprehend({
    runId: "63ee8a0b6d8bae7c5dbfa3ef",
    noteWindowId: "63ee8a216d8bae7c5dbfa3f1"
  })
);

words$.subscribe((d) => console.log(d));

module.exports = toMedicalComprehend;
