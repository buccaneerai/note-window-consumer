const get = require('lodash/get');
const {
  from,
  merge,
  zip,
  forkJoin,
  of,
} = require('rxjs');
const { map, mergeMap, toArray, catchError } = require('rxjs/operators');
const {
  ComprehendMedicalClient,
  InferSNOMEDCTCommand,
  // InferICD10CMCommand,
  // InferRxNormCommand,
 } = require("@aws-sdk/client-comprehendmedical");

const {Configuration, OpenAIApi} = require('openai');

const logger = require('@buccaneerai/logging-utils');
const {client} = require('@buccaneerai/graphql-sdk');

const symptoms = require('../lib/symptoms');
const getSNOMEDCTCodes = require('../lib/snomedCore');
const config = require('../lib/config');

const SNOMEDCT_CODES = getSNOMEDCTCodes();
const medicalClient = new ComprehendMedicalClient({ region: config().AWS_REGION || config().AWS_DEFAULT_REGION });

const openAiConf = new Configuration({apiKey: process.env.OPENAI_API_KEY});
const openai = new OpenAIApi(openAiConf);

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
  // text = '',
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
      const findingScore = get(e, 'Score', 0.0);

      // Don't include findings with low overall confidence
      if (findingScore < 0.25) {
        return {};
      }

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
          } else if (traitMap.SYMPTOM || Object.keys(traitMap).length === 0) {
            findingCode = 'F-Symptom';
            // @TODO we should predict what the ChiefComplaint "body" should be
            // with a different model, like gpt3 something that can write
            // a summary
            // const {
            //   BeginOffset: _begin,
            //   EndOffset: _end,
            // } = e;
            // let start = _begin - 15;
            // let end = _end + 15;
            // if (start < 0) start = 0;
            // context = `...${text.substring(start, end)}...`;
            context = '';
          }
          // isAsserted
          // @TODO 0.95 is pretty arbitrary, we were getting a lot of false positives
          // from this, I _think_ because the note window is so small
          if (traitMap.NEGATION && traitMap.NEGATION.Score > 0.90) {
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
        if (findingCode === 'F-Symptom' && findingAttributeCodeScore < 0.25) {
          // Do not include symptoms with low confidence
          return {};
        }
        if (findingCode === 'F-Problem' && findingAttributeCodeScore < 0.75) {
          // Do not include diagnosis with low confidence
          // @TODO We can run this against other models
          return {};
        }
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
  return [text, predictions];
};

const toGPT3 = ({
  _logger = logger,
  _openai = openai
}) => ({text, prediction}) => {
  const code = prediction.findingAttributes.find((f) => f.findingAttributeKey === 'code');
  const description = code.findingAttributeDescription.replace('symptom', '').replace('(finding)', '').replace('(disorder)', '').trim().toLowerCase();
  // const isAssert = prediction.findingAttributes.find((f) => f.findingAttributeKey === 'isAsserted');

  const isPresentParams = {
    model: 'text-davinci-003',
    prompt: `The following is a transcript between a doctor and a patient that discusses the patient's symptoms: \n"${text}"\n\
 Q: Was the symptom "${description}" discussed? A: `};

  const isAssertedParams = {
    model: 'text-davinci-003',
    prompt: `The following is a transcript between a doctor and a patient that discusses the patient's symptoms: \n"${text}"\n\
 Q: Did the patient confirm if they the symptom "${description}"? A: `
  };


  let codeObs$;
  if (code.findingAttributeScore < 0.75) {
    _logger.info(`Asking GPT3 if ${description} was discussed, because score was: ${code.findingAttributeScore}`);
    codeObs$ = from(_openai.createCompletion(isPresentParams)).pipe(
      map((response) => {
        const answer = get(response, 'data.choices[0].text', 'yes').trim().toLowerCase();
        if (answer.includes('true') || answer.includes('yes')) {
          return true;
        }
        return false;
      }),
      catchError((error) => {
        _logger.error(error.toJSON ? error.toJSON().message : error);
        return of(true)
      })
    );
  } else {
    _logger.info(`Skipping GPT3 about ${description}, because score was: ${code.findingAttributeScore}`);
    codeObs$ = of(true);
  }

  return zip(
    codeObs$,
    from(_openai.createCompletion(isAssertedParams)).pipe(
      map((response) => {
        const answer = get(response, 'data.choices[0].text', 'yes').trim().toLowerCase();
        if (answer.includes('false') || answer.includes('no')) {
          return false;
        }
        return true;
      }),
      catchError((error) => {
        _logger.error(error.toJSON ? error.toJSON().message : error);
        return of(true);
      })
    ),
  ).pipe(
    map(([isPresent, isAsserted]) => {
      if (!isPresent) {
        // symptom was not actually discussed
        _logger.info(`Skipping ${description} as GPT3 thinks it was not discussed`);
        return {};
      }
      const findingAttributes = prediction.findingAttributes.map((f) => {
        const attr = {
          ...f,
        };
        if (f.findingAttributeKey === 'isAsserted') {
          attr.booleanValues = [isAsserted];
        }
        return attr;
      });
      const resp = {
        ...prediction,
        findingAttributes,
      }
      return resp;
    }),
    catchError(() => of(prediction))
  );
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
    mergeMap(([text, predictions]) => {
      const gptRequests = predictions.map((prediction) => {
        return toGPT3({})({text, prediction});
      });
      return forkJoin(...gptRequests);
    }),
    toArray(),
    map(([predictions]) => predictions.filter((f) => f.findingCode))
  )
};

module.exports = toMedicalComprehend;
