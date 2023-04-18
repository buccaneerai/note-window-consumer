const { of, from, forkJoin } = require('rxjs');
const get = require('lodash/get');
const _map = require('lodash/map');
const { map, mergeMap, toArray, catchError, filter } = require('rxjs/operators');
const {Configuration, OpenAIApi} = require('openai');

const {client} = require('@buccaneerai/graphql-sdk');
const logger = require('@buccaneerai/logging-utils');

const sendWordsToTopicModel = require('../lib/sendWordsToTopicModel');
const symptoms = require('../lib/symptoms');

const openAiConf = new Configuration({apiKey: process.env.OPENAI_API_KEY});
const openai = new OpenAIApi(openAiConf);

const fetchVerifiedFindings = ({
  runId,
  graphqlUrl = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
  _client = client
}) => (text) => {
  const gql = _client({url: graphqlUrl, token});
  return gql.findVerifiedFindings({
    filter: {
      runId,
    }
  }).pipe(
    map(({verifiedFindings = []}) => {
      const vfMap = {
        context: [],
        cc: [],
        hpi: [],
        ros: [],
        allergies: [],
        rx: [],
        family: [],
        problems: [],
        social: [],
        pmh: [],
      };
      verifiedFindings.forEach((vf) => {
        if (vf.findingCode === 'F-Context') {
          vfMap.context.push(vf);
        } else if (vf.findingCode === 'F-ChiefComplaint') {
          vfMap.cc.push(vf);
        } else if (vf.findingCode === 'F-Symptom') {
          vfMap.ros.push(vf);
        } else if (vf.findingCode === 'F-Problem') {
          vfMap.problems.push(vf);
        } else if (vf.findingCode.startsWith('F-Hpi')) {
          vfMap.hpi.push(vf);
        } else if (vf.findingCode === 'F-Allergy') {
          vfMap.allergies.push(vf);
        } else if (vf.findingCode === 'F-Medication') {
          vfMap.rx.push(vf);
        } else if (vf.findingCode === 'F-Family') {
          vfMap.family.push(vf);
        } else if (vf.findingCode === 'F-SocialSummary') {
          vfMap.social.push(vf);
        } else if (vf.findingCode === 'F-Pmh') {
          vfMap.pmh.push(vf);
        }
      });
      return [text, vfMap];
    }),
  );
};

const parseSection = (val) => {
  let value = val.trim();
  value = value.replace('Review of systems:', '')
               .replace('Denial of symptoms:', '')
               .replace('Family history:', '')
               .replace('Medications:', '')
               .replace('Social history:', '')
               .replace('Chief complaint:', '')
               .replace('Assessment and plan:', '')
               .replace('Assessment and Plan:', '')
               .replace('History of present illness:', '')
               .replace('Past medical history:', '')
               .replace('List of medications:', '')
               .replace('List of assessment and plan:', '')
               .replace('Symptoms the patient is experiencing:', '')
               .replace('Symptoms patient denies experiencing:', '')
               .replace('The patient has taken:', '')
               .trim();
  const arr = value.split('\n');
  const values = arr.filter((v) => {
    if (!v || !v.length || v === '\n') {
      return false;
    }
    if (v.includes('NONE')) {
      return false;
    }
    const trimmed = v.trim();
    if (!trimmed || !trimmed.length) {
      return false;
    }
    return true;
  });
  return values.map((v) => {
    let _value = v.trim();
    _value = _value.replace(/^\d+\s*[-\\.)]?\s+/g, '');
    // @TODO we may want to move this into it's own function
    _value = _value.replace('CAT Scan', 'CT Scan')
                   .replace('cat scan', 'CT Scan')
                   .replace('CAT scan', 'CT Scan')
                   .replace('Family history of ', '');
    return _value;
  });
};

const parseResponse = (response) => {
  let sections = {
    cc: [],
    hpi: [],
    ros: [],
    rosDenial: [],
    problems: [],
    rx: [],
    family: [],
    allergies: [],
    pmh: [],
    social: [],
  }
  // Split on the "STOP" keyword
  const arr = response.split('STOP');
  // If we don't get the same numnber of questions back, assume something failed.
  const numSections = Object.keys(sections).length;
  if (arr.length !== numSections && arr.length !== numSections + 1) { // configured based on number of questions
    logger.error(`Response from OPENAI did not have the requisite number of sections ${numSections}. Skipping...`);
    console.dir(response); // eslint-disable-line
    return sections;
  }
  sections = {
    cc: parseSection(arr[0]),
    hpi: parseSection(arr[1]),
    ros: parseSection(arr[2]),
    rosDenial: parseSection(arr[3]),
    problems: parseSection(arr[9]),
    rx: parseSection(arr[7]),
    family: parseSection(arr[4]),
    allergies: parseSection(arr[8]),
    pmh: parseSection(arr[5]),
    social: parseSection(arr[6])
  };
  return sections;
};

const toOpenAI = ({
  start = Date.now(),
  model = 'gpt-4',
  _openai = openai,
  _logger = logger,
  _parseResponse = parseResponse,
}) => ([text, vfMap = {}]) => {
  const context = vfMap.context[0] || { stringValues: [] };
  const contextStr = context.stringValues[0] || '[]';
  const contextArr = JSON.parse(contextStr) || [];
  contextArr.push({start, text});
  const sortedStrings = contextArr.sort((a,b) => a.start - b.start);
  const newContext = JSON.stringify(sortedStrings);
  let fullText = _map(sortedStrings, 'text').join(' ');
  const startTime = Date.now();
  return from(_openai.createChatCompletion({
    model,
    temperature: 0.5,
    messages: [
        {"role": "system", "content": `
You are an assistant that reads transcripts between a patient and a doctor to generate a clinical SOAP note. Medical notes require a very high degree of accuracy. Your job is to answer the following questions about the conversation as accurately as possible from the perspective of the doctor. \n
Additionally, you will never write the patient's name, gender or pronouns. After each response, you will say "\nSTOP" or if there is not an adequate answer to the question or enough information to answer the question, you will say "\nNONE\nSTOP". \n
Never include the question in the response.  Medical notes \n
`},
        {"role": "user", "content": `The following is a transcript between a patient and a doctor: "${fullText}"`},
        {"role": "user", "content": `
Write a one-sentence summary of the patient and the primary symptom or issues they presented with: \n
Example: "31-year old patient with history of diabetes presents with worst headache of his life." \n
Example: "Patient with a history of asthma presents with a severe sore throat and feverish feeling." \n
\n
Write a detailed summary of the patient's present illness, symptoms, complaints or issues. The summary should include qualifying information about what makes the symptoms better or worse as well as anything the patient has tried to alleviate the symtpoms.  It should include any questions and answers the doctor asks about the present illness.  Do not include any of the doctor's assessment or plan: \n
Example: \n
"The patient woke up with a severe headache, describing it as the worst pain they've ever had, and it has persisted since 5 AM. The patient felt slightly feverish the night before and has a sick child at home. The pain was so intense that it caused the patient to vomit. The patient tried taking extra strength Tylenol, but it did not help. The doctor asked about additional symptoms like blurred vision, rash, diarrhea, swollen joints, and recent travel, but the patient had none of those. During the physical exam, the patient experienced pain in some parts of the exam." \n
\n
Write a numbered list of symptoms the patient indicated they are experiencing. Include any symptoms the doctor asks the patient if they are experiencing: \n
\n
Write a numbered list of symptoms the patient denied experiencing. Include any symptoms the doctor asks the patient if they are experiencing: \n
\n
Write a numbered list of family history that includes any historical medical information about the patient's family and relatives.  Do not include any recent illness, only historical diagnosis and diseases for relatives of the patient: \n
Example: \n
1. Father has diabetes \n
2. Mother has a history of migraines \n
Example: \n
1. Brother had his gallbladder removed \n
2. Son has asthma \n
\n
Write a numbered list of past medical history that includes information about the patient's past medical conditions, including prior diseases, prior diagnosis, prior surgeries, prior labs, prior conditions, and prior findings. Do not include anything from the family history or the social history: \n
Example: \n
1. Gallbladder removed \n
2. History of asthma \n
Example: \n
1. Hip replacement surgery \n
2. Laser-eye surgery \n
\n
Write a paragraph that includes any information about the patient's social history including; diet, exercise, drug/tobacco/alcohol usage, education, employment, profession/work environment, relationship status, suicide, sexuality or sexual activity, marital or relationship status, and number of children. Do not include any of the patient's family medical history or any of the patient's medical history: \n
Example: "The patient is in retirement, enjoying their life with their spouse in their house. They see their son, who is a doctor, quite often. The patient uses a smart watch for exercise and walking and is not consuming alcohol, not smoking, and not using any other drugs." \n
Example: "The patient has a history of cocaine abuse 10 years ago but currently does not smoke cigarettes or drink alcohol. The patient exercises twice a week and they are married and have 2 children." \n
\n
Write a numbered list of medications that the patient indicates they have previously taken, are currently taking, or deny currently taking and their dosages (if they provide this information). Do not include any medications that the doctor prescribes during the encounter: \n
Example: \n
1. Tylenol 500mg twice a day \n
2. Effexor 25mg once in the morning \n
3. Flovent inhaler \n
Example: \n
1. Cetirizine \n
\n
Write a numbered list of allergies including anything the patient is allergic to or says they are not allergic to. If the patient denies having any or all allergies, say "Patient denied allergies".  If the patient denies having a specific allergy, say "Patient denies allergy to [ALLERGY]".  Otherwise, if the patient asserts or confirms they have an allergy, say, "Patient asserts allergy to [ALLERGY]": \n
Example transcript excerpt: "Do you have any allergies? No, I don't have any allergies." \n
Example answer: \n
1. Patient denied allergies \n
Example transcript excerpt: "Are you allergic to eggs? Yes. Are you allergic to peanuts? No. Are you allergic to any medications? Yes, Oflaxacin, I think." \n
Example answer: \n
1. Patient asserts allergy to egg \n
2. Patient denies allergy to peanuts \n
3. Patient asserts allergy to Oflaxacin \n
\n
Write a numbered list for the assessment and plan which includes any diagnosis, medications and dosages, procedures, referrals, lab orders, or other recommendations the doctor suggests during the transcript. Each item in the list should be of the form '[ASSESSMENT]: [PLAN]'.  The answer MUST include the specifics of anything administered or prescribed during the patient encounter.  The assessment refers to the issue or diagnosis and the plan refers to any action taken against the assessment: \n
Example: \n
1. [ASSESSMENT]: [PLAN] \n
Example: \n
1. Migraine: Order CT Scan and CT angio; Prescribe Effexor (37.5 mg daily), can increase as needed; Schedule follow-up in 1 week \n
2. Allergies: Prescribe Cetirizine; take as needed. \n
Example: \n
1. Meningitis concern: CT Scan, followed by lumbar puncture if needed \n
2. Pain and nausea: Morphine administered during visit; prescribe medication for nausea \n
3. Foot pain: Prescribe Tylenol 500mg, four times daily or as needed \n
`},
//         {"role": "user", "content": `
// What is the chief complaint? After the answer, say 'STOP'. If the chief complaint was not discussed, reply 'NONE\nSTOP'. Do not include the words 'chief complaint' in the answer. \n
// What is the history of present illness? After the answer, say 'STOP'. If the history of present illness was not discussed, reply 'NONE\nSTOP'. Do not include the words 'history of present illness' in the answer. \n
// What were the symptoms? After the answer, say 'STOP'. If there were no symptoms discussed, reply 'NONE\nSTOP'. Do not include the words 'symptoms' in the answer. \n
// What is the denial of symptoms? After the answer, say 'STOP'. If the denial of symptoms was not discussed, reply 'NONE\nSTOP'. Do not include the words 'denial of symptoms' answer. \n
// What is the family history? After the answer, say 'STOP'. If the family history was not discussed, reply 'NONE\nSTOP'. Do not include tthe words 'family history' answer. \n
// What is the past medical history? After the answer, say 'STOP'. If the past medical history was not discussed, reply 'NONE\nSTOP'. Do not include the words 'past medical history' in the answer. \n
// What is the social history? After the answer, say 'STOP'. If the social history was not discussed, reply 'NONE\nSTOP'. Do not include the words 'social history' in the answer. \n
// What is the medications? After the answer, say 'STOP'. If the medications were not discussed, reply 'NONE\nSTOP'. Do not include the words 'medications' in the answer. \n
// What is the allergies? After the answer, say 'STOP'. If the allergies were not discussed, reply 'NONE\nSTOP'. Do not include the words 'allergies' in the answer. \n
// What is the assessment and plan? After the answer, say 'STOP'. If the asssment and plan was not discussed, reply 'NONE\nSTOP'. Do not include the words 'assessment and plan' in the answer. \n
// `}
    ]
  })).pipe(
    map((response) => {
      const endTime = Date.now();
      const duration = parseInt(endTime - startTime, 10);
      const value = get(response, 'data.choices[0].message.content', '');
      const usage = get(response, 'data.usage', {});
      const sections = _parseResponse(value);
      logger.info(`duration: ${duration}`)
      logger.info(`usage: ${JSON.stringify(usage)}`);
      return {sections, text, context, newContext, duration, usage, vfMap};
    }),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return null;
    })
  );
};

const getContextPrediction = ({
  newContext,
  vfMap,
  pipelineId,
}) => {
  const vf = get(vfMap, 'context.0', {});
  return {
    _id: vf._id || null,
    findingCode: 'F-Context',
    pipelineId,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [newContext],
      findingAttributeScore: 1.0,
      pipelineId,
    }]
  };
};

const getChiefComplaintPrediction = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'cc.0', {});
  let value = get(sections, 'cc.0', '');
  if (!value) {
    return {};
  }
  value = value.replace('Primary symptom:', '').trim()
  return {
    findingCode: 'F-ChiefComplaint',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const getHPISummaryPrediction = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'hpi.0', {});
  const value = get(sections, 'hpi.0', '');
  if (!value) {
    return {};
  }
  return {
    findingCode: 'F-HpiSummary',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const getSocialSummaryPrediction = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'social.0', {});
  const value = get(sections, 'social.0', '');
  if (!value) {
    return {};
  }
  return {
    findingCode: 'F-SocialSummary',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const getROSPredictions = ({
  vfMap,
  pipelineId,
  sections = {}
}) => {
  const ros = vfMap.ros || [];
  let assertedSymptoms = get(sections, 'ros', []);
  assertedSymptoms = assertedSymptoms.map((s) => {
    const symptom = symptoms.find(s.label);
    if (symptom) {
      return {
        ...s,
        name: symptom.name,
      };
    }
    return {
      ...s,
      name: s.label.toLowerCase().trim(),
    };
  });
  const assertedLabels = assertedSymptoms.map((a) => a.name.trim().toLowerCase());
  const matchingSymptoms = ros.filter((s) => s.findingAttributeKey === 'code' && assertedLabels.includes(s.findingAttributeDescription.trim().toLowerCase()));
  const matchingSymptomLabels = matchingSymptoms.map((s) => s.findingAttributeDescription);
  const labels = assertedSymptoms.filter((s) => !matchingSymptomLabels.includes(s.name));
  const predictions = labels.map((label) => {

    const symptom = symptoms.find(label.label);
    if (!symptom) {
      return {};
    }
    if (!symptom.sctid) {
      return {};
    }

    const { isAsserted = true } = label;

    const findingCode = 'F-Symptom';
    const context = '';
    const findingAttributeCode = symptom.sctid;
    const findingAttributeScore = label.score || 0.5;
    const findingAttributeDescription = symptom.name;
    const findingAttributeIsAssertedScore = 0.5;
    const findingAttributeIsAssertedDescription = '';

    const findingAttributes = [{
      findingAttributeKey: 'code',
      findingAttributeValue: findingAttributeCode,
      findingAttributeDescription,
      findingAttributeScore,
    }];
    const prediction = {
      findingCode,
      context,
      findingAttributes,
    };
    prediction.findingAttributes.push({
      findingAttributeKey: 'isAsserted',
      findingAttributeValue: isAsserted,
      findingAttributeDescription: findingAttributeIsAssertedDescription,
      findingAttributeScore: findingAttributeIsAssertedScore,
    })
    prediction.findingAttributes.push({
      findingAttributeKey: 'bodySystem',
      findingAttributeValue: symptom.bodySystem,
      findingAttributeScore: 0.5,
    });
    return prediction;
  });

  // Return only entities we found a findingCode for and deduplicate it
  const foundCodes = [];
  const filteredPredictions = predictions.filter((p) => {
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
  });
  return filteredPredictions.map((f) => {
    return {
      ...f,
      pipelineId,
    }
  });
};

const getAllergyPredictions = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vfs = get(vfMap, 'allergies', []);
  const _allergies = get(sections, 'allergies', []);
  const allergies = _allergies.map((a) => {
    return a.trim();
  });
  const matchingAllergies = vfs.filter((s) => s.findingAttributeKey === 'text' && allergies.includes(s.stringValues[0]));
  const matchingAllergiesLabels = matchingAllergies.map((s) => s.stringValues[0]);
  const newAllergies = allergies.filter((s) => !matchingAllergiesLabels.includes(s));
  const predictions = newAllergies.map((a) => {
    return {
      findingCode: 'F-Allergy',
      pipelineId,
      _id: null,
      findingAttributes: [{
        findingAttributeKey: 'text',
        stringValues: [a],
        findingAttributeScore: 0.5,
        pipelineId,
      }]
    };
  });
  return predictions;
};

const getMedicationPredictions = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'rx.0', {});
  const _medications = get(sections, 'rx', []);
  const medications = _medications.map((a) => {
    return a.trim();
  });
  const value = medications.join('\n');
  if (!value) {
    return {};
  }
  return {
    findingCode: 'F-Medication',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const getProblemSummaryPredictions = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'problems.0', {});
  const problems = get(sections, 'problems', []);
  const value = problems.join('\n');
  if (!value) {
    return {};
  }
  return {
    findingCode: 'F-Problem',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const getPmhSummaryPredictions = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'pmh.0', {});
  const pmh = get(sections, 'pmh', []);
  const value = pmh.join('\n');
  if (!value) {
    return {};
  }
  return {
    findingCode: 'F-Pmh',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const getFamilyHistorySummaryPrediction = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'family.0', {});
  const family = get(sections, 'family', []);
  const value = family.join('\n');
  if (!value) {
    return {};
  }
  return {
    findingCode: 'F-Family',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const mapCodeToPredictions = ({
  pipelineId,
}) => ([values]) => {
  let data = {};
  const ros = [];
  values.forEach((v) => {
    if (v.sections) {
      data = v;
    } else if (v.label) {
      ros.push(v);
    }
  });
  // special case for ROS
  data.sections.ros = ros;
  // @TODO
  // const {
  //   duration,
  //   usage,
  // } = data;
  const predictions = [
    getContextPrediction({
      pipelineId,
      ...data
    }),
    getChiefComplaintPrediction({
      pipelineId,
      ...data,
    }),
    getHPISummaryPrediction({
      pipelineId,
      ...data,
    }),
    getROSPredictions({
      pipelineId,
      ...data,
    }),
    getProblemSummaryPredictions({
      pipelineId,
      ...data,
    }),
    getAllergyPredictions({
      pipelineId,
      ...data,
    }),
    getMedicationPredictions({
      pipelineId,
      ...data,
    }),
    getPmhSummaryPredictions({
      pipelineId,
      ...data,
    }),
    getFamilyHistorySummaryPrediction({
      pipelineId,
      ...data,
    }),
    getSocialSummaryPrediction({
      pipelineId,
      ...data,
    })
  ];
  return predictions;
};

const toGPT4 = ({
  runId,
  noteWindowId,
  pipelineId,
  model,
  start,
  endpointName,
  _fetchVerifiedFindings = fetchVerifiedFindings,
  _sendWordsToTopicModel = sendWordsToTopicModel,
  _mapCodeToPredictions = mapCodeToPredictions,
  _toOpenAI = toOpenAI,
  _logger = logger,
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
    filter((f) => f && f.length),
    mergeMap(_fetchVerifiedFindings({
      runId
    })),
    mergeMap(_toOpenAI({
      runId,
      model,
      start,
    })),
    mergeMap(({sections, ...rest}) => {
      let _symptoms = sections.ros || [];
      let _denials = sections.rosDenial || [];
      const gptRequests = _symptoms.map((symptom) => {
        return _sendWordsToTopicModel({
          endpointName,
          returnAllScores: true,
          topK: 1
        })(symptom).pipe(
          map(([response]) => {
            const value = get(response, 'labels.0', {});
            const { label: _label , score } = value;
            let label = _label;
            if (score < 0.25) {
              label = null;
            }
            return {label, score, isAsserted: true};
          })
        );
      });
      const gptRequestsDenials = _denials.map((symptom) => {
        return _sendWordsToTopicModel({
          endpointName,
          returnAllScores: true,
          topK: 1
        })(symptom).pipe(
          map(([response]) => {
            const value = get(response, 'labels.0', {});
            const { label: _label , score } = value;
            let label = _label;
            if (score < 0.25) {
              label = null;
            }
            return {label, score, isAsserted: false};
          })
        );
      });
      return forkJoin(of({sections, ...rest}), ...gptRequests, ...gptRequestsDenials);
    }),
    toArray(),
    map(_mapCodeToPredictions({
      runId,
      noteWindowId,
      pipelineId,
    })),
    toArray(),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return of({});
    }),
    map(([predictions]) => {
      const flat = predictions.flat();
      return flat.filter((f) => f.findingCode);
    })
  )
};

module.exports = toGPT4;
