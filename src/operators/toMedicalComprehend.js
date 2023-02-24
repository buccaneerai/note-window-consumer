const get = require('lodash/get');
const {
  from,
  merge,
  // of
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

const symptoms = require('../lib/symptoms');
const getSNOMEDCTCodes = require('../lib/snomedCore');
const config = require('../lib/config');

const SNOMEDCT_CODES = getSNOMEDCTCodes();
const medicalClient = new ComprehendMedicalClient({ region: config().AWS_REGION || config().AWS_DEFAULT_REGION });

const toAWSMedicalComprehendAPI = ({
  _client = medicalClient,
  _logger = logger,
}) => text => {
  const snomed = new InferSNOMEDCTCommand({Text: text});
  // const icd10 = new InferICD10CMCommand({Text: text});
  // const rxnorm = new InferRxNormCommand({Text: text});
  return merge(
    from(_client.send(snomed)).pipe(
      map((response) => {
        if(response.PaginationToken) {
          // @TODO we will have to implement pagination on this, but I HIGHLY doubt
          // we will have pagination on a 20 second note window.  Skipping this for now,
          // but we will want to come back and implement this later, especially
          // if/when we allow for processing the entire transcript in one shot.
          // Need to loop until response.PaginationToken is null
          _logger.error('InferSNOMEDCTCommand returned a PaginationToken and this is not yet implemeted!');
        }
        return {
          type: 'rawSNOMEDCT',
          response,
          text,
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

const cleanDescription = (_text='') => {
  let text = _text;
  // We may want these in the DB, let the front end scrub it
  // during rendering
  // text = text.replace(' (finding)', '');
  // text = text.replace(' (disorder)', '');
  // text = text.replace(' (severity modifier)', '');
  // text = text.replace(' (qualifier value)', '');
  // text = text.replace(' (morphologic abnormality)', '');
  return text
};

const mapSNOMEDCTToPredictions = ({
  entities = [],
  text = '',
  _logger = logger,
}) => {
  let chiefComplaint;
  const predictions = entities.map((e) => {
      let findingCode = null;
      let isAsserted = null;
      let context = '';

      // const type = get(e, 'Type');
      const category = get(e, 'Category');
      const traits = get(e, 'Traits', []);
      const attributes = get(e, 'Attributes', []);

      // attribute code
      let findingAttribute = get(e, 'SNOMEDCTConcepts[0]');
      const findingAttributeCodes = get(e, 'SNOMEDCTConcepts', []);
      const coreCodes = findingAttributeCodes.filter((f) => SNOMEDCT_CODES[f.Code]);
      if (coreCodes.length) {
        [findingAttribute] = coreCodes;
      }
      const findingAttributeCode = findingAttribute.Code || null;
      const findingAttributeCodeScore = findingAttribute.Score || 0.0;
      const findingAttributeCodeDescription = findingAttribute.Description || '';

      // attribute isAsserted
      let findingAttributeIsAssertedScore = 0.0;
      let findingAttributeIsAssertedDescription = '';

      const traitMap = {};
      traits.forEach((t) => {
        traitMap[t.Name] = t;
      });
      const attributeMap = {};
      attributes.forEach((a) => {
        attributeMap[a.Type] = a;
      });

      switch(category) {
        case 'MEDICAL_CONDITION':
          // traits

          // findingCode
          if (traitMap.DIAGNOSIS || traitMap.SIGN || traitMap.HYPOTHETICAL) {
            findingCode = 'F-Problem';
            context = '';
          } else if (traitMap.SYMPTOM) {
            findingCode = 'F-Symptom';
            // const {
            //   BeginOffset: _begin,
            //   EndOffset: _end,
            // } = e;
            // let start = _begin - 15;
            // let end = _end + 15;
            // if (start < 0) start = 0;
            // context = `...${text.substring(start, end)}...`;
            // @TODO we should predict what the ChiefComplaint "body" should be
            // with a different model, like gpt3?  Should be a quick summary.
            context = '';
          }
          // isAsserted
          if (traitMap.NEGATION) {
            isAsserted = false;
            findingAttributeIsAssertedDescription = 'Denies';
            findingAttributeIsAssertedScore = traitMap.NEGATION.Score;
          } else {
            isAsserted = true;
            findingAttributeIsAssertedDescription = 'Asserts';
            findingAttributeIsAssertedScore = 0.5;
          }
          // familyHistory
          if (traitMap.PERTAINS_TO_FAMILY) {
            // @TODO
          }

          // attributes we can potentially capture more information here
          // QUALITY, ACUITY, DIRECTION, SYSTEM_ORGAN_SITE
          // if (attributeMap.QUALITY) {
          //   // @TODO We probably want to store off this code as well
          //   // const qualityCode = get(attributeMap.QUALITY, 'SNOMEDCTConcepts[0].Code', null);
          //   const qualityCodeDescription = get(attributeMap.QUALITY, 'SNOMEDCTConcepts[0].Description', '');
          //   findingAttributeCodeDescription += ` (${qualityCodeDescription})`
          // }
          break;
        default:
          break;
      }

      if (findingCode && findingAttributeCode) {
        const findingAttributes = [{
          findingAttributeKey: 'code',
          findingAttributeValue: findingAttributeCode,
          findingAttributeDescription: cleanDescription(findingAttributeCodeDescription),
          findingAttributeScore: findingAttributeCodeScore,
        }];
        const prediction = {
          findingCode,
          context,
          findingAttributes,
        };
        if (findingCode === 'F-Symptom' && !chiefComplaint) {
          chiefComplaint = {
            ...prediction,
            findingCode: 'F-ChiefComplaint',
            findingAttributes: [...findingAttributes, {
              findingAttributeKey: 'text',
              findingAttributeValue: context,
              findingAttributeDescription: cleanDescription(findingAttributeCodeDescription),
              findingAttributeScore: findingAttributeCodeScore,
            }]
          }
        }
        if (isAsserted === false || isAsserted === true) {
          prediction.findingAttributes.push({
            findingAttributeKey: 'isAsserted',
            findingAttributeValue: isAsserted,
            findingAttributeDescription: findingAttributeIsAssertedDescription,
            findingAttributeScore: findingAttributeIsAssertedScore,
          })
        }
        const bodySystem = symptoms.getBodySystem(findingAttributeCode) || 'unknown';
        prediction.findingAttributes.push({
          findingAttributeKey: 'bodySystem',
          findingAttributeValue: bodySystem,
          findingAttributeScore: 0.5,
        });
        return prediction;
      }
      _logger.info('Unmapped prediction', e);
      return {};
  });

  // Add chief complaint if one doesnt already exist,
  // the attributes will only insert on the mongo side
  // if they dont already exist
  if (chiefComplaint) {
    predictions.push(chiefComplaint);
  }

  // Return only entities we found a findingCode for and deduplicate it
  const foundCodes = [];
  return predictions.filter((p) => {
    if (p.findingCode === 'F-ChiefComplaint') {
      // Don't include the code from the ChiefComplaint in the de-dupe list
      return true;
    }
    if (p.findingCode) {
      const { findingAttributes = [] } = p;
      const [codeAttribute] = findingAttributes;
      if (foundCodes.includes(codeAttribute.findingAttributeValue)) {
        return false;
      }
      foundCodes.push(codeAttribute.findingAttributeValue)
      return true;
    }
    return false;
  })
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
  noteWindowId,
  pipelineId,
}) => ({ type, response, text }) => {
  let predictions = [];
  if (type === 'rawSNOMEDCT') {
    predictions = mapSNOMEDCTToPredictions({
      entities: response.Entities || [],
      text
    });
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
      pipelineId,
    }
  });
  return predictions;
};

const toMedicalComprehend = ({
  runId,
  noteWindowId,
  pipelineId,
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
        pipelineId,
      })
    ),
  )
};

// // eslint-disable-next-line
// const ORIGINAL_TEXT = "Hi, My name is Dr. Feelgood what is your name?  Briar Hayfield. \
// What brings you in today? I have a severe headache, a migraine and an earache in my left ear \
// Okay, when did this start? It started about 2 weeks ago.  I have pain in the back of my head \
// and sometimes I also feel nauseous when I stand up too quick. \
// Okay, do you feel dizzy? No I haven't been dizzy \
// Okay, I think you may have an acute migrain and should take Tylenol and get some sleep."
//
// let WORDS = ORIGINAL_TEXT.split(' ');
// WORDS = WORDS.map((w) => {
//   return {text: w};
// });
//
// const words$ = of(WORDS).pipe(
//   toMedicalComprehend({
//     runId: "63eed062e0f259133bbdd3ae",
//     noteWindowId: "63eed076e0f259133bbdd3b0"
//   })
// );
// words$.subscribe((d) => console.log(d));

module.exports = toMedicalComprehend;
