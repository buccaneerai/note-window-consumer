const get = require('lodash/get');
const {
  from,
  merge
} = require('rxjs');
const { map, mergeMap } = require('rxjs/operators');
const {
  ComprehendMedicalClient,
  InferSNOMEDCTCommand,
  // InferICD10CMCommand,
  // InferRxNormCommand,
 } = require("@aws-sdk/client-comprehendmedical");

const logger = require('@buccaneerai/logging-utils');
const {client} = require('@buccaneerai/graphql-sdk');

const config = require('../lib/config.js');


const medicalClient = new ComprehendMedicalClient({ region: config().AWS_REGION || config().AWS_DEFAULT_REGION });

const toAWSMedicalComprehendAPI = ({
  _client = medicalClient,
}) => text => {
  const snomed = new InferSNOMEDCTCommand({Text: text});
  // const icd10 = new InferICD10CMCommand({Text: text});
  // const rxnorm = new InferRxNormCommand({Text: text});
  return merge(
    from(_client.send(snomed)).pipe(
      map((response) => {
        return {
          type: 'rawSNOMEDCT',
          response,
        };
      })
    ),
    // from(_client.send(icd10)).pipe(
    //   map((response) => {
    //     return {
    //       type: 'rawICD10',
    //       response,
    //     };
    //   })
    // ),
    // from(_client.send(rxnorm)).pipe(
    //   map((response) => {
    //     return {
    //       type: 'rawRXNORM',
    //       response,
    //     };
    //   })
    // )
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

const mapSNOMEDCTToPredictions = (entities = []) => {
  return entities.map((e) => {
      const trait = get(e, 'Traits[0].Name');
      const type = get(e, 'Type');
      let findingCode = null;
      const findingAttributeCode = get(e, 'SNOMEDCTConcepts[0].Code', null);
      if (trait === 'SYMPTOM') {
        findingCode = 'F-Symptom';
      }
      if (trait === 'DIAGNOSIS') {
        findingCode = 'F-Problem';
      }
      if (trait === 'SIGN') {
        findingCode = 'F-Problem';
      }
      if (type === 'TEST_NAME') {
        findingCode = 'F-Problem';  // @TODO Check w/ Brian about this.
        // Should this go in Assement and Plan i.e. F-Problem
        // Example:
        // {
        //  Attributes: [],
        //  BeginOffset: 108,
        //  Category: 'TEST_TREATMENT_PROCEDURE',
        //  EndOffset: 122,
        //  Id: 5,
        //  SNOMEDCTConcepts: [
        //    {
        //      Code: '75367002',
        //      Description: 'Blood pressure (observable entity)',
        //      Score: 0.9221479296684265
        //    }
        //  ],
        //  Score: 0.9959814548492432,
        //  Text: 'blood pressure',
        //  Traits: [],
        //  Type: 'TEST_NAME'
        // }
      }
      if (type === 'TREATMENT_NAME') {
        findingCode = 'F-Problem';
      }
      if (type === 'DX_NAME' && !trait) {
        findingCode = 'F-Symptom';
      }
      if (!findingCode) {
        logger.error('Unable to find findingCode');
        logger.error(JSON.stringify(e));
        findingCode = 'F-Symptom'; // Just capture it for now as a symptom
      }
      if (!findingAttributeCode) {
        logger.error('Unable to find findingAttributeCode');
        logger.error(JSON.stringify(e));
      }
      return {
        findingCode,
        findingAttributeCode,
        findingAttributeKey: 'code', // @TODO There will be other attribute keys
        // in the future like assertions.
      };
  });
};

// @TODO We may want to somehow use these ICD10 codes
// in the future.  In the meantimme the raw response is
// being saved to the note-window.
// const mapICD10ToPredictions = (entities = []) => {
//   return entities.map((e) => {
//   // ...
//   });
//   return [];
// };

// @TODO We will want to use these RXNorm codes
// in the future.  In the meantimme the raw response is
// being saved to the note-window.
// const mapRXNORMToPredictions = (entities = []) => {
//   return entities.map((e) => {
//   // ...
//   });
//   return [];
// };

const mapMedicalComprehendResponseToPredictions = ({
  runId,
  noteWindowId
}) => ({ type, response }) => {
  // @TODO we will have to implement pagination on this, but I HIGHLY doubt
  // we will have pagination on a 20 second note window.  Skipping this for now,
  // but we will want to come back and implement this later.
  let predictions = [];
  if (type === 'rawSNOMEDCT') {
    predictions = mapSNOMEDCTToPredictions(response.Entities || []);
  }
  // else if (type === 'rawICD10') {
  //   predictions = mapICD10ToPredictions(response.Entities || []);
  // }
  // else if (type === 'rawRXNORM') {
  //   predictions = mapRXNORMToPredictions(response.Entities || []);
  // }
  predictions = predictions.map((p) => {
    return {
      ...p,
      runId,
      noteWindowId,
    }
  });
  return predictions;
};

const toMedicalComprehend = ({
  runId,
  noteWindowId,
  _toAWSMedicalComprehendAPI = toAWSMedicalComprehendAPI,
  _mapMedicalComprehendResponseToPredictions = mapMedicalComprehendResponseToPredictions,
  _updateNoteWindow = updateNoteWindow,
} = {}) => words$ => {
  return words$.pipe(
    map((words) => {
      return words.reduce((acc, w) => {
        if (acc.text !== undefined) {
          return `${acc.text} ${w.text}`;
        }
        return (acc ? `${acc} ${w.text}` : w.text);
      });
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

module.exports = toMedicalComprehend;
